import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateInjectionWeight, stratumStatsFromRows, MIN_STRATUM_DECISIONS, MAX_WEIGHT,
  RATIO_LIFT_ESTIMATOR_ID, UNIFORM_FALLBACK_ESTIMATOR_ID } from '../src/lyo/domain/injection-weight.ts';

test('a missing, non-positive, or certain propensity falls back to uniform credit', () => {
  const base = { stratumDecisions: MIN_STRATUM_DECISIONS + 1, selectedCount: 3 };
  for (const propensity of [undefined, null, 0, -0.1, 1, 1.5]) {
    const result = estimateInjectionWeight({ ...base, propensity });
    assert.deepEqual(result, { weight: 1, estimator: UNIFORM_FALLBACK_ESTIMATOR_ID }, `propensity ${propensity}`);
  }
});

test('a stratum below the minimum decision count falls back regardless of propensity', () => {
  const result = estimateInjectionWeight({ propensity: 0.5, stratumDecisions: MIN_STRATUM_DECISIONS - 1, selectedCount: 3 });
  assert.deepEqual(result, { weight: 1, estimator: UNIFORM_FALLBACK_ESTIMATOR_ID });
});

test('an identified stratum credits the smoothed hindsight ratio', () => {
  const n = MIN_STRATUM_DECISIONS + 1;
  const result = estimateInjectionWeight({ propensity: 0.5, stratumDecisions: n, selectedCount: n });
  assert.equal(result.estimator, RATIO_LIFT_ESTIMATOR_ID);
  const expected = (n + 1) / (n + 2) / 0.5 - 1;
  assert.ok(Math.abs(result.weight - expected) < 1e-12);
});

test('an extreme ratio clips to the maximum weight rather than exploding', () => {
  const n = MIN_STRATUM_DECISIONS + 1;
  const result = estimateInjectionWeight({ propensity: 0.01, stratumDecisions: n, selectedCount: n });
  assert.equal(result.estimator, RATIO_LIFT_ESTIMATOR_ID);
  assert.equal(result.weight, MAX_WEIGHT);
});

test('stratum stats count each decision once, deduplicated across its selected lessons', () => {
  const stats = stratumStatsFromRows([
    { decisionId: 'd1', selectedLessonIds: ['a', 'b'], outcome: 'passed' },
    { decisionId: 'd1', selectedLessonIds: ['a', 'b'], outcome: 'passed' }, // duplicate row for the same decision
    { decisionId: 'd2', selectedLessonIds: ['b'], outcome: 'failed' },
  ]);
  assert.deepEqual(Object.fromEntries(stats.decisionCounts), { passed: 1, failed: 1 });
  assert.deepEqual(Object.fromEntries([...stats.selectionCounts].map(([id, m]) => [id, Object.fromEntries(m)])),
    { a: { passed: 1 }, b: { passed: 1, failed: 1 } });
});
