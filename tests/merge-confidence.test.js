import assert from 'node:assert/strict';
import test from 'node:test';

import { computeMergeDecision } from '../src/index.ts';

test('guardrail failure is a hard veto at confidence zero', () => {
  const decision = computeMergeDecision({
    guardrailPassed: false,
    evalTrajectory: 0.99,
    revertRate: 0,
    sandboxPassed: true,
  });
  assert.equal(decision.confidence, 0);
  assert.equal(decision.decision, 'route-to-human');
  assert.equal(decision.failingSignal, 'guardrail');
});

test('sandbox failure routes with the sandbox signal named', () => {
  const decision = computeMergeDecision({
    guardrailPassed: true,
    evalTrajectory: 0.9,
    revertRate: 0.1,
    sandboxPassed: false,
  });
  assert.equal(decision.decision, 'route-to-human');
  assert.equal(decision.failingSignal, 'sandbox');
});

test('high confidence merges itself', () => {
  const decision = computeMergeDecision({
    guardrailPassed: true,
    evalTrajectory: 0.95,
    revertRate: 0.05,
    sandboxPassed: true,
  });
  // 0.95 * 0.95 = 0.9025
  assert.ok(Math.abs(decision.confidence - 0.9025) < 1e-9);
  assert.equal(decision.decision, 'merge');
  assert.equal(decision.failingSignal, undefined);
});

test('below threshold routes to human with the weakest signal named', () => {
  const decision = computeMergeDecision({
    guardrailPassed: true,
    evalTrajectory: 0.9,
    revertRate: 0.5,
    sandboxPassed: true,
  });
  // 0.9 * 0.5 = 0.45
  assert.equal(decision.decision, 'route-to-human');
  assert.equal(decision.failingSignal, 'revertRate');
});

test('the threshold is a policy input, not a buried constant', () => {
  const signals = {
    guardrailPassed: true,
    evalTrajectory: 0.7,
    revertRate: 0.2,
    sandboxPassed: true,
  };
  assert.equal(computeMergeDecision(signals, { threshold: 0.5 }).decision, 'merge');
  assert.equal(computeMergeDecision(signals, { threshold: 0.9 }).decision, 'route-to-human');
});
