import assert from 'node:assert/strict';
import test from 'node:test';

import { accumulateEvidence, evidenceThreshold, logEvidenceRatio } from '../src/index.ts';

const P1 = 0.5;
const P0 = 0.1;

test('logEvidenceRatio is positive for recurrence and negative for clean runs', () => {
  const positive = logEvidenceRatio(1, P1, P0);
  const negative = logEvidenceRatio(0, P1, P0);
  assert.ok(positive > 0);
  assert.ok(negative < 0);
  assert.ok(Math.abs(positive) > Math.abs(negative), 'a clean run is weaker evidence than a recurrence');
});

test('evidenceThreshold is the tolerated error rate, in its own units', () => {
  assert.equal(evidenceThreshold(0.05), 20);
  assert.equal(evidenceThreshold(0.1), 10);
});

test('a recurring pattern crosses the boundary in a few runs', () => {
  // [1,1,1]: E = 5^3 = 125
  const e = accumulateEvidence([1, 1, 1], P1, P0);
  assert.ok(Math.abs(e - 125) < 1e-9);
  assert.ok(e > evidenceThreshold(0.05));
});

test('noise never crosses the boundary', () => {
  // [0,0,1,0,0,0]: one recurrence in six — E ≈ 0.26
  const e = accumulateEvidence([0, 0, 1, 0, 0, 0], P1, P0);
  assert.ok(e < 1);
});

test('a weaken streak drags evidence under the boundary', () => {
  // [1,1,0,0,0,0,0]: E ≈ 1.32 — down from 25, below the strict boundary
  const streak = accumulateEvidence([1, 1, 0, 0, 0, 0, 0], P1, P0);
  const peak = accumulateEvidence([1, 1], P1, P0);
  assert.ok(streak < peak);
  assert.ok(streak < evidenceThreshold(0.05));
  // eight clean runs after two recurrences and evidence collapses below 1
  assert.ok(accumulateEvidence([1, 1, 0, 0, 0, 0, 0, 0, 0, 0], P1, P0) < 1);
});

test('one weaken event splits the alphas: permissive promotes, strict blocks', () => {
  // [1,1,0]: E ≈ 13.9 — above 1/0.1, below 1/0.05
  const e = accumulateEvidence([1, 1, 0], P1, P0);
  assert.ok(e > evidenceThreshold(0.1));
  assert.ok(e < evidenceThreshold(0.05));
});

test('a single observation never promotes', () => {
  const e = accumulateEvidence([1], P1, P0);
  assert.ok(Math.abs(e - 5) < 1e-9);
  assert.ok(e <= evidenceThreshold(0.1), 'one run is evidence, not a pattern');
});
