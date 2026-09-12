import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import test from 'node:test';
import { fixture } from './helpers/session-finding-fixture.ts';
import { assessFindingEvidence, inspectFinding, recordFindingFeedback } from '../src/lyo/interface/session-findings.ts';
import { registerFindingOpportunity, measureFindingOpportunity } from '../src/lyo/interface/session-finding-evidence.ts';

test('assessment derives conclusions from retained evidence and revises them when semantics change', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    assert.throws(() => assessFindingEvidence(f.store, delivery.deliveryId), /evidence/);
    const pending = f.prepare(delivery.deliveryId, undefined, false);
    const measured = pending.finish();
    const template = inspectFinding(f.store, f.findingId).opportunities[0].reviewTemplate!;
    const initial = assessFindingEvidence(f.store, measured.id)!;
    assert.equal(initial.id, template.id, 'automatic recording preserves the operator proposal identity');
    assert.equal(initial.outcome, 'unknown', 'a passing check without accepted semantics is insufficient');
    assert.equal(assessFindingEvidence(f.store, measured.id), null, 'retry cannot add another assessment');
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 0);

    const accepted = f.review(pending.id);
    const supported = assessFindingEvidence(f.store, measured.id)!;
    assert.equal(supported.supersedes, initial.id);
    assert.equal(supported.outcome, 'supported');
    assert.equal(assessFindingEvidence(f.store, measured.id), null);
    assert.match(f.deliver(f.root, `${f.root}:supported`).output, /1 supporting observation/);

    f.review(pending.id, { verdict: 'disputed', supersedes: accepted.id });
    // Assessment uses the retained measurement, even if running the evaluator again would fail.
    writeFileSync(pending.verifier, 'throw new Error("do not rerun the measurement");');
    const disputed = assessFindingEvidence(f.store, measured.id)!;
    assert.equal(disputed.supersedes, supported.id);
    assert.equal(disputed.outcome, 'unknown');
    const state = inspectFinding(f.store, f.findingId);
    assert.deepEqual(state.feedback.map(row => row.outcome), ['unknown', 'supported', 'unknown']);
    assert.equal(state.supporting, 0);
    assert.doesNotMatch(f.deliver(f.root, `${f.root}:disputed`).output, /supporting observation/);
    assert.deepEqual(state.opportunities[0].evidence!.measurement, measured.measurement);
    assert.equal(state.opportunities[0].evidence!.incrementalBenefit, 'unknown');
  } finally { f.close(); }
});

test('an unresolved evidence reference cannot change finding validity', () => {
  const f = fixture();
  try {
    const delivered = f.deliver();
    assert.throws(() => recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivered.deliveryId }), /evidence/);
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
  } finally { f.close(); }
});

test('registered checks bind a real application result to feedback and the next hook', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const evidence = f.prepare(delivery.deliveryId).finish();
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'supported');
    assert.equal(state.currentFeedback[0].opportunityId, 'application-1');
    assert.match(f.deliver(f.root, `${f.root}:next`).output, /1 supporting observation/);
    assert.deepEqual(measureFindingOpportunity(f.store, 'application-1'), evidence, 'a retry returns the retained measurement');
  } finally { f.close(); }
});

test('a measurement cannot be reused for another delivery or counted twice', () => {
  const f = fixture();
  try {
    const first = f.deliver(), second = f.deliver(f.root, `${f.root}:second`);
    const evidence = f.evidenceFor(first.deliveryId);
    const review = { ...f.feedback, deliveryId: first.deliveryId, evidenceRef: evidence.id };
    recordFindingFeedback(f.store, review);
    assert.throws(() => recordFindingFeedback(f.store, { ...review, id: 'copy', deliveryId: second.deliveryId }), /another delivery/);
    assert.throws(() => recordFindingFeedback(f.store, { ...review, id: 'duplicate' }), /already reviewed/);
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 1);
  } finally { f.close(); }
});

test('the registered action must be the delivered advice, not an unrelated successful task', () => {
  const f = fixture();
  try {
    const prepared = f.prepare(f.deliver().deliveryId);
    assert.throws(() => registerFindingOpportunity(f.store, { ...prepared.input, id: 'unrelated',
      claim: { ...prepared.input.claim, action: 'Run an unrelated formatting check.' } }), /delivered advice/);
  } finally { f.close(); }
});

test('changed verifier files and arbitrary trace records cannot establish checked support', () => {
  const f = fixture();
  try {
    const delivery = f.deliver(), pending = f.prepare(delivery.deliveryId);
    writeFileSync(pending.verifier, 'console.log(JSON.stringify({satisfied:true}));');
    const evidence = pending.finish();
    assert.equal(evidence.outcome, 'unknown');
    assert.match(evidence.measurement.problems.join(' '), /verifier changed/);
    assert.throws(() => recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id }), /must match/);
    f.store.recordTrace({ trace_id: 'arbitrary', kind: 'behavior', summary: 'Unrelated recorded observation', payload: { passed: true } });
    assert.throws(() => recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: 'arbitrary' }), /evidence/);
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
  } finally { f.close(); }
});

test('a failed evaluator process remains unknown even when its stdout claims a result', () => {
  const f = fixture();
  try {
    const delivery = f.deliver(), pending = f.prepare(delivery.deliveryId);
    writeFileSync(pending.verifier, "import fs from 'node:fs'; const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); console.log(JSON.stringify({satisfied:value[process.argv[3]]})); if(value.broken) process.exit(1);");
    registerFindingOpportunity(f.store, { ...pending.input, id: 'broken-evaluator' });
    f.review('broken-evaluator');
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: false, broken: true }));
    const evidence = measureFindingOpportunity(f.store, 'broken-evaluator');
    assert.equal(evidence.measurement.adherence?.exit_code, 1);
    assert.equal(evidence.adherence, 'unknown');
    assert.equal(evidence.outcome, 'unknown');
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id, adherence: 'unknown', outcome: 'unknown' });
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
  } finally { f.close(); }
});

test('an action already satisfied before registration cannot be credited as a later application', () => {
  const f = fixture();
  try {
    const pending = f.prepare(f.deliver().deliveryId);
    pending.finish();
    registerFindingOpportunity(f.store, { ...pending.input, id: 'retrospective' });
    const evidence = measureFindingOpportunity(f.store, 'retrospective');
    assert.equal(evidence.opportunity.adherenceBefore.satisfied, true);
    assert.equal(evidence.adherence, 'unknown');
    assert.equal(evidence.outcome, 'unknown');
  } finally { f.close(); }
});

test('source mutation during measurement prevents a validity judgment', () => {
  const f = fixture();
  try {
    const pending = f.prepare(f.deliver().deliveryId);
    writeFileSync(pending.verifier, "import fs from 'node:fs'; const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); console.log(JSON.stringify({satisfied:value[process.argv[3]]})); if(value.followed) { value.edits = (value.edits || 0) + 1; fs.writeFileSync(process.argv[2], JSON.stringify(value)); }");
    registerFindingOpportunity(f.store, { ...pending.input, id: 'mutating-evaluator' });
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
    const evidence = measureFindingOpportunity(f.store, 'mutating-evaluator');
    assert.match(evidence.measurement.problems.join(' '), /source or verifier changed/);
    assert.equal(evidence.outcome, 'unknown');
  } finally { f.close(); }
});

test('corrupt retained evidence loses current credit without deleting its review', () => {
  const f = fixture();
  try {
    const delivery = f.deliver(), evidence = f.evidenceFor(delivery.deliveryId);
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id });
    // Simulate a damaged/imported row below the append-only API.
    f.store.db.prepare("UPDATE learning_trace SET payload_json = json_set(payload_json, '$.content.problems', json('[\"damaged\"]')) WHERE trace_id = ?").run(evidence.id);
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'unvalidated');
    assert.deepEqual(state.unverifiedFeedbackIds, ['review-1']);
    assert.equal(state.feedback.length, 1);
  } finally { f.close(); }
});

test('distinct applications of one delivered version remain separately reviewable', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    for (const id of ['first-application', 'second-application']) {
      const evidence = f.evidenceFor(delivery.deliveryId);
      recordFindingFeedback(f.store, { ...f.feedback, id, deliveryId: delivery.deliveryId, evidenceRef: evidence.id });
    }
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.supporting, 2);
    assert.equal(state.opportunities.length, 2);
    assert.ok(state.opportunities.every(row => row.reviewEvidenceCurrent));
  } finally { f.close(); }
});
