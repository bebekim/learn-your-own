import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCreditFidelity } from '../src/lyo/domain/credit-fidelity.ts';
import { RATIO_LIFT_ESTIMATOR_ID, UNIFORM_FALLBACK_ESTIMATOR_ID } from '../src/lyo/domain/injection-weight.ts';

test('no applications reports zeros and null means', () => {
  const report = aggregateCreditFidelity([], new Map());
  assert.deepEqual(report.strata, []);
  assert.deepEqual(report.overall, { stratum: '(overall)', receipts: 0, legacy: 0, uniformFallback: 0,
    ratioLift: 0, gated: 0, signFlips: 0, meanAbsWeightDifference: null, meanAbsWeight: null });
});

test('classifies each receipt by its mark, and computes the outcome-signed weight error only for ratio-lift', () => {
  const applications = [
    { applicationId: 'gated', outcome: 'passed', stratum: 's' },
    { applicationId: 'legacy', outcome: 'passed', stratum: 's' },
    { applicationId: 'uniform', outcome: 'passed', stratum: 's' },
    { applicationId: 'ratio-aligned', outcome: 'passed', stratum: 's' },
    { applicationId: 'ratio-flipped', outcome: 'passed', stratum: 's' },
  ];
  const marks = new Map([
    ['legacy', { helpful: true, weight: null, estimator: null }],
    ['uniform', { helpful: true, weight: 1, estimator: UNIFORM_FALLBACK_ESTIMATOR_ID }],
    ['ratio-aligned', { helpful: true, weight: 0.75, estimator: RATIO_LIFT_ESTIMATOR_ID }],
    // helpful: false on a passed outcome is a sign flip; the report signs the weight negative.
    ['ratio-flipped', { helpful: false, weight: 0.5, estimator: RATIO_LIFT_ESTIMATOR_ID }],
  ]);
  const report = aggregateCreditFidelity(applications, marks);
  const stratum = report.strata.find(row => row.stratum === 's')!;
  assert.equal(stratum.receipts, 5);
  assert.equal(stratum.gated, 1);
  assert.equal(stratum.legacy, 1);
  assert.equal(stratum.uniformFallback, 1);
  assert.equal(stratum.ratioLift, 2);
  assert.equal(stratum.signFlips, 1);
  // signed weights: +0.75 (aligned) and -0.5 (flipped).
  assert.ok(Math.abs(stratum.meanAbsWeightDifference! - (Math.abs(0.75 - 1) + Math.abs(-0.5 - 1)) / 2) < 1e-12);
  assert.ok(Math.abs(stratum.meanAbsWeight! - (0.75 + 0.5) / 2) < 1e-12);
  assert.deepEqual(report.overall, { ...stratum, stratum: '(overall)' });
});

test('strata sort by receipt count descending, then alphabetically', () => {
  const applications = [
    { applicationId: '1', outcome: 'passed', stratum: 'b' },
    { applicationId: '2', outcome: 'passed', stratum: 'a' },
    { applicationId: '3', outcome: 'passed', stratum: 'a' },
  ];
  const report = aggregateCreditFidelity(applications, new Map());
  assert.deepEqual(report.strata.map(row => row.stratum), ['a', 'b']);
});
