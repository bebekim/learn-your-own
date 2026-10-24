import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { closeKernel } from '../src/lyo/storage/ledger.ts';
import { taskFixture, startTask } from './helpers/task-feedback.js';

for (const change of ['verifier', 'regression', 'budget']) test(`${change} evidence determines credit independently of a passing acceptance check`, () => {
  const f = taskFixture();
  try {
    const r = f.task(change);
    if (change === 'budget') r.task.budget.max_tokens = 100;
    const loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    if (change === 'verifier') writeFileSync(r.verifierFiles[0], 'process.exit(0);');
    if (change === 'regression') writeFileSync(join(r.cwd, 'stable.cjs'), "module.exports = 'broken';");
    const receipt = loop.finish(change, f.trace(change));
    assert.equal(receipt.episode.outcome.verified_success, change === 'verifier' ? null : change === 'budget');
    assert.equal(receipt.feedback.reward, change === 'verifier' ? null : 0);
    assert.equal(receipt.episode.token_usage.total_tokens, 120);
    assert.equal(loop.freeze(change).training.totalTokens, 120, 'failed and invalid attempts still incur measured cost');
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('foreign traces cannot earn credit, and repeated completion cannot credit the same attempt twice', () => {
  const f = taskFixture();
  try {
    const r = f.task('bound');
    const loop = startTask(f, r);
    assert.throws(() => loop.finish('bound', f.trace('foreign')), /session does not match/);
    assert.equal(loop.inspect('bound').receipt, undefined);
    const trace = f.trace('bound');
    const first = loop.finish('bound', trace);
    assert.deepEqual(loop.finish('bound', trace), first);
    assert.equal(loop.freeze('bound').training.episodes, 1);
    assert.throws(() => loop.finish('bound', f.trace('bound', 300)), /immutable/);
    assert.equal(loop.inspect('bound').receipt.feedback.sequence, first.feedback.sequence);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});

test('Claude task receipts include cache tokens and reported dollar cost exactly once', () => {
  const f = taskFixture();
  try {
    const r = f.task('claude');
    r.runtime = 'claude';
    const loop = startTask(f, r);
    writeFileSync(join(r.cwd, 'answer.cjs'), 'module.exports = 42;');
    const trace = join(f.dir, 'claude.jsonl');
    writeFileSync(trace, [
      { type: 'system', subtype: 'init', session_id: 'claude' },
      { type: 'result', session_id: 'claude', is_error: false, num_turns: 3, total_cost_usd: 0.02,
        usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 400, output_tokens: 20 } },
    ].map(row => JSON.stringify(row)).join('\n'));
    const receipt = loop.finish('claude', trace);
    assert.deepEqual(receipt.episode.token_usage, { total_tokens: 530, estimated_cost: 0.02 });
    assert.equal(receipt.feedback.reward, 1);
  } finally { closeKernel(f.kernel); rmSync(f.dir, { recursive: true, force: true }); }
});
