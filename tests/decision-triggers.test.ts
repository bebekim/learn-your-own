import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { trialFixture } from './helpers/finding-trial-fixture.ts';
import { inspectFinding } from '../src/lyo/interface/session-findings.ts';
import * as trials from '../src/lyo/interface/finding-trials.ts';
import { decisionQueueDir, sessionTriggerDecisions } from '../src/lyo/interface/finding-decision-triggers.ts';
import { runDecisionWorker } from '../src/lyo/interface/finding-decision-worker.ts';
import { decisionConfigSchema } from '../src/lyo/decisions/providers.ts';
import { claimNextJob, enqueueDecisionJob } from '../src/lyo/decisions/queue.ts';
import type { TypedDecisionProvider } from '../src/lyo/application/typed-decisions.ts';

const config = decisionConfigSchema.parse({ provider: 'mlxcel', mlxcel: { decisionModel: 'test-decider' },
  worker: { idleSeconds: 1, ttlSeconds: 60, maxAgeSeconds: 600, timeoutMs: 1000, maxQueued: 50 } });
const decisions = { config, env: { LYO_DECISION_WORKER: '0' } };
const question = { type: 'score' as const, instructions: 'A JSON parser received input other than the JSON it assumed.',
  criteria: ['1: different cause', '2: probably different', '3: cannot tell', '4: probably this', '5: clearly this'] };
const calibration = { provider: 'mlxcel' as const, model: 'test-decider', positives: 20, negatives: 20, inputFormat: 'command-output@1' as const,
  testHash: 'fixture-test-hash', heldOut: { caught: 18, positives: 20, falseAlarms: 1, negatives: 20, undecided: 1 }, evidence: 'fixture' };

/** A provider that answers a fixed level distribution, counting calls. */
function fakeProvider(probabilities: Record<string, number>) {
  const provider = { name: 'mlxcel', calls: 0, async decide() {
    provider.calls++;
    return { source: 'typed-decision@1' as const, provider: 'mlxcel', requestedModel: 'test-decider', answeredModel: 'test-decider',
      requestHash: 'h', answers: { match: { type: 'score' as const, score: 0, confidence: 0.9, probabilities, legend: {} } },
      usage: null, decidedAt: new Date().toISOString() };
  } };
  return provider as TypedDecisionProvider & { calls: number };
}

function setup() {
  const f = trialFixture();
  const trial = { ...f.trial, id: 'decision-trial', trigger: { toolName: 'Bash', result: 'failure' as const,
    decision: { question, band: { no: 2.5, yes: 4 }, calibration } } };
  trials.registerFindingTrial(f.store, trial);
  const failure = { ...f.event, hook_event_name: 'PostToolUseFailure', tool_response: undefined, tool_use_id: 'fail-1',
    tool_input: { command: 'curl -s https://example.test | python3 -c "import json,sys; json.load(sys.stdin)"' },
    error: 'Exit code 1\nTraceback\njson.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)' };
  const worker = (provider: TypedDecisionProvider) => runDecisionWorker({ storePath: f.storePath, queueDir: decisionQueueDir(f.storePath),
    provider, worker: config.worker, sleep: async () => {}, pollMs: 0 });
  return { f, trial, failure, worker, queue: decisionQueueDir(f.storePath) };
}

test('the hook enqueues a decision job and returns without asking any provider', () => {
  const { f, failure, queue } = setup();
  try {
    const started = Date.now();
    const result = trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
    assert.ok(Date.now() - started < 1000, 'the hook path does no model work');
    assert.equal(result.managed, false, 'nothing is enrolled before a decision lands');
    assert.equal(readdirSync(join(queue, 'incoming')).length, 1);
    assert.equal(inspectFinding(f.store, f.findingId).opportunities.filter(o => o.registered?.sessionId === failure.session_id).length, 0);
  } finally { f.close(); }
});

test('declined calls, mismatched calibrations and missing configuration enqueue nothing', () => {
  const { f, failure, queue } = setup();
  try {
    const declined = { ...failure, tool_use_id: 'declined', error: 'Tool "Bash" was not run because the user rejected the approval' };
    trials.ordinaryFindingTrialFeedback('claude', declined, f.storePath, () => 0.1, decisions);
    const solar = { config: decisionConfigSchema.parse({ provider: 'openrouter' }), env: decisions.env };
    trials.ordinaryFindingTrialFeedback('claude', { ...failure, tool_use_id: 'mismatch' }, f.storePath, () => 0.1, solar);
    trials.ordinaryFindingTrialFeedback('claude', { ...failure, tool_use_id: 'unconfigured' }, f.storePath, () => 0.1, { config: null });
    assert.equal(existsSync(join(queue, 'incoming')) ? readdirSync(join(queue, 'incoming')).length : 0, 0);
  } finally { f.close(); }
});

test('a landed yes enrolls at the next event; both arms are measured from that delivery point', async () => {
  for (const advice of [true, false]) {
    const { f, failure, worker } = setup();
    try {
      trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
      const summary = await worker(fakeProvider({ '0': 0, '1': 0, '2': 0, '3': 0.1, '4': 0.9 }));
      assert.equal(summary.decided, 1);
      const [decision] = sessionTriggerDecisions(f.store.db, failure.session_id);
      assert.equal(decision.verdict, 'yes');
      assert.ok(Math.abs(decision.level! - 4.9) < 1e-9);
      const later = { ...f.event, hook_event_name: 'PostToolUse', tool_use_id: 'later-1', tool_input: { command: 'ls' }, tool_response: { exit_code: 0 } };
      const result = trials.ordinaryFindingTrialFeedback('claude', later, f.storePath, () => advice ? 0.1 : 0.9, decisions);
      assert.equal(result.managed, true);
      assert.equal(Boolean(result.additionalContext), advice);
      const entry = inspectFinding(f.store, f.findingId).opportunities.find(o => o.registered?.sessionId === failure.session_id)!;
      const automatic = entry.registered!.input.prospective!.automatic!;
      assert.equal(automatic.trigger.toolUseId, 'fail-1', 'the opportunity names the failure that triggered it');
      assert.equal(automatic.decisionRef, decision.id);
      f.complete('claude', { ...later, tool_use_id: 'repair-1', tool_input: { command: 'next action' } }, { applicable: true, followed: advice, predicted: true });
      const done = inspectFinding(f.store, f.findingId).opportunities.find(o => o.id === entry.id)!;
      assert.equal(done.evidence?.assignment?.action, advice ? 'advice' : 'no-advice');
      assert.equal(done.evidence?.observedOutcome, 'pass');
    } finally { f.close(); }
  }
});

test('a no or between decision does not enroll; a prompt boundary can also deliver', async () => {
  for (const [probabilities, verdict] of [[{ '0': 0.9, '1': 0.1, '2': 0, '3': 0, '4': 0 }, 'no'], [{ '0': 0, '1': 0, '2': 1, '3': 0, '4': 0 }, 'between']] as const) {
    const { f, failure, worker } = setup();
    try {
      trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
      await worker(fakeProvider(probabilities));
      assert.equal(sessionTriggerDecisions(f.store.db, failure.session_id)[0].verdict, verdict);
      const prompt = { ...f.event, hook_event_name: 'UserPromptSubmit', tool_use_id: undefined };
      assert.equal(trials.ordinaryFindingTrialFeedback('claude', prompt, f.storePath, () => 0.1, decisions).managed, false);
    } finally { f.close(); }
  }
  const { f, failure, worker } = setup();
  try {
    trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
    await worker(fakeProvider({ '0': 0, '1': 0, '2': 0, '3': 0, '4': 1 }));
    const prompt = { ...f.event, hook_event_name: 'UserPromptSubmit', tool_use_id: undefined };
    assert.equal(trials.ordinaryFindingTrialFeedback('claude', prompt, f.storePath, () => 0.1, decisions).managed, true);
  } finally { f.close(); }
});

test('the worker expires stale jobs, records provider errors as unknown, and never decides a job twice', async () => {
  const { f, failure, worker, queue } = setup();
  try {
    const failing = { name: 'mlxcel', async decide() { throw new Error('model unavailable'); } } as TypedDecisionProvider;
    trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
    await worker(failing);
    assert.equal(sessionTriggerDecisions(f.store.db, failure.session_id)[0].verdict, 'unknown');
    assert.match(sessionTriggerDecisions(f.store.db, failure.session_id)[0].reason!, /model unavailable/);

    const trialHash = trials.findingTrials(f.store.db).find(t => t.id === 'decision-trial')!.hash;
    enqueueDecisionJob(queue, { jobId: 'stale', sessionId: 'old-session', runtime: 'claude', cwd: f.target.cwd, model: 'test-model',
      createdAt: '2020-01-01T00:00:00Z', trialHashes: [trialHash], trigger: { eventName: 'PostToolUseFailure', toolUseId: 'x', inputHash: 'i', responseHash: 'r' },
      state: 'Command:\nx', inputFormat: 'command-output@1' }, 50);
    const provider = fakeProvider({ '4': 1 });
    await worker(provider);
    assert.equal(sessionTriggerDecisions(f.store.db, 'old-session')[0].verdict, 'expired');
    assert.equal(provider.calls, 0, 'an expired job is not sent to the provider');

    // A crash after storing a decision but before deleting its job: the restarted worker skips it.
    enqueueDecisionJob(queue, { jobId: 'stale', sessionId: 'old-session', runtime: 'claude', cwd: f.target.cwd, model: 'test-model',
      createdAt: new Date().toISOString(), trialHashes: [trialHash], trigger: { eventName: 'PostToolUseFailure', toolUseId: 'x', inputHash: 'i', responseHash: 'r' },
      state: 'Command:\nx', inputFormat: 'command-output@1' }, 50);
    await worker(provider);
    assert.equal(provider.calls, 0);
    assert.equal(sessionTriggerDecisions(f.store.db, 'old-session').length, 1);
    assert.equal(claimNextJob(queue), null, 'the duplicate job was consumed');
  } finally { f.close(); }
});

test('a second worker exits at once while the first holds the lock', async () => {
  const { f, failure, worker } = setup();
  try {
    trials.ordinaryFindingTrialFeedback('claude', failure, f.storePath, () => 0.1, decisions);
    let release!: () => void;
    const slow = { name: 'mlxcel', decide: () => new Promise<never>((_, reject) => { release = () => reject(new Error('stopped')); }) } as TypedDecisionProvider;
    const first = worker(slow);
    await new Promise(r => setTimeout(r, 20));
    const second = await worker(fakeProvider({ '4': 1 }));
    assert.equal(second.started, false);
    release();
    assert.equal((await first).started, true);
  } finally { f.close(); }
});
