import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFindingObservation } from '../src/lyo/domain/finding-assessment.ts';
import { assessFindingEvidence, recordFindingFeedback, reviseFinding } from '../src/lyo/application/finding-assessment.ts';
import { findingAssessmentPort } from '../src/lyo/storage/finding-state.ts';
import { fixture } from './helpers/session-finding-fixture.ts';
import { inspectFinding } from '../src/lyo/interface/session-findings.ts';
import { withdrawFindingEvidence } from '../src/lyo/interface/session-finding-evidence.ts';
import { findingReviewStatus } from '../src/lyo/application/finding-assessment.ts';

test('a passing prediction needs the declared witnesses before it supports advice', () => {
  const observation = {
    withdrawn: false, claimKind: 'deterministic' as const, deliveryId: 'delivery',
    semantics: { verdict: 'accepted' as const, claimKind: 'deterministic' as const }, action: null,
    registration: { problems: [], applicability: { satisfied: true }, adherenceBefore: { satisfied: false } },
    measurement: { problems: [], adherence: { satisfied: true }, prediction: { satisfied: true } },
  };
  assert.deepEqual(assessFindingObservation(observation), {
    incrementalBenefit: 'unknown', observedOutcome: 'pass', applicability: 'applicable', adherence: 'followed', outcome: 'supported',
  });
  const withheld = assessFindingObservation({ ...observation, deliveryId: undefined });
  assert.equal(withheld.observedOutcome, 'pass', 'a control observation remains measurable');
  assert.equal(withheld.outcome, 'unknown', 'an observation without advice delivery cannot support advice');
  for (const changed of [
    { ...observation, semantics: null },
    { ...observation, withdrawn: true },
    { ...observation, action: { problems: ['missing before boundary'] } },
    { ...observation, measurement: { ...observation.measurement, problems: ['verifier changed'] } },
    { ...observation, registration: { ...observation.registration, adherenceBefore: { satisfied: true } } },
    { ...observation, claimKind: 'improvement' as const, semantics: { verdict: 'accepted' as const, claimKind: 'improvement' as const } },
  ]) assert.equal(assessFindingObservation(changed).outcome, 'unknown');
});

test('pending review prioritizes invalid evidence and semantic judgment over a later positive assessment', () => {
  const current = { error: null, hasEvidence: true, semanticVerdict: 'accepted' as const,
    reviewCurrent: true, validity: 'supported', scopeReview: false, outcome: 'supported' };
  assert.equal(findingReviewStatus(current), null);
  assert.equal(findingReviewStatus({ ...current, error: 'wrong binding' }), 'invalid-evidence');
  assert.equal(findingReviewStatus({ ...current, semanticVerdict: 'disputed' }), 'disputed-semantics');
  assert.equal(findingReviewStatus({ ...current, semanticVerdict: null }), 'needs-semantic-review');
  assert.equal(findingReviewStatus({ ...current, reviewCurrent: false }), 'needs-assessment');
});

test('application retries distinguish an existing revision from feedback invalidated by corrected evidence', () => {
  const f = fixture();
  try {
    const delivered = f.deliver();
    const evidence = f.evidenceFor(delivered.deliveryId, { applicable: true, followed: true, predicted: false });
    const port = findingAssessmentPort(f.store);
    const feedback = assessFindingEvidence(port, evidence.id)!;
    assert.equal(feedback.outcome, 'contradicted');
    assert.equal(assessFindingEvidence(port, evidence.id), null);
    const input = { id: 'repair', findingId: f.findingId, previousVersion: feedback.version,
      intervention: 'Recheck the target contract.', feedbackIds: [feedback.id], author: 'reviewer', rationale: 'Repair the counterexample.' };
    const revised = reviseFinding(port, input);
    withdrawFindingEvidence(f.store, { evidenceRef: evidence.id, author: 'reviewer', rationale: 'The evaluator checked the wrong contract.' });
    assert.deepEqual(reviseFinding(port, input), revised, 'an existing revision retry is identified before checking its current premise');
    const { source, version, context, opportunityId, observationId, evidenceHash, ...feedbackInput } = feedback;
    assert.throws(() => recordFindingFeedback(port, feedbackInput), /must match registered finding evidence/);
    const corrected = assessFindingEvidence(port, evidence.id)!;
    assert.equal(corrected.supersedes, feedback.id);
    assert.equal(corrected.outcome, 'unknown');
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'needs-reassessment');
    assert.equal(inspectFinding(f.store, f.findingId).feedback.length, 2);
  } finally { f.close(); }
});
