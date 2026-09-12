import assert from 'node:assert/strict';
import { runWithoutModule } from './helpers/module-boundary.ts';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { trialFixture } from './helpers/finding-trial-fixture.ts';
import { inspectFinding } from '../src/lyo/interface/session-findings.ts';
import { spoolCodexHookEvent, spoolClaudeHookEvent } from '../src/hooks/runtime.ts';
import * as trials from '../src/lyo/interface/finding-trials.ts';
import { measureFindingOpportunity } from '../src/lyo/interface/session-finding-evidence.ts';
import { emitSessionLessons } from '../src/lyo/selection/session-hook.ts';

test('ordinary trial registration loads without the session hook entrypoint', () => {
  const trialsUrl = new URL('../src/lyo/interface/finding-trials.ts', import.meta.url);
  const hookUrl = new URL('../src/lyo/selection/session-hook.ts', import.meta.url);
  runWithoutModule(hookUrl, `
    const { ordinaryFindingTrialFeedback } = await import(${JSON.stringify(trialsUrl.href)});
    assert.deepEqual(ordinaryFindingTrialFeedback('codex', {}, null), { managed: false });
  `);
});

test('a reviewed trigger automatically registers an ordinary session before its next action', () => {
  for (const runtime of ['codex', 'claude'] as const) for (const advice of [false, true]) {
    const f = trialFixture();
    try {
      trials.registerFindingTrial(f.store, f.trial);
      const event = f.event, measurement = f.trial.measurement;
      const result = trials.ordinaryFindingTrialFeedback(runtime, event, f.storePath, () => advice ? 0.1 : 0.9);
      assert.equal(result.managed, true);
      assert.equal(Boolean(result.additionalContext?.includes(measurement.claim.action)), advice);
      const entry = inspectFinding(f.store, f.findingId).opportunities.find(row => row.registered?.sessionId === 'ordinary-session')!;
      assert.ok(entry, 'the ordinary session needed no manual opportunity registration');
      const hook = runtime === 'codex' ? spoolCodexHookEvent : spoolClaudeHookEvent;
      hook(event, { spoolDir: join(f.root, 'spool') });
      assert.equal(f.store.getTrace(`finding-evidence:${entry.id}`), null, 'a duplicate diagnostic is not the later action');
      const action = { ...event, tool_use_id: 'repair-1', tool_input: { command: 'an action decided after receiving the hook context' } };
      f.complete(runtime, action, { applicable: true, followed: advice, predicted: true });
      const completed = inspectFinding(f.store, f.findingId).opportunities.find(row => row.id === entry.id)!;
      assert.equal(completed.evidence?.observedOutcome, 'pass');
      assert.equal(completed.evidence?.assignment?.action, advice ? 'advice' : 'no-advice');
      assert.equal(completed.evidence?.incrementalBenefit, 'unknown');
    } finally { f.close(); }
  }
});


test('configured CLI hooks recognize the trial and isolate it from the native recovery experiment', () => {
  for (const runtime of ['codex', 'claude']) {
    const f = trialFixture();
    try {
      const definition = join(f.root, 'trial.json');
      writeFileSync(definition, JSON.stringify(f.trial));
      f.cli(['finding', 'trial-register', '--input', definition, '--store', f.storePath]);
      assert.equal(f.cli(['finding', 'trials', '--store', f.storePath]).trials.length, 1);
      f.cli([`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'], { ...f.event, hook_event_name: 'SessionStart' });
      const output = f.cli([`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'], { ...f.event, model: undefined });
      const entry = inspectFinding(f.store, f.findingId).opportunities.find(row => row.registered?.sessionId === f.event.session_id);
      assert.ok(entry, 'the configured CLI path must register the trial');
      assert.doesNotMatch(JSON.stringify(output), /LYO recovery experiment/);
      assert.doesNotMatch(JSON.stringify(output), /Pending finding review/);
      const action = { ...f.event, tool_use_id: 'cli-action', tool_input: { command: 'repair' } };
      f.cli([`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'], { ...action, hook_event_name: 'PreToolUse' });
      writeFileSync(f.target.source, JSON.stringify({ applicable: true, followed: false, predicted: true }));
      f.cli([`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'], { ...action, tool_response: { exit_code: 0 } });
      assert.equal(inspectFinding(f.store, f.findingId).opportunities.find(row => row.id === entry.id)?.evidence?.observedOutcome, 'pass');
    } finally { f.close(); }
  }
});

test('automatic enrollment retains its trigger and declines interrupted, unscoped, or unknown-model observations', () => {
  const f = trialFixture();
  try {
    const definition = trials.registerFindingTrial(f.store, f.trial);
    for (const change of [{ model: undefined }, { model: 'different-model' }, { cwd: '/private/tmp' },
      { hook_event_name: 'PostToolUseFailure', is_interrupt: true }]) {
      assert.equal(trials.ordinaryFindingTrialFeedback('codex', { ...f.event, ...change }, f.storePath).managed, false);
    }
    trials.ordinaryFindingTrialFeedback('codex', f.event, f.storePath, () => 0.9);
    const entry = inspectFinding(f.store, f.findingId).opportunities.find(row => row.registered?.sessionId === f.event.session_id)!;
    assert.equal(entry.registered?.input.prospective?.automatic?.trialHash, definition.hash);
    assert.equal(entry.registered?.input.prospective?.automatic?.trigger.toolUseId, f.event.tool_use_id);
    assert.equal(trials.ordinaryFindingTrialFeedback('codex', f.event, f.storePath, () => { throw new Error('duplicate draw'); }).managed, true);
  } finally { f.close(); }
});

test('ordinary banners cannot expose trial-managed advice before assignment', () => {
  const f = trialFixture();
  try {
    trials.registerFindingTrial(f.store, f.trial);
    f.store.createLesson({ failure_class: 'output_generation', trigger_cue: 'duplicate advice', intervention: f.trial.measurement.claim.action });
    measureFindingOpportunity(f.store, 'application-1');
    assert.doesNotMatch(f.deliver(f.target.cwd, 'fresh-session').output, /Check the target whitespace contract|Pending finding review/);
  } finally { f.close(); }
});

test('compaction restores only previously delivered trial advice while its pending state still matches', () => {
  for (const advice of [false, true]) {
    const f = trialFixture();
    try {
      trials.registerFindingTrial(f.store, f.trial);
      trials.ordinaryFindingTrialFeedback('codex', f.event, f.storePath, () => advice ? 0.1 : 0.9);
      const refresh = (extra = {}) => {
        let output = '';
        emitSessionLessons({ ...f.event, hook_event_name: 'SessionStart', source: 'compact', ...extra }, text => { output += text; });
        return output;
      };
      for (let i = 0; i < 2; i++) assert.equal(refresh().includes(f.trial.measurement.claim.action), advice);
      assert.doesNotMatch(refresh({ model: 'different-model' }), /Check the target whitespace/);
      assert.doesNotMatch(refresh({ cwd: f.root }), /Check the target whitespace/);
      const state = inspectFinding(f.store, f.findingId);
      assert.equal(state.deliveries.filter(row => row.sessionId === f.event.session_id).length, advice ? 1 : 0);
      assert.equal(state.supporting, 0);
      const before = JSON.stringify({ applicable: true, followed: false, predicted: false });
      writeFileSync(f.target.source, JSON.stringify({ applicable: false, followed: false, predicted: false }));
      assert.doesNotMatch(refresh(), /Check the target whitespace/);
      writeFileSync(f.target.source, before);
      assert.equal(refresh().includes(f.trial.measurement.claim.action), advice);
      assert.doesNotMatch(refresh({ hook_event_name: 'UserPromptSubmit', prompt: 'A different task.' }), /Check the target whitespace/);
      assert.doesNotMatch(refresh(), /Check the target whitespace/, 'compaction cannot reopen the preceding turn trial');
    } finally { f.close(); }
  }
});

test('one ordinary trial owns the session even when an earlier definition matches a later event', () => {
  const f = trialFixture();
  try {
    trials.registerFindingTrial(f.store, { ...f.trial, trigger: { ...f.trial.trigger, toolInput: { command: 'other-diagnostic' } } });
    const payload = JSON.parse(f.store.getTrace(f.findingId)!.payload_json!);
    f.store.recordTrace({ trace_id: 'finding:second', kind: 'behavior', summary: 'Second synthetic finding', payload });
    trials.registerFindingTrial(f.store, { ...f.trial, id: 'second-trial', findingId: 'finding:second',
      findingVersion: inspectFinding(f.store, 'finding:second').version });
    trials.ordinaryFindingTrialFeedback('codex', f.event, f.storePath, () => 0.9);
    trials.ordinaryFindingTrialFeedback('codex', { ...f.event, tool_input: { command: 'other-diagnostic' } }, f.storePath, () => 0.1);
    assert.equal(f.store.db.prepare("SELECT count(*) AS n FROM learning_trace WHERE run_id = ? AND json_extract(payload_json, '$.source') = 'session-finding-assignment@1'").get(f.event.session_id)!.n, 1);
  } finally { f.close(); }
});

test('a model change at the measured action cannot supply an outcome for the original model', () => {
  const f = trialFixture();
  try {
    trials.registerFindingTrial(f.store, f.trial);
    trials.ordinaryFindingTrialFeedback('codex', f.event, f.storePath, () => 0.9);
    f.complete('codex', { ...f.event, model: 'changed-model', tool_use_id: 'different-model-action' },
      { applicable: true, followed: false, predicted: true });
    const entry = inspectFinding(f.store, f.findingId).opportunities.find(row => row.registered?.sessionId === f.event.session_id)!;
    assert.equal(entry.evidence?.observedOutcome, 'unknown');
  } finally { f.close(); }
});
