import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildEvalReport,
} from '../src/eval/report.ts';
import { runLyoJson } from './helpers/cli.js';

test('eval report aggregates episode rows and accepts an improved treatment gate', () => {
  const report = buildEvalReport(episodes(), {
    baselineId: 'B0',
    treatmentId: 'B4',
    ruleId: 'rule-1',
  });

  const b0 = report.baseline_scores.find((summary) => summary.baseline_id === 'B0');
  const b4 = report.baseline_scores.find((summary) => summary.baseline_id === 'B4');

  assert.equal(b0.verified_success_rate, 0);
  assert.equal(b4.verified_success_rate, 1);
  assert.equal(b4.rule_applications, 6);
  assert.equal(report.worst_regressions.length, 5);
  assert.equal(report.gate.decision, 'accept');
  assert.deepEqual(report.gate.reasons, ['verified_success_rate improved']);
});

test('rule gate rejects higher false gate rate', () => {
  const rows = episodes();
  rows.find(e => e.baseline_id === 'B4').false_gate = true;
  assert.equal(buildEvalReport(rows, gate).gate.decision, 'reject');
});

test('rule gate accepts repeated matched cost wins without success loss', () => {
  const rows = episodes();
  for (const row of rows) row.outcome.verified_success = true;
  assert.equal(buildEvalReport(rows, gate).gate.decision, 'accept');
});

test('unknown costs, smoke episodes, mismatched tasks and test-split tuning cannot pass the gate', () => {
  for (const change of [
    row => { row.token_usage = null; },
    row => { row.episode_kind = 'verifier-smoke'; },
    row => { row.task_fingerprint = 'b'.repeat(64); },
    row => { row.split = 'test'; },
    row => { row.injected_context.rule_gates = []; },
  ]) {
    const rows = episodes(); change(rows.find(e => e.baseline_id === 'B4'));
    assert.equal(buildEvalReport(rows, gate).gate.decision, 'inconclusive');
  }
  const rows = episodes();
  assert.throws(() => buildEvalReport([...rows, rows[0]], gate), /unique/);
  assert.equal(buildEvalReport(rows.slice(0, 2), gate).gate.decision, 'inconclusive');
});

const gate = { baselineId: 'B0', treatmentId: 'B4', ruleId: 'rule-1' };

test('lyo eval report reads episode JSON and can include markdown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-report-'));
  try {
    const episodesPath = join(dir, 'episodes.json');
    writeFileSync(episodesPath, JSON.stringify(episodes()));

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
    assert.equal(parsed.report.gate.decision, 'accept');
    assert.match(parsed.markdown, /LYO Eval Report/);
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

function episode(id, taskId, baselineId, success, totalTokens, options = {}) {
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
