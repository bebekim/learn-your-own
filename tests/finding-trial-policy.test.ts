import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';
import { trialFixture } from './helpers/finding-trial-fixture.ts';
import { registerFindingTrial, findingTrials, ordinaryFindingTrialFeedback } from '../src/lyo/interface/finding-trials.ts';
import { reconcileFindingTrial } from '../src/lyo/interface/finding-trial-policy.ts';
import { findingAssignment, withdrawFindingEvidence } from '../src/lyo/interface/session-finding-evidence.ts';
import { inspectFinding } from '../src/lyo/interface/session-findings.ts';
import { spoolCodexHookEvent } from '../src/lyo/hooks/runtime.ts';

test('a fixed prospective comparison changes later delivery and later failure pauses that scope', () => {
  const f = trialFixture();
  try {
    registerFindingTrial(f.store, { ...f.trial, runtime: 'codex',
      measurement: { ...f.trial.measurement, claim: { ...f.trial.measurement.claim, kind: 'improvement' } },
      review: { ...f.trial.review, claimKind: 'improvement' },
      evaluation: { sampleSize: 32, minimumEffect: 0.02, alpha: 0.05,
        assumptions: 'Synthetic independent workspaces; no shared edits or prior lesson exposure.' } });
    const trial = findingTrials(f.store.db)[0];
    const report = () => reconcileFindingTrial(f.store, trial).content;
    const initialPolicy = reconcileFindingTrial(f.store, trial);
    assert.deepEqual(reconcileFindingTrial(f.store, trial), initialPolicy, 'unchanged evidence preserves policy identity and receipt');
    const run = (name: string, draw: number, pass?: boolean) => {
      const workspace = f.workspace(name), event = { ...f.event, cwd: workspace.cwd, session_id: name };
      const output = ordinaryFindingTrialFeedback('codex', event, f.storePath, () => draw);
      const entry = inspectFinding(f.store, f.findingId).opportunities.find(row => row.registered?.sessionId === name)!;
      assert.ok(entry);
      const action = { ...event, tool_use_id: `action:${name}`, tool_input: { command: 'repair' } };
      f.complete('codex', action, { applicable: true, followed: Boolean(output.additionalContext), predicted: pass ?? draw < 0.5 });
      ordinaryFindingTrialFeedback('codex', action, f.storePath);
      return { entry, output, assignment: findingAssignment(f.store.db, entry.id)! };
    };
    const ids: string[] = [];
    for (let n = 0; n < 32; n++) {
      assert.equal(report().status, 'collecting', 'partial cohorts cannot promote through repeated peeking');
      ids.push(run(`task-${n}`, n % 2 ? 0.9 : 0.1).entry.id);
    }
    assert.equal(report().status, 'promoted');
    assert.ok(report().effectInterval![0] > 0.02);
    const later = run('later-success', 0.9, true);
    assert.ok(later.output.additionalContext, 'promotion changes delivery even when exploration would withhold it');
    assert.equal(later.assignment.probability, 1);
    assert.equal(report().status, 'promoted');
    run('later-failure', 0.9, false);
    assert.equal(report().status, 'needs-review');
    const paused = run('after-pause', 0.1, true);
    assert.equal(paused.output.additionalContext, undefined);
    assert.equal(paused.assignment.action, 'no-advice');
    withdrawFindingEvidence(f.store, { evidenceRef: `finding-evidence:${ids[0]}`, author: 'fixture-reviewer', rationale: 'Test correction of the original benefit evidence.' });
    assert.equal(report().status, 'inconclusive');
    assert.equal(report().arms.advice.unknown, 1);
    const decisions = f.store.db.prepare("SELECT count(*) AS n FROM learning_trace WHERE json_extract(payload_json, '$.source') = 'session-finding-policy@1'").get()!;
    assert.ok(Number(decisions.n) > 3, 'policy history remains traceable across corrections');
  } finally { f.close(); }
});

test('a registered exact-binomial trial promotes from a cohort too small for Hoeffding', () => {
  const f = trialFixture();
  try {
    const improvement = { runtime: 'codex' as const,
      measurement: { ...f.trial.measurement, claim: { ...f.trial.measurement.claim, kind: 'improvement' } },
      review: { ...f.trial.review, claimKind: 'improvement' } };
    const evaluation = { sampleSize: 8, minimumEffect: 0, alpha: 0.1, assumptions: 'Synthetic independent workspaces.' };
    assert.throws(() => registerFindingTrial(f.store, { ...f.trial, ...improvement,
      evaluation: { ...evaluation, sampleSize: 1001, method: 'exact-binomial' } }), /at most 1000/);
    registerFindingTrial(f.store, { ...f.trial, ...improvement, evaluation: { ...evaluation, method: 'exact-binomial' } });
    const trial = findingTrials(f.store.db)[0];
    assert.equal(trial.evaluation?.method, 'exact-binomial');
    for (let n = 0; n < 8; n++) {
      const name = `exact-${n}`, draw = n % 2 ? 0.9 : 0.1;
      const event = { ...f.event, cwd: f.workspace(name).cwd, session_id: name };
      const output = ordinaryFindingTrialFeedback('codex', event, f.storePath, () => draw);
      const action = { ...event, tool_use_id: `action:${name}`, tool_input: { command: 'repair' } };
      f.complete('codex', action, { applicable: true, followed: Boolean(output.additionalContext), predicted: draw < 0.5 });
      ordinaryFindingTrialFeedback('codex', action, f.storePath);
    }
    const report = reconcileFindingTrial(f.store, trial).content;
    assert.deepEqual([report.arms.advice.pass, report.arms['no-advice'].fail], [4, 4]);
    assert.equal(report.status, 'promoted');
    assert.equal(reconcileFindingTrial(f.store, { ...trial, evaluation: { ...evaluation } }).content.status, 'inconclusive',
      'the same counts under Hoeffding cannot clear zero');
  } finally { f.close(); }
});

test('session enrollment pools capped sessions per repository under the stratified test', () => {
  const f = trialFixture();
  try {
    const base = { ...f.trial, runtime: 'codex' as const,
      measurement: { ...f.trial.measurement, claim: { ...f.trial.measurement.claim, kind: 'improvement' } },
      review: { ...f.trial.review, claimKind: 'improvement' } };
    const evaluation = { sampleSize: 8, minimumEffect: 0, alpha: 0.1, assumptions: 'No interference between sessions.',
      method: 'stratified-exact' as const };
    const enrollment = { unit: 'session' as const, maxPerRepository: 4 };
    assert.throws(() => registerFindingTrial(f.store, { ...base, enrollment, evaluation: { ...evaluation, method: 'exact-binomial' } }),
      /requires evaluation.method stratified-exact/);
    assert.throws(() => registerFindingTrial(f.store, { ...base, evaluation }), /needs session enrollment/);
    assert.throws(() => registerFindingTrial(f.store, { ...base, enrollment, evaluation: { ...evaluation, minimumEffect: 0.1 } }),
      /requires minimumEffect 0/);
    registerFindingTrial(f.store, { ...base, enrollment, evaluation });
    const trial = findingTrials(f.store.db)[0];
    const run = (repository: string, n: number) => {
      const name = `${repository}-${n}`, draw = n % 2 ? 0.9 : 0.1;
      const event = { ...f.event, cwd: f.workspace(repository).cwd, session_id: name };
      const output = ordinaryFindingTrialFeedback('codex', event, f.storePath, () => draw);
      const action = { ...event, tool_use_id: `action:${name}`, tool_input: { command: 'repair' } };
      f.complete('codex', action, { applicable: true, followed: Boolean(output.additionalContext), predicted: draw < 0.5 });
      ordinaryFindingTrialFeedback('codex', action, f.storePath);
      return output;
    };
    for (let n = 0; n < 4; n++) run('repo-a', n);
    assert.throws(() => run('repo-a', 4), /session limit/, 'one repository cannot fill the randomized cohort');
    for (let n = 0; n < 4; n++) run('repo-b', n);
    const report = reconcileFindingTrial(f.store, trial).content;
    assert.equal(report.arms.advice.assigned, 4);
    assert.equal(report.status, 'promoted');
    assert.ok(Math.abs(report.pValues!.benefit - 1 / 36) < 1e-12, 'two repositories, each 2/2 versus 0/2');
    assert.ok(run('repo-a', 5).additionalContext, 'a capped repository still receives promoted advice');
  } finally { f.close(); }
});

test('a closed missing outcome stays unknown and a replacement scope starts with fresh evidence', () => {
  const f = trialFixture();
  try {
    registerFindingTrial(f.store, { ...f.trial, runtime: 'codex', evaluation: { sampleSize: 2,
      minimumEffect: 0.1, alpha: 0.05, assumptions: 'Synthetic separate workspaces.' } });
    const trial = findingTrials(f.store.db)[0];
    const events = ['missing-1', 'missing-2'].map(name => ({ ...f.event, cwd: f.workspace(name).cwd, session_id: name }));
    for (const event of events) ordinaryFindingTrialFeedback('codex', event, f.storePath, () => 0.9);
    assert.equal(reconcileFindingTrial(f.store, trial).content.status, 'awaiting-outcomes');
    for (const event of events) ordinaryFindingTrialFeedback('codex', { ...event, hook_event_name: 'Stop' }, f.storePath);
    assert.equal(reconcileFindingTrial(f.store, trial).content.arms['no-advice'].unknown, 2);
    const late = { ...events[0], tool_use_id: 'too-late', tool_input: { command: 'repair' } };
    spoolCodexHookEvent({ ...late, hook_event_name: 'PreToolUse' }, { spoolDir: join(f.root, 'spool') });
    spoolCodexHookEvent(late, { spoolDir: join(f.root, 'spool') });
    assert.equal(reconcileFindingTrial(f.store, trial).content.arms['no-advice'].unknown, 2);
    assert.throws(() => ordinaryFindingTrialFeedback('codex', { ...events[0], session_id: 'same-workspace-new-session' }, f.storePath), /already enrolled/);
    const narrow = f.workspace('narrow');
    assert.throws(() => registerFindingTrial(f.store, { ...f.trial, id: 'ambiguous-scope', roots: [narrow.cwd] }), /supersedes/);
    registerFindingTrial(f.store, { ...f.trial, id: 'revised-scope', supersedes: trial.id, roots: [narrow.cwd] });
    assert.equal(reconcileFindingTrial(f.store, trial).content.status, 'superseded');
    assert.equal(ordinaryFindingTrialFeedback('codex', { ...f.event, session_id: 'outside-revised-scope' }, f.storePath).managed, false);
    assert.equal(ordinaryFindingTrialFeedback('codex', { ...f.event, cwd: narrow.cwd, session_id: 'inside-revised-scope' }, f.storePath, () => 0.1).managed, true);
    const replacement = findingTrials(f.store.db).find(item => item.id === 'revised-scope')!;
    assert.equal(reconcileFindingTrial(f.store, replacement).content.status, 'collecting');
    assert.equal(reconcileFindingTrial(f.store, replacement).content.arms.advice.assigned, 1);
    assert.equal(f.cli(['finding', 'trial-report', '--trial-id', replacement.id, '--store', f.storePath]).policy.content.status, 'collecting');
  } finally { f.close(); }
});
