import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fixture } from './helpers/session-finding-fixture.ts';
import { renderSessionLessons } from '../src/lyo/selection/session-hook.ts';
import { inspectFinding, recordFindingFeedback, reviseFinding } from '../src/lyo/selection/session-findings.ts';
import { execFileSync } from 'node:child_process';

test('withdrawing evidence suspends feedback and wording derived from that premise', async () => {
  const { withdrawFindingEvidence } = await import('../src/lyo/selection/session-finding-evidence.ts');
  const f = fixture();
  try {
    const delivery = f.deliver();
    const evidence = f.evidenceFor(delivery.deliveryId, { applicable: true, followed: true, predicted: false });
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id, outcome: 'contradicted' });
    reviseFinding(f.store, { id: 'derived', findingId: f.findingId, previousVersion: inspectFinding(f.store, f.findingId).version,
      intervention: 'Replacement derived from the counterexample.', feedbackIds: ['review-1'], author: 'reviewer', rationale: 'Repair the observed defect.' });
    assert.match(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' })!, /Replacement derived/);
    const childDelivery = f.deliver(f.root, `${f.root}:child`);
    const childEvidence = f.evidenceFor(childDelivery.deliveryId, { applicable: true, followed: true, predicted: false });
    recordFindingFeedback(f.store, { ...f.feedback, id: 'child-review', deliveryId: childDelivery.deliveryId, evidenceRef: childEvidence.id, outcome: 'contradicted' });
    reviseFinding(f.store, { id: 'descendant', findingId: f.findingId, previousVersion: inspectFinding(f.store, f.findingId).version,
      intervention: 'Descendant wording with its own check.', feedbackIds: ['child-review'], author: 'reviewer', rationale: 'Repair the later defect.' });
    withdrawFindingEvidence(f.store, { evidenceRef: evidence.id, author: 'reviewer', rationale: 'The registered evaluator checked the wrong contract.' });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'needs-reassessment');
    assert.deepEqual(state.staleRevisionIds, ['derived']);
    assert.equal(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' }), null);
    assert.equal(state.feedback.length, 2, 'historical reviews are retained');
    assert.deepEqual(state.currentFeedback.map(row => row.id), ['child-review'], 'unaffected evidence remains, but cannot silently repair an invalid ancestor');
  } finally { f.close(); }
});

test('a later reviewed outcome is linked to the emitted finding and informs the next ordinary prompt', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    assert.match(delivery.output, /target whitespace/);
    const evidence = f.evidenceFor(delivery.deliveryId);
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: evidence.id });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'supported');
    assert.equal(state.feedback[0].deliveryId, delivery.deliveryId);
    assert.equal(state.feedback[0].version, state.version);
    assert.equal(state.feedback[0].evidenceRef, evidence.id);
    assert.match(f.deliver(f.root, `${f.root}:later`).output, /1 supporting observation/);
    assert.deepEqual(f.store.getTrace(f.findingId), f.source, 'source evidence remains immutable');
  } finally { f.close(); }
});

test('one inapplicable task requests scope review without excluding a different task in the same repository', () => {
  const f = fixture();
  try {
    const other = join(f.root, 'other'); mkdirSync(other);
    const unseen = join(f.root, 'unseen'); mkdirSync(unseen);
    const misplaced = f.deliver();
    const useful = f.deliver(other, `${f.root}:other`);
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: useful.deliveryId, evidenceRef: f.evidenceFor(useful.deliveryId).id });
    recordFindingFeedback(f.store, { ...f.feedback, id: 'wrong-context', deliveryId: misplaced.deliveryId,
      applicability: 'inapplicable', adherence: 'unknown', outcome: 'unknown',
      evidenceRef: f.evidenceFor(misplaced.deliveryId, { applicable: false, followed: null, predicted: null }).id,
      rationale: 'This task was reviewing formatting, not transferring a repair.' });
    assert.match(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review] Transfer a parser repair.' })!, /target whitespace/);
    assert.match(renderSessionLessons({ cwd: other, prompt: '[lyo:transfer-review]' })!, /1 supporting observation/);
    assert.doesNotMatch(renderSessionLessons({ cwd: unseen, prompt: '[lyo:transfer-review]' })!, /supporting observation/,
      'positive evidence in one context does not validate an unseen context');
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'supported');
    assert.equal(state.excludedContexts.length, 0);
    assert.deepEqual(state.scopeReviewFeedbackIds, ['wrong-context']);
    assert.equal(state.feedback.length, 2);
  } finally { f.close(); }
});

test('a finding followed in an applicable context but contradicted by evidence stops delivery pending revision', () => {
  const f = fixture();
  try {
    const delivered = f.deliver();
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: delivered.deliveryId, outcome: 'contradicted',
      evidenceRef: f.evidenceFor(delivered.deliveryId, { applicable: true, followed: true, predicted: false }).id,
      rationale: 'The prescribed check was followed but excludes a required class of inputs.' });
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'needs-revision');
    assert.equal(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' }), null);
    const other = join(f.root, 'another'); mkdirSync(other);
    assert.equal(renderSessionLessons({ cwd: other, prompt: '[lyo:transfer-review]' }), null);
    assert.equal(inspectFinding(f.store, f.findingId).excludedContexts.length, 0,
      'a content defect is not disguised as an insertion-context exclusion');
  } finally { f.close(); }
});

test('feedback retries are idempotent and conflicting reuse of a review identity cannot rewrite evidence', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const input = { ...f.feedback, deliveryId: delivery.deliveryId, evidenceRef: f.evidenceFor(delivery.deliveryId).id };
    const first = recordFindingFeedback(f.store, input);
    assert.deepEqual(recordFindingFeedback(f.store, input), first);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, outcome: 'contradicted' }), /must match/);
    assert.equal(inspectFinding(f.store, f.findingId).feedback.length, 1);
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 1);
  } finally { f.close(); }
});

test('unknown or unfollowed evidence is retained without asserting validity, and unsupported judgments are rejected', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const input = { ...f.feedback, deliveryId: delivery.deliveryId,
      evidenceRef: f.evidenceFor(delivery.deliveryId, { applicable: true, followed: false, predicted: null }).id };
    recordFindingFeedback(f.store, { ...input, adherence: 'not-followed', outcome: 'unknown' });
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
    assert.match(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' })!, /target whitespace/);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'unsupported', adherence: 'unknown' }), /applicable and followed/);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'misplaced', applicability: 'inapplicable' }), /applicable and followed/);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'absent', deliveryId: 'not-delivered' }), /unknown finding delivery/);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'unrelated', findingId: 'another-finding' }), /delivery lacks/);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'no-evidence', evidenceRef: '' }));
    assert.equal(inspectFinding(f.store, f.findingId).feedback.length, 1);
  } finally { f.close(); }
});

test('revised advice is a new provisional version; late outcomes remain attached to the old wording', () => {
  const f = fixture();
  try {
    const old = f.deliver();
    const pending = f.deliver(f.root, `${f.root}:pending`);
    recordFindingFeedback(f.store, { ...f.feedback, deliveryId: old.deliveryId, outcome: 'contradicted',
      evidenceRef: f.evidenceFor(old.deliveryId, { applicable: true, followed: true, predicted: false }).id });
    const previousVersion = inspectFinding(f.store, f.findingId).version;
    const revision = { id: 'repair-1', findingId: f.findingId, previousVersion,
      intervention: 'Verify whitespace against the target contract, including its Unicode cases.',
      feedbackIds: ['review-1'], author: 'maintainer', rationale: 'Replace the incomplete check identified by the counterexample.' };
    const revised = reviseFinding(f.store, revision);
    assert.notEqual(revised.version, previousVersion);
    assert.equal(inspectFinding(f.store, f.findingId).validity, 'unvalidated');
    assert.match(f.deliver().output, /including its Unicode cases/, 'a new version can reach a session that received the old one');
    recordFindingFeedback(f.store, { ...f.feedback, id: 'late-review', deliveryId: pending.deliveryId, outcome: 'contradicted',
      evidenceRef: f.evidenceFor(pending.deliveryId, { applicable: true, followed: true, predicted: false }).id });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.validity, 'unvalidated');
    assert.equal(state.feedback.find(row => row.id === 'late-review')!.version, previousVersion);
    assert.equal(state.revisions.length, 1);
    assert.deepEqual(reviseFinding(f.store, revision), revised, 'revision retries do not append again');
    assert.throws(() => reviseFinding(f.store, { ...revision, id: 'stale-repair' }), /stale finding version/);
    assert.deepEqual(f.store.getTrace(f.findingId), f.source);
  } finally { f.close(); }
});

test('corrected reviews retain history and cannot double-count a measured application', () => {
  const f = fixture();
  try {
    const delivered = f.deliver();
    const input = { ...f.feedback, deliveryId: delivered.deliveryId, evidenceRef: f.evidenceFor(delivered.deliveryId).id };
    recordFindingFeedback(f.store, input);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'duplicate-review' }), /already reviewed/);
    recordFindingFeedback(f.store, { ...input, id: 'corrected-review', supersedes: 'review-1', rationale: 'Clarify the retained check result.' });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.feedback.length, 2);
    assert.equal(state.currentFeedback.length, 1);
    assert.equal(state.supporting, 1);
    assert.throws(() => recordFindingFeedback(f.store, { ...input, id: 'wrong-correction', supersedes: 'review-1' }), /current review/);
  } finally { f.close(); }
});

test('ordinary-session commands register, measure, review and revise the exact delivered finding', () => {
  const f = fixture();
  const cli = (...args: string[]) => JSON.parse(execFileSync(process.execPath,
    [join(import.meta.dirname, '../src/cli.ts'), 'finding', ...args, '--store', f.storePath], { cwd: f.root, encoding: 'utf8' }));
  try {
    const delivery = f.deliver();
    const before = cli('inspect', '--finding-id', f.findingId).finding;
    assert.equal(before.deliveries[0].registrationTemplate.deliveryId, delivery.deliveryId);
    const prepared = f.prepare(delivery.deliveryId, { applicable: true, followed: true, predicted: false });
    const inputPath = join(f.root, 'input.json');
    writeFileSync(inputPath, JSON.stringify(prepared.input));
    assert.equal(cli('register', '--input', inputPath).opportunity.input.id, prepared.id);
    assert.equal(cli('inspect', '--finding-id', f.findingId).finding.opportunities[0].evidence, null);
    writeFileSync(prepared.source, JSON.stringify({ applicable: true, followed: true, predicted: false }));
    assert.equal(cli('measure', '--opportunity-id', prepared.id).evidence.outcome, 'contradicted');
    const template = cli('inspect', '--finding-id', f.findingId).finding.opportunities[0].reviewTemplate;
    writeFileSync(inputPath, JSON.stringify({ ...template, rationale: 'The declared evaluator found the counterexample.' }));
    assert.equal(cli('feedback', '--input', inputPath).ok, true);
    const judged = cli('inspect', '--finding-id', f.findingId).finding;
    assert.equal(judged.validity, 'needs-revision');
    writeFileSync(inputPath, JSON.stringify({ id: 'cli-repair', findingId: f.findingId, previousVersion: judged.version,
      intervention: 'Use the target contract to choose Unicode whitespace checks.', feedbackIds: [template.id],
      author: 'maintainer', rationale: 'Repair the incomplete advice identified by the check.' }));
    assert.equal(cli('revise', '--input', inputPath).ok, true);
    assert.match(f.deliver().output, /choose Unicode whitespace checks/);
    writeFileSync(inputPath, JSON.stringify({ evidenceRef: template.evidenceRef, author: 'maintainer', rationale: 'Evaluator contract was wrong.' }));
    assert.equal(cli('withdraw', '--input', inputPath).ok, true);
    assert.equal(cli('inspect', '--finding-id', f.findingId).finding.validity, 'needs-reassessment');
  } finally { f.close(); }
});

test('a broken revision chain suppresses that finding without hiding ordinary guidance', () => {
  const f = fixture();
  try {
    f.store.createLesson({ failure_class: 'output_generation', trigger_cue: 'existing', intervention: 'Ordinary guidance.' });
    f.store.recordTrace({ trace_id: 'broken-revision', kind: 'behavior', summary: 'Invalid revision import',
      payload: { source: 'session-finding-revision@1', id: 'broken', findingId: f.findingId,
        previousVersion: 'not-the-source-version', version: 'bad-version', intervention: 'Invalid replacement.',
        feedbackIds: ['missing'], author: 'import', rationale: 'Broken lineage.' } });
    const output = renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' });
    assert.match(output!, /Ordinary guidance/);
    assert.doesNotMatch(output!, /Invalid replacement|target whitespace/);
    assert.throws(() => inspectFinding(f.store, f.findingId), /broken finding revision chain/);
  } finally { f.close(); }
});

test('legacy attestations stay inspectable without driving validity, scope or derived wording', () => {
  const f = fixture();
  try {
    const delivery = f.deliver();
    const snapshot = JSON.parse(f.store.getTrace(delivery.deliveryId)!.payload_json!).findings[0];
    f.store.recordTrace({ trace_id: 'finding-feedback:legacy', kind: 'behavior', summary: 'Legacy imported attestation',
      payload: { ...f.feedback, id: 'legacy', deliveryId: delivery.deliveryId, version: snapshot.version, context: snapshot.context,
        source: 'session-finding-feedback@1', applicability: 'inapplicable', adherence: 'unknown', outcome: 'unknown' } });
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.feedback.length, 1);
    assert.equal(state.currentFeedback.length, 0);
    assert.deepEqual(state.unverifiedFeedbackIds, ['legacy']);
    assert.equal(state.validity, 'unvalidated');
    assert.match(renderSessionLessons({ cwd: f.root, prompt: '[lyo:transfer-review]' })!, /target whitespace/);
    assert.throws(() => reviseFinding(f.store, { id: 'unsupported', findingId: f.findingId, previousVersion: state.version,
      intervention: 'Unsupported replacement.', feedbackIds: ['legacy'], author: 'reviewer', rationale: 'No checked premise.' }), /checked contradiction/);
  } finally { f.close(); }
});
