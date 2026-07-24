import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  buildEvalReport,
  decideRuleGate,
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

  assert.equal(b0.verified_success_rate, 0.5);
  assert.equal(b4.verified_success_rate, 1);
  assert.equal(b4.rule_applications, 2);
  assert.equal(report.worst_regressions.length, 1);
  assert.equal(report.gate.decision, 'accept');
  assert.deepEqual(report.gate.reasons, ['verified_success_rate improved']);
});

test('rule gate rejects higher false gate rate', () => {
  const decision = decideRuleGate({
    ruleId: 'rule-1',
    baseline: summary('B0', { success: 1, falseGate: 0, tokenCost: 100 }),
    treatment: summary('B4', { success: 1, falseGate: 0.5, tokenCost: 50 }),
  });

  assert.equal(decision.decision, 'reject');
  assert.deepEqual(decision.reasons, ['false_gate_rate increased']);
});

test('rule gate accepts equal success with lower token cost', () => {
  const decision = decideRuleGate({
    ruleId: 'rule-1',
    baseline: summary('B0', { success: 1, falseGate: 0, tokenCost: 100 }),
    treatment: summary('B4', { success: 1, falseGate: 0, tokenCost: 50 }),
  });

  assert.equal(decision.decision, 'accept');
  assert.deepEqual(decision.reasons, ['success unchanged and token_cost improved']);
});

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
  return [
    episode('b0-pass', 'task-a', 'B0', true, 100),
    episode('b0-fail', 'task-b', 'B0', false, 100, { stderr: 'failed verifier' }),
    episode('b4-pass-a', 'task-a', 'B4', true, 70, { ruleGates: 1 }),
    episode('b4-pass-b', 'task-b', 'B4', true, 70, { ruleGates: 1 }),
  ];
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
    trace_ref: null,
    diff_ref: null,
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
        ruleId: `rule-${index}`,
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

function summary(baselineId, { success, falseGate, tokenCost }) {
  return {
    baseline_id: baselineId,
    episodes: 2,
    verified_success_rate: success,
    verified_success_interval: [success, success],
    false_gate_rate: falseGate,
    regression_rate: 0,
    token_cost: tokenCost,
    context_overhead_tokens: 0,
    avg_wall_time_ms: 10,
    rule_applications: 0,
  };
}
