import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateFindingTrialPolicy, type FindingTrialOutcome } from '../src/lyo/domain/finding-trial-policy.ts';

const plan = { sampleSize: 100, minimumEffect: 0.02, alpha: 0.05, assumptions: 'Independent fair assignments.' };
const current = { suspended: false, superseded: false };

test('closed unknown outcomes remain in the fixed cohort and widen its effect bounds', () => {
  const rows: FindingTrialOutcome[] = Array.from({ length: 100 }, (_, index) => ({
    assignment: { action: index < 50 ? 'advice' : 'no-advice', probability: 0.5 },
    closed: true, outcome: index < 50 ? 'pass' : index === 99 ? 'unknown' : 'fail',
  }));
  const result = evaluateFindingTrialPolicy(rows, plan, current);
  assert.equal(result.status, 'promoted');
  assert.deepEqual(result.arms, {
    advice: { assigned: 50, pass: 50, fail: 0, unknown: 0 },
    'no-advice': { assigned: 50, pass: 0, fail: 49, unknown: 1 },
  });
  assert.ok(Math.abs(result.effectInterval![0] - 0.43675939370375216) < 1e-12);
  assert.equal(result.effectInterval![1], 1);
  const reversed = rows.map(row => ({ ...row, assignment: {
    ...row.assignment, action: row.assignment.action === 'advice' ? 'no-advice' as const : 'advice' as const,
  } }));
  const harmful = evaluateFindingTrialPolicy(reversed, plan, current);
  assert.equal(harmful.status, 'harmful');
  assert.equal(harmful.effectInterval![0], -1);
  assert.ok(Math.abs(harmful.effectInterval![1] + 0.43675939370375216) < 1e-12);
});

test('cohort decisions precede monitoring, suspension, and replacement overrides', () => {
  const cohort: FindingTrialOutcome[] = Array.from({ length: 100 }, (_, index) => ({
    assignment: { action: index < 50 ? 'advice' : 'no-advice', probability: 0.5 },
    closed: true, outcome: index < 50 ? 'pass' : 'fail',
  }));
  const monitored: FindingTrialOutcome = { assignment: { action: 'advice', probability: 1 }, closed: true, outcome: 'fail' };
  const cases: Array<[string, FindingTrialOutcome[], typeof current, string]> = [
    ['partial cohort', cohort.slice(1), current, 'collecting'],
    ['open outcome', [{ ...cohort[0], closed: false }, ...cohort.slice(1)], current, 'awaiting-outcomes'],
    ['complete cohort', cohort, current, 'promoted'],
    ['oversized cohort', [...cohort, cohort[0]], current, 'invalid-cohort'],
    ['single arm', cohort.filter(row => row.assignment.action === 'advice').flatMap(row => [row, row]), current, 'inconclusive'],
    ['all unknown', cohort.map(row => ({ ...row, outcome: 'unknown' })), current, 'inconclusive'],
    ['monitoring failure', [...cohort, monitored], current, 'needs-review'],
    ['monitoring unknown', [...cohort, { ...monitored, outcome: 'unknown' }], current, 'needs-review'],
    ['monitoring pass', [...cohort, { ...monitored, outcome: 'pass' }], current, 'promoted'],
    ['monitoring window open', [...cohort, { ...monitored, closed: false }], current, 'promoted'],
    ['no-advice monitoring', [...cohort, { ...monitored, assignment: { action: 'no-advice', probability: 1 } }], current, 'promoted'],
    ['invalid cohort overrides monitoring', [...cohort, cohort[0], monitored], current, 'invalid-cohort'],
    ['suspension overrides monitoring', [...cohort, monitored], { ...current, suspended: true }, 'suspended'],
    ['suspension overrides invalid cohort', [...cohort, cohort[0]], { ...current, suspended: true }, 'suspended'],
    ['replacement overrides suspension', cohort, { suspended: true, superseded: true }, 'superseded'],
  ];
  for (const [name, rows, eligibility, expected] of cases) {
    assert.equal(evaluateFindingTrialPolicy(rows, plan, eligibility).status, expected, name);
  }
  assert.equal(evaluateFindingTrialPolicy(cohort, undefined, current).status, 'collecting');
  assert.equal(evaluateFindingTrialPolicy(cohort, undefined, current).effectInterval, null);
  assert.deepEqual(evaluateFindingTrialPolicy([...cohort, monitored], plan, current).arms,
    evaluateFindingTrialPolicy(cohort, plan, current).arms, 'monitoring must not enter the randomized cohort');
});

const perfect = (n: number): FindingTrialOutcome[] => Array.from({ length: n }, (_, index) => ({
  assignment: { action: index % 2 ? 'no-advice' : 'advice', probability: 0.5 },
  closed: true, outcome: index % 2 ? 'fail' : 'pass',
}));

test('the exact-binomial method decides from arm counts where Hoeffding cannot', () => {
  const plan = { sampleSize: 8, minimumEffect: 0, alpha: 0.1, assumptions: 'Independent fair assignments.' };
  assert.equal(evaluateFindingTrialPolicy(perfect(8), plan, current).status, 'inconclusive');
  const exact = evaluateFindingTrialPolicy(perfect(8), { ...plan, method: 'exact-binomial' }, current);
  assert.equal(exact.status, 'promoted');
  assert.ok(exact.effectInterval![0] > 0 && exact.effectInterval![1] === 1);
  const reversed = perfect(8).map(row => ({ ...row, outcome: row.outcome === 'pass' ? 'fail' as const : 'pass' as const }));
  assert.equal(evaluateFindingTrialPolicy(reversed, { ...plan, method: 'exact-binomial' }, current).status, 'harmful');
  const demanding = evaluateFindingTrialPolicy(perfect(8), { ...plan, minimumEffect: 0.9, method: 'exact-binomial' }, current);
  assert.equal(demanding.status, 'inconclusive', 'the bound must clear minimumEffect, not merely zero');
});

test('exact-binomial unknown outcomes take worst and best cases', () => {
  const plan = { sampleSize: 12, minimumEffect: 0, alpha: 0.1, assumptions: 'Independent fair assignments.', method: 'exact-binomial' as const };
  const known = evaluateFindingTrialPolicy(perfect(12), plan, current).effectInterval!;
  const withUnknown = perfect(12).map((row, index) => index === 1 ? { ...row, outcome: 'unknown' as const } : row);
  const widened = evaluateFindingTrialPolicy(withUnknown, plan, current);
  assert.deepEqual(widened.arms['no-advice'], { assigned: 6, pass: 0, fail: 5, unknown: 1 });
  assert.ok(widened.effectInterval![0] < known[0], 'an unknown control outcome counts as a pass for the lower bound');
});

test('stratified-exact compares sessions within each repository', () => {
  const plan = { sampleSize: 12, minimumEffect: 0, alpha: 0.1, assumptions: 'No interference between sessions.', method: 'stratified-exact' as const };
  // Repository baselines differ sharply; advice wins inside both.
  const rows: FindingTrialOutcome[] = [
    ...['pass', 'pass', 'pass'].map(outcome => ({ unit: 'easy', assignment: { action: 'advice' as const, probability: 0.5 as const }, closed: true, outcome: outcome as 'pass' })),
    ...['pass', 'fail', 'fail'].map(outcome => ({ unit: 'easy', assignment: { action: 'no-advice' as const, probability: 0.5 as const }, closed: true, outcome: outcome as 'pass' | 'fail' })),
    ...['pass', 'pass', 'fail'].map(outcome => ({ unit: 'hard', assignment: { action: 'advice' as const, probability: 0.5 as const }, closed: true, outcome: outcome as 'pass' | 'fail' })),
    ...['fail', 'fail', 'fail'].map(outcome => ({ unit: 'hard', assignment: { action: 'no-advice' as const, probability: 0.5 as const }, closed: true, outcome: outcome as 'fail' })),
  ];
  const result = evaluateFindingTrialPolicy(rows, plan, current);
  assert.equal(result.status, 'promoted');
  assert.equal(result.effectInterval, null);
  assert.ok(result.pValues!.benefit <= 0.05 && result.pValues!.harm > 0.05);
  assert.equal(evaluateFindingTrialPolicy(rows, { ...plan, minimumEffect: 0.1 }, current).status, 'inconclusive',
    'a no-effect test cannot certify a margin');
  const unknownControl = rows.map(row => row.unit === 'hard' && row.assignment.action === 'no-advice' ? { ...row, outcome: 'unknown' as const } : row);
  assert.equal(evaluateFindingTrialPolicy(unknownControl, plan, current).status, 'inconclusive',
    'unknown control outcomes count as passes against promotion');
});
