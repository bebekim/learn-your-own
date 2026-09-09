import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import * as lyo from '../src/index.ts';

const specification = {
  domain: 'coding',
  objective: 'correct-result-within-budget@1',
  evaluator: 'independent-check@1',
  stateSchema: 'verification-context@1',
  actions: ['continue', 'verify'],
  baselineAction: 'continue',
};

test('measured feedback survives restart and changes a later decision in the same situation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-adaptive-'));
  const dbPath = join(dir, 'learning.sqlite');
  let kernel = lyo.createKernel({ dbPath });
  try {
    let controller = new lyo.FeedbackController(kernel, specification);
    const state = { language: 'javascript', verification: 'missing' };
    const before = controller.decide({ episodeId: 'ticket-before', state,
      observationRef: 'ticket-before/state.json', mode: 'evaluate' });
    assert.equal(before.action, 'continue');

    for (const [episodeId, draw, reward] of [['ticket-a', 0, 0], ['ticket-b', 0.9, 1]] as const) {
      const decision = controller.decide({ episodeId, state,
        observationRef: `${episodeId}/state.json`, mode: 'explore' }, () => draw);
      controller.feedback({ decisionId: decision.id, executedAction: decision.action,
        evaluator: specification.evaluator, reward, evidenceRef: `${episodeId}/result.json` });
    }

    lyo.closeKernel(kernel);
    kernel = lyo.createKernel({ dbPath });
    controller = new lyo.FeedbackController(kernel, specification);
    const after = controller.decide({ episodeId: 'new-repository-ticket', state,
      observationRef: 'new-repository/state.json', mode: 'evaluate' });
    assert.equal(after.action, 'verify');
    assert.ok(after.revision > before.revision);
    assert.deepEqual(after.estimates.map(({ action, count, mean }) => ({ action, count, mean })), [
      { action: 'continue', count: 1, mean: 0 },
      { action: 'verify', count: 1, mean: 1 },
    ]);
  } finally {
    lyo.closeKernel(kernel);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('retried decisions and feedback preserve the original choice and count the outcome once', () => {
  withController(controller => {
    const request = { episodeId: 'retry', state: { verification: 'missing' },
      observationRef: 'retry/state.json', mode: 'explore' as const };
    const decision = controller.decide(request, () => 0.9);
    const result = { decisionId: decision.id, executedAction: decision.action,
      evaluator: specification.evaluator, reward: 1, evidenceRef: 'retry/result.json' };
    controller.feedback(result);
    assert.deepEqual(controller.decide(request, () => { throw new Error('must not resample'); }), decision);
    controller.feedback(result);
    const later = controller.decide({ ...request, episodeId: 'later', mode: 'evaluate' });
    assert.equal(later.estimates.find(estimate => estimate.action === 'verify')!.count, 1);
  });
});

function withController(work: (controller: lyo.FeedbackController) => void) {
  const kernel = lyo.createKernel({ dbPath: ':memory:' });
  try { work(new lyo.FeedbackController(kernel, specification)); }
  finally { lyo.closeKernel(kernel); }
}

test('incompatible or malformed feedback cannot train the controller', () => {
  withController(controller => {
    const decision = controller.decide({ episodeId: 'measured', state: { verification: 'missing' },
      observationRef: 'measured/state.json', mode: 'explore' }, () => 0.9);
    const valid = { decisionId: decision.id, executedAction: decision.action,
      evaluator: specification.evaluator, reward: 1, evidenceRef: 'measured/result.json' };
    for (const invalid of [
      { ...valid, evaluator: 'different-check@2' },
      { ...valid, executedAction: 'continue' },
      { ...valid, decisionId: 'not-a-decision' },
      { ...valid, reward: NaN },
      { ...valid, reward: 2 },
      { ...valid, evidenceRef: '' },
    ]) assert.throws(() => controller.feedback(invalid));
    controller.feedback(valid);
    const later = controller.decide({ episodeId: 'next', state: decision.state,
      observationRef: 'next/state.json', mode: 'evaluate' });
    assert.equal(later.estimates.find(estimate => estimate.action === 'verify')!.count, 1);
    assert.throws(() => controller.feedback({ ...valid, reward: 0 }), /conflicting feedback/);
  });
});

test('a frozen policy stays unchanged while later training updates the current policy', () => {
  withController(controller => {
    const state = { verification: 'missing' };
    const train = (episodeId: string, draw: number, reward: number | null) => {
      const decision = controller.decide({ episodeId, state,
        observationRef: `${episodeId}/state.json`, mode: 'explore' }, () => draw);
      controller.feedback({ decisionId: decision.id, executedAction: decision.action,
        evaluator: specification.evaluator, reward, evidenceRef: `${episodeId}/result.json` });
    };
    train('first-continue', 0, 0);
    train('first-verify', 0.9, 1);
    const frozen = controller.decide({ episodeId: 'held-out-1', state,
      observationRef: 'held-out-1/state.json', mode: 'evaluate' });
    controller.feedback({ decisionId: frozen.id, executedAction: frozen.action,
      evaluator: specification.evaluator, reward: 0, evidenceRef: 'held-out-1/result.json' });
    train('missing-outcome', 0.9, null);
    const unchanged = controller.decide({ episodeId: 'held-out-2', state,
      observationRef: 'held-out-2/state.json', mode: 'evaluate' });
    assert.equal(unchanged.revision, frozen.revision);
    for (let i = 0; i < 2; i++) {
      train(`later-continue-${i}`, 0, 1);
      train(`later-verify-${i}`, 0.9, 0);
    }
    const current = controller.decide({ episodeId: 'held-out-current', state,
      observationRef: 'held-out-current/state.json', mode: 'evaluate' });
    assert.equal(current.action, 'continue');
    const replay = controller.decide({ episodeId: 'held-out-frozen', state,
      observationRef: 'held-out-frozen/state.json', mode: 'evaluate', revision: frozen.revision });
    assert.equal(replay.action, 'verify');
    assert.deepEqual(replay.estimates, frozen.estimates);
  });
});

test('one central evaluation cutoff can freeze controllers with different latest measurements', () => {
  const kernel = lyo.createKernel({ dbPath: ':memory:' });
  try {
    const controllers = ['codex', 'claude'].map(domain => new lyo.FeedbackController(kernel, { ...specification, domain }));
    for (const controller of controllers) {
      for (const [episodeId, draw, reward] of [['baseline', 0, 0], ['intervention', 0.9, 1]] as const) {
        const decision = controller.decide({ episodeId, state: {}, observationRef: 'check', mode: 'explore' }, () => draw);
        controller.feedback({ decisionId: decision.id, executedAction: decision.action,
          evaluator: specification.evaluator, reward, evidenceRef: 'result' });
      }
    }
    const revision = controllers[1].inspect('intervention').feedback[0].sequence;
    for (const controller of controllers) {
      const decision = controller.decide({ episodeId: 'held-out', state: {}, observationRef: 'check', mode: 'evaluate', revision });
      assert.equal(decision.revision, revision);
      assert.equal(decision.action, 'verify');
      assert.deepEqual(decision.estimates.map(row => row.count), [1, 1]);
      assert.throws(() => controller.decide({ episodeId: 'future', state: {}, observationRef: 'check',
        mode: 'evaluate', revision: revision + 1 }), /existing feedback/);
    }
  } finally { lyo.closeKernel(kernel); }
});

test('invalid experiment definitions and observations are rejected before making a decision', () => {
  const kernel = lyo.createKernel({ dbPath: ':memory:' });
  try {
    for (const invalid of [
      { ...specification, actions: [] },
      { ...specification, actions: ['continue', 'continue'] },
      { ...specification, baselineAction: 'unavailable' },
      { ...specification, evaluator: '' },
    ]) assert.throws(() => new lyo.FeedbackController(kernel, invalid));
    const controller = new lyo.FeedbackController(kernel, specification);
    const request = { episodeId: 'valid', state: { verification: 'missing' },
      observationRef: 'valid/state.json', mode: 'explore' as const };
    for (const invalid of [
      { ...request, episodeId: '' },
      { ...request, observationRef: '' },
      { ...request, state: { value: NaN } },
      { ...request, state: { value: undefined } },
      { ...request, mode: 'made-up' },
    ]) assert.throws(() => controller.decide(invalid as lyo.ControlRequest));
    for (const draw of [NaN, -0.1, 1]) assert.throws(() => controller.decide(request, () => draw));
    const decision = controller.decide(request, () => 0.9);
    assert.equal(decision.action, 'verify');
    assert.throws(() => controller.decide({ ...request, state: { verification: 'complete' } }), /conflicting decision/);
  } finally { lyo.closeKernel(kernel); }
});

test('a delayed measured result can resolve an unknown outcome while preserving both receipts', () => {
  withController(controller => {
    const decision = controller.decide({ episodeId: 'delayed', state: { verification: 'missing' },
      observationRef: 'delayed/state.json', mode: 'explore' }, () => 0.9);
    const receipt = { decisionId: decision.id, executedAction: decision.action,
      evaluator: specification.evaluator, reward: null, evidenceRef: 'delayed/pending.json' };
    controller.feedback(receipt);
    controller.feedback({ ...receipt, reward: 1, evidenceRef: 'delayed/completed.json' });
    const history = controller.inspect('delayed');
    assert.deepEqual(history.feedback.map(row => row.reward), [null, 1]);
    const later = controller.decide({ episodeId: 'after-delay', state: decision.state,
      observationRef: 'after-delay/state.json', mode: 'evaluate' });
    assert.equal(later.estimates.find(estimate => estimate.action === 'verify')!.count, 1);
  });
});

test('learning transfers between matching observations without mixing states or evaluator versions', () => {
  const kernel = lyo.createKernel({ dbPath: ':memory:' });
  try {
    const controller = new lyo.FeedbackController(kernel, specification);
    const state = { verification: 'missing', language: 'javascript' };
    for (const [action, draw, reward] of [['continue', 0, 0], ['verify', 0.9, 1]] as const) {
      const decision = controller.decide({ episodeId: action, state,
        observationRef: `old-repository/${action}.json`, mode: 'explore' }, () => draw);
      controller.feedback({ decisionId: decision.id, executedAction: action,
        evaluator: specification.evaluator, reward, evidenceRef: `${action}/result.json` });
    }
    const request = { episodeId: 'new-repository', state: { language: 'javascript', verification: 'missing' },
      observationRef: 'new-repository/state.json', mode: 'evaluate' as const };
    assert.equal(controller.decide(request).action, 'verify');
    const unseen = controller.decide({ ...request, episodeId: 'unseen', state: { verification: 'complete' } });
    assert.equal(unseen.action, specification.baselineAction);
    assert.ok(unseen.estimates.every(estimate => estimate.count === 0));
    for (const changed of [{ ...specification, evaluator: 'independent-check@2' },
      { ...specification, domain: 'go' }]) {
      const separate = new lyo.FeedbackController(kernel, changed).decide(request);
      assert.equal(separate.action, specification.baselineAction);
      assert.equal(separate.revision, 0);
      assert.ok(separate.estimates.every(estimate => estimate.count === 0));
    }
  } finally { lyo.closeKernel(kernel); }
});
