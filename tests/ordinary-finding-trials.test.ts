import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { trialFixture } from './helpers/finding-trial-fixture.ts';
import { inspectFinding } from '../src/lyo/selection/session-findings.ts';
import { spoolCodexHookEvent, spoolClaudeHookEvent } from '../src/hooks/runtime.ts';
import * as trials from '../src/lyo/selection/finding-trials.ts';
import { measureFindingOpportunity } from '../src/lyo/selection/session-finding-evidence.ts';

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
      hook({ ...action, hook_event_name: 'PreToolUse' }, { spoolDir: join(f.root, 'spool') });
      writeFileSync(f.target.source, JSON.stringify({ applicable: true, followed: advice, predicted: true }));
      hook({ ...action, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, { spoolDir: join(f.root, 'spool') });
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
      const output = f.cli([`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'], f.event);
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
    measureFindingOpportunity(f.store, 'application-1');
    assert.doesNotMatch(f.deliver(f.target.cwd, 'fresh-session').output, /Check the target whitespace contract|Pending finding review/);
  } finally { f.close(); }
});
