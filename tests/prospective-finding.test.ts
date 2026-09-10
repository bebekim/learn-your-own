import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './helpers/session-finding-fixture.ts';
import { inspectFinding, recordFindingFeedback } from '../src/lyo/selection/session-findings.ts';
import { findingOpportunity, registerFindingOpportunity, measureFindingOpportunity, withdrawFindingEvidence, resolveFindingEvidence } from '../src/lyo/selection/session-finding-evidence.ts';
import { reviewFindingSemantics } from '../src/lyo/selection/session-finding-semantics.ts';
import { captureFindingAction } from '../src/lyo/selection/session-finding-capture.ts';
import { codexHookObservation } from '../src/adapters/codex.ts';
import { spoolCodexHookEvent } from '../src/hooks/runtime.ts';
import * as decisions from '../src/lyo/selection/finding-opportunities.ts';
import { closeFindingTrialWindow } from '../src/lyo/selection/finding-trial-policy.ts';
import { pendingFindingReviews } from '../src/lyo/selection/session-finding-workflow.ts';

function prospectiveFixture() {
  const f = fixture();
  try {
    const source = join(f.root, 'target.json'), verifier = join(f.root, 'check.mjs');
    writeFileSync(source, JSON.stringify({ applicable: true, followed: false, predicted: false }));
    writeFileSync(verifier, "import fs from 'node:fs'; console.log(JSON.stringify({satisfied: JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))[process.argv[3]]}));");
    const command = (key: string) => `'${process.execPath}' '${verifier}' '${source}' ${key}`;
    const state = inspectFinding(f.store, f.findingId);
    const input = { id: 'prospective', findingId: f.findingId, taskId: 'new-task', cwd: f.root,
      prospective: { sessionId: 'new-session', trialId: 'parser-trial', model: 'fixture-model', findingVersion: state.version,
        context: { repository: f.root, activity: 'transfer-review', match: 'activity' } },
      claim: { kind: 'deterministic', conditions: 'The target contract applies.', action: state.finding.intervention,
        prediction: 'The target contract passes.', falsifiedBy: 'The target contract fails.' },
      checks: { applicability: command('applicable'), adherence: command('followed'), prediction: command('predicted') },
      verifierFiles: [verifier], sourceFiles: [source], evaluator: { id: 'fixture-contract', version: '1' },
      capture: { runtime: 'codex', toolName: 'Bash', toolInput: { command: 'repair' } } };
    registerFindingOpportunity(f.store, input);
    const basis = { rationale: 'Reads the retained target state.', verifierPaths: [verifier] };
    reviewFindingSemantics(f.store, { id: 'review', opportunityId: 'prospective', reviewer: { id: 'fixture', kind: 'agent' },
      verdict: 'accepted', claimKind: 'deterministic', applicability: basis, adherence: basis, prediction: basis,
      limitations: 'Synthetic behavior test; no real benefit is claimed.' });
    const event = { cwd: f.root, session_id: 'new-session', tool_use_id: 'repair-1', tool_name: 'Bash', tool_input: { command: 'repair' } };
    return { ...f, input, source, verifier, event, capture(name: string) {
      captureFindingAction(f.store, findingOpportunity(f.store.db, input.id), codexHookObservation({ ...event, hook_event_name: name }, { includeRawPrompt: false }));
    }, change() { writeFileSync(source, JSON.stringify({ applicable: true, followed: false, predicted: true })); } };
  } catch (error) { f.close(); throw error; }
}

test('an undelivered prospective opportunity retains an outcome without awarding lesson support', () => {
  const f = prospectiveFixture();
  try {
    f.capture('PreToolUse');
    f.change();
    f.capture('PostToolUse');
    const result = measureFindingOpportunity(f.store, 'prospective');
    assert.equal(result.observedOutcome, 'pass');
    assert.equal(result.outcome, 'unknown');
    assert.equal(result.incrementalBenefit, 'unknown');
    assert.equal(inspectFinding(f.store, f.findingId).deliveries.length, 0);
    assert.deepEqual(pendingFindingReviews(f.store), [], 'a measured no-advice opportunity does not need a delivery review');
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 0);
    assert.equal(inspectFinding(f.store, f.findingId).opportunities[0]?.evidence?.observedOutcome, 'pass');
    assert.equal(inspectFinding(f.store, f.findingId).opportunities[0]?.reviewTemplate, null);
  } finally { f.close(); }
});

test('ordinary live hooks retain the no-delivery outcome automatically', () => {
  const f = prospectiveFixture();
  try {
    const spool = { spoolDir: join(f.root, 'spool') };
    spoolCodexHookEvent({ ...f.event, hook_event_name: 'PreToolUse' }, spool);
    f.change();
    spoolCodexHookEvent({ ...f.event, hook_event_name: 'PostToolUse' }, spool);
    const entry = inspectFinding(f.store, f.findingId).opportunities[0];
    assert.equal(entry.evidence?.observedOutcome, 'pass');
    assert.equal(entry.reviewTemplate, null);
    assert.equal(inspectFinding(f.store, f.findingId).deliveries.length, 0);
  } finally { f.close(); }
});

test('assignment precedes delivery and is stable across retries in both comparison arms', () => {
  for (const advice of [false, true]) {
    const f = prospectiveFixture();
    try {
      const assignment = decisions.assignFindingOpportunity(f.store, f.input.id, () => advice ? 0.1 : 0.9);
      assert.equal(assignment.action, advice ? 'advice' : 'no-advice');
      assert.equal(assignment.probability, 0.5);
      assert.deepEqual(decisions.assignFindingOpportunity(f.store, f.input.id, () => { throw new Error('must not rerandomize'); }), assignment);
      let output = '';
      decisions.emitFindingOpportunity(f.store, f.input.id, text => { output += text; });
      decisions.emitFindingOpportunity(f.store, f.input.id, text => { output += text; });
      assert.equal(output.includes(f.input.claim.action), advice);
      assert.equal(inspectFinding(f.store, f.findingId).deliveries.length, advice ? 1 : 0);
      f.capture('PreToolUse'); f.change(); f.capture('PostToolUse');
      const evidence = measureFindingOpportunity(f.store, f.input.id);
      assert.equal(evidence.observedOutcome, 'pass');
      assert.equal(evidence.assignment?.action, assignment.action);
      assert.equal(evidence.incrementalBenefit, 'unknown');
    } finally { f.close(); }
  }
});

test('one trial cannot rerandomize a session or enroll a session already exposed to its lesson', () => {
  for (const exposed of [false, true]) {
    const f = prospectiveFixture();
    try {
      if (exposed) f.deliver(f.root, f.input.prospective.sessionId);
      else {
        registerFindingOpportunity(f.store, { ...f.input, id: 'second-opportunity' });
        f.review('second-opportunity');
        decisions.assignFindingOpportunity(f.store, 'second-opportunity');
      }
      assert.throws(() => decisions.assignFindingOpportunity(f.store, f.input.id), /session.*(assigned|exposed)/);
    } finally { f.close(); }
  }
});

test('late assignments and deliveries are rejected, and withdrawn measurements lose their outcome', () => {
  const f = prospectiveFixture();
  try {
    decisions.assignFindingOpportunity(f.store, f.input.id, () => 0.1);
    f.capture('PreToolUse');
    assert.throws(() => decisions.emitFindingOpportunity(f.store, f.input.id, () => assert.fail('too late')), /precede the action/);
    f.change(); f.capture('PostToolUse');
    const measured = measureFindingOpportunity(f.store, f.input.id);
    withdrawFindingEvidence(f.store, { evidenceRef: measured.id, author: 'reviewer', rationale: 'The evaluator missed a required case.' });
    assert.equal(resolveFindingEvidence(f.store.db, measured.id).observedOutcome, 'unknown');
    assert.equal(inspectFinding(f.store, f.findingId).deliveries.length, 0);
  } finally { f.close(); }
});

test('an ended opportunity cannot be randomized after its empty outcome window closed', () => {
  const f = prospectiveFixture();
  try {
    closeFindingTrialWindow(f.store, f.input.id, 'Stop');
    assert.throws(() => decisions.assignFindingOpportunity(f.store, f.input.id), /closed/);
  } finally { f.close(); }
});

test('a prospective delivered counterexample still suspends the finding through existing validity checks', () => {
  const f = prospectiveFixture();
  try {
    decisions.assignFindingOpportunity(f.store, f.input.id, () => 0.1);
    decisions.emitFindingOpportunity(f.store, f.input.id, () => {});
    f.capture('PreToolUse');
    writeFileSync(f.source, JSON.stringify({ applicable: true, followed: true, predicted: false }));
    f.capture('PostToolUse');
    measureFindingOpportunity(f.store, f.input.id);
    const review = inspectFinding(f.store, f.findingId).opportunities[0].reviewTemplate!;
    recordFindingFeedback(f.store, { ...review, rationale: 'The declared action occurred, but the retained prediction failed.' });
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'needs-revision');
  } finally { f.close(); }
});
