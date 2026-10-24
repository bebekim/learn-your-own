import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { createKernel, closeKernel } from '../src/lyo/storage/ledger.ts';
import { TaskFeedback } from '../src/lyo/control/task-feedback.ts';
import { runLyoJson } from './helpers/cli.js';
import { taskFixture as fixture } from './helpers/task-feedback.js';

test('task acceptance and measured cost train a policy that is used in a later repository', () => {
  const f = fixture();
  try {
    let loop = new TaskFeedback(f.kernel);
    for (const [id, draw, source] of [['baseline', 0, 'module.exports = 0;'], ['guided', 0.99, 'module.exports = 42;']]) {
      const registration = f.task(id);
      loop.register(registration);
      const output = loop.prompt('codex', { cwd: registration.cwd, session_id: id, prompt: registration.task.prompt }, () => draw);
      if (draw) assert.match(output.additionalContext, /acceptance criteria/);
      writeFileSync(join(registration.cwd, 'answer.cjs'), source);
      const receipt = loop.finish(id, f.trace(id));
      assert.equal(receipt.episode.outcome.verified_success, Boolean(draw));
      assert.equal(receipt.episode.token_usage.total_tokens, 120);
      assert.equal(receipt.feedback.reward, Number(Boolean(draw)));
      assert.equal(receipt.feedback.evidenceRef, `task-receipt:${id}`);
      assert.equal(receipt.measurement.trace.sha256, createHash('sha256').update(receipt.measurement.trace.content).digest('hex'));
    }
    const policy = loop.freeze('guided');
    assert.equal(policy.training.episodes, 2);
    assert.equal(policy.training.totalTokens, 240);
    closeKernel(f.kernel);
    f.kernel = createKernel({ dbPath: f.db });
    loop = new TaskFeedback(f.kernel);
    const later = f.task('later', { condition: 'learned', policyId: policy.id, split: 'test', initialAnswer: 1 });
    loop.register(later);
    const delivered = loop.prompt('codex', { cwd: later.cwd, session_id: 'later', prompt: later.task.prompt });
    assert.match(delivered.additionalContext, /acceptance criteria/);
    const pending = loop.inspect('later');
    assert.equal(pending.decision.action, 'acceptance-reminder');
    assert.equal(pending.decision.revision, policy.revision);
    assert.deepEqual(pending.decision.estimates.map(e => [e.action, e.count, e.mean]),
      [['no-guidance', 1, 0], ['acceptance-reminder', 1, 1]]);
    writeFileSync(join(later.cwd, 'answer.cjs'), 'module.exports = 42;');
    loop.finish('later', f.trace('later'));
    const report = loop.report(policy.id);
    assert.equal(report.training.totalTokens, 240);
    assert.equal(report.evaluation.baseline_scores[0].verified_success_rate, 1);
    assert.equal(report.decision, 'inconclusive', 'one later task is not evidence of comparative benefit');
    assert.equal(loop.freeze('guided').revision, policy.revision, 'test outcomes cannot train the frozen policy');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('the native CLI delivers a registered task decision and completes it only from acceptance evidence', () => {
  const f = fixture();
  try {
    const registration = f.task('native');
    const path = join(f.dir, 'registration.json');
    const config = join(f.dir, 'config.json');
    writeFileSync(path, JSON.stringify(registration));
    writeFileSync(config, JSON.stringify({ rootDir: f.dir, corpusPath: f.db, adaptiveFeedback: { mode: 'explore' } }));
    const command = args => runLyoJson(['task', ...args, '--db', f.db]);
    command(['register', '--input', path]);
    const hook = event => runLyoJson(['codex-hook', '--db-from-event-cwd', '--spool-dir-from-event-cwd'], {
      input: JSON.stringify({ cwd: registration.cwd, session_id: 'native', ...event }),
      env: { ...process.env, LYO_CONFIG_FILE: config },
    });
    hook({ hook_event_name: 'UserPromptSubmit', prompt: registration.task.prompt });
    hook({ hook_event_name: 'Stop' });
    const pending = command(['inspect', '--attempt-id', 'native']).attempt;
    assert.ok(pending.decision.id);
    assert.equal(pending.receipt, undefined, 'a host Stop is not task acceptance');
    writeFileSync(join(registration.cwd, 'answer.cjs'), 'module.exports = 42;');
    const receipt = command(['finish', '--attempt-id', 'native', '--trace', f.trace('native')]).receipt;
    assert.equal(receipt.feedback.decisionId, pending.decision.id);
    assert.equal(receipt.episode.outcome.verified_success, true);
    assert.equal(receipt.episode.token_usage.total_tokens, 120);
    assert.equal(command(['inspect', '--attempt-id', 'native']).attempt.receipt.feedback.sequence, receipt.feedback.sequence);
    const status = runLyoJson(['control', 'status', '--db', f.db]);
    assert.equal(status.tasks.completed, 1);
    assert.equal(status.tasks.recent[0].taskOutcome, true);
    assert.equal(status.decisions, 0, 'registered tasks do not also train the recovery proxy');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('a still-running host turn cannot yield a complete task reward or hide its unknown cost', () => {
  const f = fixture();
  try {
    const loop = new TaskFeedback(f.kernel);
    const registration = f.task('unfinished');
    loop.register(registration);
    loop.prompt('codex', { cwd: registration.cwd, session_id: 'unfinished', prompt: registration.task.prompt });
    writeFileSync(join(registration.cwd, 'answer.cjs'), 'module.exports = 42;');
    const trace = f.trace('unfinished');
    appendFileSync(trace, '\n' + JSON.stringify({ type: 'turn.started' }));
    const receipt = loop.finish('unfinished', trace);
    assert.equal(receipt.measurement.outcome, null);
    assert.equal(receipt.feedback.reward, null);
    assert.equal(receipt.episode.token_usage, null);
    assert.equal(loop.freeze('unfinished').training.totalTokens, null);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

for (const baselineTokens of [100, 300]) test(`a registered comparison includes training cost when baseline input costs ${baselineTokens}`, () => {
  const f = fixture();
  try {
    const loop = new TaskFeedback(f.kernel);
    for (const [id, draw] of [['train-base', 0], ['train-guided', 0.99]]) {
      const r = f.task(id);
      loop.register(r);
      loop.prompt('codex', { cwd: r.cwd, session_id: id, prompt: r.task.prompt }, () => draw);
      if (draw) writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
      loop.finish(id, f.trace(id));
    }
    const policy = loop.freeze('train-guided');
    const attempts = [];
    const pairs = Array.from({ length: 6 }, (_, i) => {
      const pairId = `pair-${i}`;
      for (const condition of ['baseline', 'learned']) {
        const id = `${pairId}-${condition}`;
        const r = f.task(id, { condition, split: 'selection', initialAnswer: i + 1, ...(condition === 'learned' ? { policyId: policy.id } : {}) });
        r.task.task_id = pairId;
        r.pairId = pairId;
        loop.register(r);
        attempts.push(r);
      }
      return { baselineAttemptId: `${pairId}-baseline`, learnedAttemptId: `${pairId}-learned` };
    });
    loop.registerComparison({ id: 'transfer', policyId: policy.id, pairs, maxTotalTokenRatio: 1 });
    assert.equal(loop.report(policy.id, 'transfer').decision, 'inconclusive', 'unfinished registered attempts remain visible');
    for (const r of attempts) {
      loop.prompt('codex', { cwd: r.cwd, session_id: r.attemptId, prompt: r.task.prompt });
      if (r.condition === 'learned') writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
      loop.finish(r.attemptId, f.trace(r.attemptId, r.condition === 'baseline' ? baselineTokens : 100));
    }
    const report = loop.report(policy.id, 'transfer');
    assert.equal(report.evaluation.gate.decision, 'accept');
    assert.equal(report.decision, baselineTokens === 100 ? 'reject' : 'accept');
    assert.equal(report.totalLearnedTokens, 960);
    assert.equal(report.training.totalTokens, 240);
    assert.throws(() => loop.registerComparison({ id: 'posthoc', policyId: policy.id, pairs, maxTotalTokenRatio: 2 }), /before.*work|already.*started/);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('changing a task id, split and repository directory cannot disguise a training task as later evidence', () => {
  const f = fixture();
  try {
    const loop = new TaskFeedback(f.kernel);
    const r = f.task('training');
    loop.register(r);
    loop.prompt('codex', { cwd: r.cwd, session_id: 'training', prompt: r.task.prompt });
    loop.finish('training', f.trace('training'));
    const policy = loop.freeze('training');
    const duplicate = f.task('renamed', { condition: 'learned', split: 'test', policyId: policy.id });
    assert.throws(() => loop.register(duplicate), /training task/);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('task run launches the host, captures its trace, and records acceptance without a manual finish', () => {
  const f = fixture();
  try {
    const r = f.task('launched');
    const input = join(f.dir, 'launch.json');
    const trace = join(f.dir, 'host.jsonl');
    const host = join(f.dir, 'host.cjs');
    const cli = new URL('../src/cli.ts', import.meta.url).pathname;
    writeFileSync(input, JSON.stringify(r));
    writeFileSync(host, `#!${process.execPath}
const { execFileSync } = require('node:child_process');
const emit = row => console.log(JSON.stringify(row));
emit({ type: 'thread.started', thread_id: 'launched' });
emit({ type: 'turn.started' });
execFileSync(process.execPath, [${JSON.stringify(cli)}, 'codex-hook', '--db-from-event-cwd', '--spool-dir-from-event-cwd'], {
  input: JSON.stringify({ cwd: process.cwd(), session_id: 'launched', hook_event_name: 'UserPromptSubmit', prompt: process.argv.at(-1) }),
  stdio: ['pipe', 'pipe', 'pipe']
});
require('node:fs').writeFileSync('answer.cjs', 'module.exports = 42;');
emit({ type: 'turn.completed', usage: { input_tokens: 100, output_tokens: 20 } });
`, { mode: 0o755 });
    const result = runLyoJson(['task', 'run', '--input', input, '--trace', trace, '--host-binary', host, '--db', f.db]);
    assert.equal(result.ok, true);
    assert.equal(result.host.exitCode, 0);
    assert.equal(result.receipt.feedback.reward, 1);
    assert.equal(result.receipt.episode.token_usage.total_tokens, 120);
    assert.equal(new TaskFeedback(f.kernel).inspect('launched').receipt.feedback.sequence, result.receipt.feedback.sequence);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});
