import assert from 'node:assert/strict';
import test from 'node:test';
import { fixture } from './helpers/session-finding-fixture.ts';
import { inspectFinding, recordFindingFeedback } from '../src/lyo/interface/session-findings.ts';

test('unreviewed evaluator semantics cannot suspend advice even with intact false output', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const pending = f.prepare(delivery.deliveryId, { applicable: true, followed: true, predicted: false }, false);
    const evidence = pending.finish();
    assert.equal(evidence.measurement.prediction?.satisfied, false);
    assert.equal(evidence.outcome, 'unknown');
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id,
      applicability: 'unknown', adherence: 'unknown', outcome: 'unknown' });
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
    assert.match(f.deliver(f.root, `${f.root}:later`).output, /Check the target whitespace contract/);
  } finally { f.close(); }
});

test('one failed improvement trial cannot contradict a probabilistic claim', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const pending = f.prepare(delivery.deliveryId, { applicable: true, followed: true, predicted: false }, false, 'improvement');
    f.review(pending.id, { claimKind: 'improvement' });
    const evidence = pending.finish();
    assert.equal(evidence.applicability, 'applicable');
    assert.equal(evidence.adherence, 'followed');
    assert.equal(evidence.measurement.prediction?.satisfied, false);
    assert.equal(evidence.outcome, 'unknown');
    assert.equal(evidence.incrementalBenefit, 'unknown');
  } finally { f.close(); }
});

test('review cannot redefine an improvement claim as deterministic after seeing its outcome', () => {
  const f = fixture();
  try {
    const pending = f.prepare(f.deliver().deliveryId, { applicable: true, followed: true, predicted: false }, false, 'improvement');
    pending.finish();
    assert.throws(() => f.review(pending.id, { claimKind: 'deterministic' }), /declared claim kind/);
  } finally { f.close(); }
});

test('disputing evaluator semantics removes prior credit without deleting observations', () => {
  const f = fixture();
  try {
    const delivery = f.deliver(), pending = f.prepare(delivery.deliveryId);
    const evidence = pending.finish();
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id });
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 1);
    f.review(pending.id, { verdict: 'disputed', supersedes: evidence.semantics!.id });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.supporting, 0);
    assert.deepEqual(state.unverifiedFeedbackIds, [f.feedback.id]);
    assert.equal(state.opportunities[0].evidence!.measurement.prediction?.satisfied, true);
  } finally { f.close(); }
});
