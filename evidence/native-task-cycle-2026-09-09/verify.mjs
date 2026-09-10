import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [phase, scenario] = process.argv.slice(2);
const { buildEvalReport } = await import(pathToFileURL(join(process.cwd(), 'src/eval/report.ts')));
const { readEvalTask } = await import(pathToFileURL(join(process.cwd(), 'src/eval/tasks.ts')));
const options = { baselineId: 'B0', treatmentId: 'B4', ruleId: 'pilot-rule' };
const budget = { max_turns: 10, max_wall_time_seconds: 60, max_tokens: 100000 };
function rows(baseTokens = 100, treatmentTokens = 50) {
  return Array.from({ length: 6 }, (_, i) => ['B0', 'B4'].map(b => ({
    episode_id: `${i}-${b}`, task_id: `task-${i}`, pair_id: `pair-${i}`, baseline_id: b,
    episode_kind: 'agent', split: 'selection', task_fingerprint: String(i).repeat(64), verifier_sha256: 'a'.repeat(64),
    model: 'pilot-model', harness: 'pilot-harness', budget: { ...budget }, allowed_tools: ['shell', 'edit'],
    trace_ref: 'trace', diff_ref: 'diff', wall_time_ms: 10, false_gate: false, regression: false,
    token_usage: { total_tokens: b === 'B0' ? baseTokens : treatmentTokens },
    verifier_evidence: { kind: 'command', command: 'verify', exit_code: b === 'B4' ? 0 : 1, stdout: '', stderr: '' },
    injected_context: { static_skill: null, observe_only: false, rule_gates: b === 'B4' ? [{ ruleId: 'pilot-rule' }] : [] },
    outcome: { verified_success: b === 'B4' }
  }))).flat();
}
const decide = r => buildEvalReport(r, options).gate.decision;
const task = { task_id: 'sample', split: 'train', repo_ref: { kind: 'git', ref: 'HEAD' }, prompt: 'Fix a bug',
  allowed_tools: ['shell'], budget, success_check: { kind: 'command', command: 'node verify.js' }, expected_touched_paths: ['src/example.ts'], tags: ['validation'] };
function read(value) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-pilot-verifier-'));
  try { const path = join(dir, 'task.json'); writeFileSync(path, JSON.stringify(value)); return readEvalTask(path); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}
assert.equal(decide(rows()), 'accept', 'a measured success improvement with lower cost still qualifies');
const harmful = rows(); harmful.find(r => r.baseline_id === 'B4').regression = true;
assert.equal(decide(harmful), 'reject', 'regression guard remains active');
const unknown = rows(); unknown[0].token_usage = null;
assert.equal(decide(unknown), 'inconclusive', 'missing cost remains unknown');
assert.deepEqual(read(task), task, 'valid task contract remains unchanged');
if (phase === 'acceptance') {
  if (scenario === 'cost') {
    for (const [b,t] of [[100,200],[0,1],[100,1000000]]) assert.notEqual(decide(rows(b,t)), 'accept', 'cost increases cannot earn promotion');
    assert.equal(decide(rows(100,100)), 'accept', 'equal-cost success improvements remain valid');
  } else if (scenario === 'command') {
    for (const command of [' ', '\t\n']) assert.throws(() => read({ ...task, success_check: { kind: 'command', command } }));
  } else if (scenario === 'identity') {
    for (const key of ['task_id', 'prompt']) assert.throws(() => read({ ...task, [key]: ' \t ' }));
    assert.throws(() => read({ ...task, repo_ref: { kind: 'git', ref: '\n ' } }));
  } else if (scenario === 'arrays') {
    for (const key of ['allowed_tools', 'expected_touched_paths', 'tags']) assert.throws(() => read({ ...task, [key]: [' \t '] }));
  } else if (scenario === 'metadata') {
    for (const key of ['model', 'harness']) for (const value of ['', ' \t ', 'unknown']) {
      const r = rows(); r.forEach(e => e[key] = value);
      let result; try { result = decide(r); } catch { result = 'invalid'; }
      assert.notEqual(result, 'accept', `${key} must identify the generating system`);
    }
    const r = rows(); r.forEach(e => e.model = 'unknown-model-family');
    assert.equal(decide(r), 'accept', 'only the exact unknown sentinel is absent metadata');
  } else if (scenario === 'budget-order') {
    const r = rows(); r.filter(e => e.baseline_id === 'B4').forEach(e => e.budget = { max_tokens: 100000, max_turns: 10, max_wall_time_seconds: 60 });
    assert.equal(decide(r), 'accept', 'JSON property order cannot change budget equivalence');
    r[0].budget.max_tokens = 999;
    assert.equal(decide(r), 'inconclusive', 'different budget values remain incomparable');
  } else throw new Error(`unknown scenario ${scenario}`);
}
console.log(JSON.stringify({ phase, scenario, passed: true }));
