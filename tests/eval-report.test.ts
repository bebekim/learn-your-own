import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildEvalReport,
} from '../src/lyo/eval/report.ts';
import { runLyoJson } from './helpers/cli.js';
import type { EvalBaselineId, EvalEpisodeResult } from '../src/lyo/eval/live-runner.ts';

test('eval report aggregates episode rows and accepts an improved treatment gate', () => {
  const report = buildEvalReport(episodes(), {
    baselineId: 'B0',
    treatmentId: 'B4',
    ruleId: 'rule-1',
  });

  const b0 = report.baseline_scores.find((summary) => summary.baseline_id === 'B0');
  const b4 = report.baseline_scores.find((summary) => summary.baseline_id === 'B4');
  assert.ok(b0 && b4 && report.gate);

  assert.equal(b0.verified_success_rate, 0);
  assert.equal(b4.verified_success_rate, 1);
  assert.equal(b4.rule_applications, 6);
  assert.equal(report.worst_regressions.length, 5);
  assert.equal(report.gate.decision, 'accept');
  assert.deepEqual(report.gate.reasons, ['verified_success_rate improved']);
});

test('rule gate rejects higher false gate rate', () => {
  const rows = episodes();
  rows.find(e => e.baseline_id === 'B4')!.false_gate = true;
  assert.equal(buildEvalReport(rows, gate).gate?.decision, 'reject');
});

test('unverified task outcomes stay unknown without becoming failures or regressions', () => {
  const rows = episodes();
  for (const row of rows) row.outcome.verified_success = null;
  const report = buildEvalReport(rows);
  assert.equal(report.version, 'lyo/eval-report/v2');
  for (const summary of report.baseline_scores) {
    assert.equal(summary.episodes, 6);
    assert.equal(summary.known_outcomes, 0);
    assert.equal(summary.unknown_outcomes, 6);
    assert.equal(summary.verified_success_rate, null);
    assert.equal(summary.verified_success_interval, null);
  }
  assert.deepEqual(report.worst_regressions, []);
});

test('partial coverage uses known task outcomes as the denominator and retains observed regressions', () => {
  const rows = episodes().filter(row => row.baseline_id === 'B4').slice(0, 3);
  rows[1].outcome.verified_success = false;
  rows[2].outcome.verified_success = null;
  rows[2].regression = true;
  const report = buildEvalReport(rows);
  const summary = report.baseline_scores[0];
  assert.equal(summary.known_outcomes, 2);
  assert.equal(summary.unknown_outcomes, 1);
  assert.equal(summary.verified_success_rate, 0.5);
  assert.deepEqual(summary.verified_success_interval, [0.0945, 0.9055]);
  assert.deepEqual(report.worst_regressions.map(row => row.episode_id), [rows[1].episode_id, rows[2].episode_id]);
});

test('only explicit null represents an unknown outcome at the report input boundary', () => {
  for (const outcome of [undefined, null, {}, { verified_success: 'unknown' }, { verified_success: 0 }]) {
    // Deliberately malformed input at the JSON boundary.
    assert.throws(() => buildEvalReport([{ ...episodes()[0], outcome }] as any), /invalid episode/);
  }
});

test('rule gate accepts repeated matched cost wins without success loss', () => {
  const rows = episodes();
  for (const row of rows) row.outcome.verified_success = true;
  assert.equal(buildEvalReport(rows, gate).gate?.decision, 'accept');
});

test('unknown acceptance in either arm blocks both success and cost promotion', () => {
  for (const baselineId of ['B0', 'B4']) {
    for (const costOnly of [false, true]) {
      const rows = episodes();
      if (costOnly) for (const row of rows) row.outcome.verified_success = true;
      rows.find(row => row.baseline_id === baselineId)!.outcome.verified_success = null;
      const result = buildEvalReport(rows, gate).gate;
      assert.ok(result);
      assert.equal(result.decision, 'inconclusive', `${baselineId}, costOnly=${costOnly}`);
      assert.ok(result.reasons.includes('task acceptance must be known for every compared episode'));
    }
  }
});

test('unknown costs, smoke episodes, mismatched tasks and test-split tuning cannot pass the gate', () => {
  for (const change of [
    row => { row.token_usage = null; },
    row => { row.episode_kind = 'verifier-smoke'; },
    row => { row.task_fingerprint = 'b'.repeat(64); },
    row => { row.split = 'test'; },
    row => { row.injected_context.rule_gates = []; },
  ] satisfies Array<(row: EvalEpisodeResult) => void>) {
    const rows = episodes(); change(rows.find(e => e.baseline_id === 'B4')!);
    assert.equal(buildEvalReport(rows, gate).gate?.decision, 'inconclusive');
  }
  const rows = episodes();
  assert.throws(() => buildEvalReport([...rows, rows[0]], gate), /unique/);
  assert.equal(buildEvalReport(rows.slice(0, 2), gate).gate?.decision, 'inconclusive');
});

const gate = { baselineId: 'B0', treatmentId: 'B4', ruleId: 'rule-1' } as const;

for (const unknown of [false, true]) test(`lyo eval report preserves ${unknown ? 'unknown' : 'known'} outcomes in JSON and markdown`, () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-report-'));
  try {
    const episodesPath = join(dir, 'episodes.json');
    const rows = episodes();
    if (unknown) for (const row of rows) row.outcome.verified_success = null;
    writeFileSync(episodesPath, JSON.stringify(rows));

    const parsed = runLyoJson([
      'eval',
      'report',
      '--episodes',
      episodesPath,
      '--baseline',
      'B0',
      '--treatment',
      'B4',
      '--rule-id',
      'rule-1',
      '--markdown',
    ]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.report.gate.decision, unknown ? 'inconclusive' : 'accept');
    assert.equal(parsed.report.baseline_scores[1].unknown_outcomes, unknown ? 6 : 0);
    assert.match(parsed.markdown, /Known Outcomes \| Unknown Outcomes \| Verified Success \(known outcomes\)/);
    assert.ok(parsed.markdown.includes(unknown ? '| B4 | 6 | 0 | 6 | unknown | unknown |' : '| B4 | 6 | 6 | 0 | 100% |'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function episodes() {
  return Array.from({length: 6}, (_, i) => [
    episode(`b0-${i}`, `task-${i}`, 'B0', false, 100),
    episode(`b4-${i}`, `task-${i}`, 'B4', true, 70, { ruleGates: 1 }),
  ]).flat();
}

function episode(id: string, taskId: string, baselineId: EvalBaselineId, success: boolean | null,
  totalTokens: number, options: { stderr?: string; ruleGates?: number } = {}): EvalEpisodeResult {
  return {
    episode_id: id,
    task_id: taskId,
    baseline_id: baselineId,
    model: 'test-model',
    harness: 'fixture',
    budget: {
      max_turns: 1,
      max_wall_time_seconds: 1,
      max_tokens: 1,
    },
    allowed_tools: ['shell'],
    trace_ref: 'trace.json',
    diff_ref: 'output.js',
    episode_kind: 'agent', split: 'selection', pair_id: taskId,
    task_fingerprint: 'a'.repeat(64), verifier_sha256: 'f'.repeat(64),
    false_gate: false, regression: false,
    touched_paths: ['src/example.ts'],
    verifier_evidence: {
      kind: 'command',
      command: 'true',
      exit_code: success ? 0 : 1,
      stdout: '',
      stderr: options.stderr ?? '',
    },
    token_usage: {
      total_tokens: totalTokens,
    },
    wall_time_ms: 10,
    injected_context: {
      static_skill: null,
      observe_only: false,
      rule_gates: Array.from({ length: options.ruleGates ?? 0 }, (_, index) => ({
        ruleId: 'rule-1',
        command: 'npm test',
        requireBeforeDone: true,
        matchedPaths: ['src/example.ts'],
        applicationId: `app-${index}`,
      })),
    },
    outcome: {
      verified_success: success,
    },
  };
}
