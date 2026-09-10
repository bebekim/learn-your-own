import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fixture } from './helpers/session-finding-fixture.ts';
import { findingOpportunity, registerFindingOpportunity } from '../src/lyo/selection/session-finding-evidence.ts';
import { captureFindingAction } from '../src/lyo/selection/session-finding-capture.ts';
import { codexHookObservation } from '../src/adapters/codex.ts';
import { inspectFinding, recordFindingFeedback, reviseFinding } from '../src/lyo/selection/session-findings.ts';
import { spoolCodexHookEvent, spoolClaudeHookEvent } from '../src/hooks/runtime.ts';

test('live action capture rechecks finding state without invalidating outcomes that started before a revision', () => {
  for (const runtime of ['codex', 'claude'] as const) for (const change of ['suspended-before', 'revised-before', 'revised-after']) {
    const f = fixture();
    try {
      const sessionId = `${f.root}:pending`, delivery = f.deliver(f.root, sessionId), pending = f.prepare(delivery.deliveryId);
      const id = `${pending.id}-captured`, toolInput = { command: 'apply the delivered advice' };
      registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime, toolName: 'Bash', toolInput } });
      f.review(id);
      const registeredVersion = findingOpportunity(f.store.db, id).content.version;
      const other = f.deliver(f.root, `${f.root}:other`);
      const counterexample = f.evidenceFor(other.deliveryId, { applicable: true, followed: true, predicted: false });
      const update = () => {
        recordFindingFeedback(f.store, { ...f.feedback, deliveryId: other.deliveryId,
          evidenceRef: counterexample.id, outcome: 'contradicted' });
        if (change !== 'suspended-before') reviseFinding(f.store, { id: 'corrected', findingId: f.findingId,
          previousVersion: inspectFinding(f.store, f.findingId).version,
          intervention: 'Use the complete target whitespace contract.', feedbackIds: ['review-1'],
          author: 'reviewer', rationale: 'Retained counterexample requires a correction.' });
      };
      const hook = runtime === 'codex' ? spoolCodexHookEvent : spoolClaudeHookEvent;
      const event = { cwd: f.root, session_id: sessionId, tool_use_id: 'pending-call', tool_name: 'Bash', tool_input: toolInput };
      const spool = { spoolDir: join(f.root, 'spool') };
      if (change !== 'revised-after') update();
      hook({ ...event, hook_event_name: 'PreToolUse' }, spool);
      if (change === 'revised-after') update();
      writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
      hook({ ...event, hook_event_name: 'PostToolUse' }, spool);
      const result = inspectFinding(f.store, f.findingId).opportunities.find(row => row.id === id)!.evidence!;
      assert.equal(result.outcome, change === 'revised-after' ? 'supported' : 'unknown', `${runtime}: ${change}`);
      assert.equal(result.opportunity.version, registeredVersion);
      if (change !== 'revised-after') assert.match(result.action!.problems.join(' '), /finding.*(suspended|version)/);
    } finally { f.close(); }
  }
});

test('ordinary paired tool hooks assess a declared counterexample before the next session, without SessionEnd', () => {
  const f = fixture();
  try {
    for (const runtime of ['codex', 'claude'] as const) {
      const sessionId = `${f.root}:${runtime}`, delivery = f.deliver(f.root, sessionId);
      const pending = f.prepare(delivery.deliveryId);
      const id = `${pending.id}-automatic`, toolInput = { command: `repair ${runtime}` };
      registerFindingOpportunity(f.store, { ...pending.input, id,
        capture: { runtime, toolName: 'Bash', toolInput } });
      f.review(id);
      const hook = runtime === 'codex' ? spoolCodexHookEvent : spoolClaudeHookEvent;
      const event = { cwd: f.root, session_id: sessionId, tool_use_id: `${id}-call`, tool_name: 'Bash', tool_input: toolInput };
      const spool = { spoolDir: join(f.root, 'spool') };
      hook({ ...event, hook_event_name: 'PreToolUse' }, spool);
      writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: runtime === 'codex' }));
      hook({ ...event, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, spool);
      hook({ ...event, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }, spool);
      const state = inspectFinding(f.store, f.findingId);
      assert.equal(state.currentFeedback.filter(row => row.opportunityId === id).length, 1);
      assert.equal(state.validity, runtime === 'codex' ? 'supported' : 'needs-revision');
    }
    assert.doesNotMatch(f.deliver(f.root, `${f.root}:next`).output, /Check the target whitespace contract/);
  } finally { f.close(); }
});

test('a declared finding action keeps its input instead of being rewritten by the proxy recovery experiment', () => {
  const f = fixture();
  try {
    const sessionId = `${f.root}:native`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
    registerFindingOpportunity(f.store, { ...pending.input, id: 'declared-action',
      capture: { runtime: 'codex', toolName: 'Bash', toolInput: { command: 'npm test' } } });
    const config = join(f.root, 'config.json');
    writeFileSync(config, JSON.stringify({ rootDir: f.root, corpusPath: join(f.root, 'corpus.sqlite'), adaptiveFeedback: { mode: 'explore' } }));
    const output = JSON.parse(execFileSync(process.execPath,
      [new URL('../src/cli.ts', import.meta.url).pathname, 'codex-hook', '--db-from-event-cwd', '--spool-dir-from-event-cwd'], {
        cwd: f.root, env: { ...process.env, LYO_CONFIG_FILE: config }, encoding: 'utf8', input: JSON.stringify({
          cwd: f.root, session_id: sessionId, hook_event_name: 'PreToolUse', tool_use_id: 'native-call',
          tool_name: 'Bash', tool_input: { command: 'npm test' } }) }));
    assert.equal(output.hookSpecificOutput?.updatedInput, undefined);
  } finally { f.close(); }
});

test('missing or mismatched action boundaries and a changed starting source cannot award support', () => {
  for (const fault of ['missing-before', 'wrong-call', 'wrong-session', 'changed-before']) {
    const f = fixture();
    try {
      const sessionId = `${f.root}:fault`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
      const id = `${pending.id}-fault`, toolInput = { command: 'repair' };
      registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime: 'codex', toolName: 'Bash', toolInput } });
      f.review(id);
      const event = { cwd: f.root, session_id: sessionId, tool_use_id: 'bound-call', tool_name: 'Bash', tool_input: toolInput };
      const spool = { spoolDir: join(f.root, 'spool') };
      if (fault === 'changed-before') writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: false, predicted: null }));
      if (fault !== 'missing-before') spoolCodexHookEvent({ ...event, hook_event_name: 'PreToolUse' }, spool);
      writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
      spoolCodexHookEvent({ ...event, hook_event_name: 'PostToolUse',
        ...(fault === 'wrong-call' ? { tool_use_id: 'other-call' } : {}),
        ...(fault === 'wrong-session' ? { session_id: 'other-session' } : {}) }, spool);
      const state = inspectFinding(f.store, f.findingId);
      assert.equal(state.supporting, 0, fault);
      assert.notEqual(state.opportunities.find(row => row.id === id)?.evidence?.outcome, 'supported', fault);
    } finally { f.close(); }
  }
});

test('a later session in another repository reviews retained evidence without re-executing the old task', () => {
  const f = fixture();
  try {
    const sessionId = `${f.root}:unreviewed`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
    const id = `${pending.id}-unreviewed`, toolInput = { command: 'repair' };
    registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime: 'codex', toolName: 'Bash', toolInput } });
    const event = { cwd: f.root, session_id: sessionId, tool_use_id: 'bound-call', tool_name: 'Bash', tool_input: toolInput };
    const spool = { spoolDir: join(f.root, 'spool') };
    spoolCodexHookEvent({ ...event, hook_event_name: 'PreToolUse' }, spool);
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
    spoolCodexHookEvent({ ...event, hook_event_name: 'PostToolUse' }, spool);
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 0);
    const nextWorkspace = join(f.root, 'another-repository'); mkdirSync(nextWorkspace);
    assert.match(f.deliver(nextWorkspace, `${f.root}:review`).output, /needs-semantic-review/);
    f.review(id);
    writeFileSync(pending.source, 'files now belong to another task');
    spoolCodexHookEvent({ cwd: nextWorkspace, session_id: `${f.root}:new`, hook_event_name: 'SessionStart' }, spool);
    const state = inspectFinding(f.store, f.findingId);
    assert.equal(state.supporting, 1);
    assert.equal(state.feedback.filter(row => row.opportunityId === id).length, 2);
    assert.equal(state.currentFeedback.filter(row => row.opportunityId === id).length, 1);
  } finally { f.close(); }
});

test('recovery after capture cannot measure changed files as the earlier action result', () => {
  const f = fixture();
  try {
    const sessionId = `${f.root}:crash`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
    const id = `${pending.id}-crash`, toolInput = { command: 'repair' };
    registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime: 'codex', toolName: 'Bash', toolInput } });
    f.review(id);
    const event = { cwd: f.root, session_id: sessionId, tool_use_id: 'bound-call', tool_name: 'Bash', tool_input: toolInput };
    const registered = findingOpportunity(f.store.db, id);
    captureFindingAction(f.store, registered, codexHookObservation({ ...event, hook_event_name: 'PreToolUse' }, { includeRawPrompt: false }));
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: false }));
    captureFindingAction(f.store, registered, codexHookObservation({ ...event, hook_event_name: 'PostToolUse' }, { includeRawPrompt: false }));
    // Model the crash between durable capture and measurement, followed by other work.
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
    spoolCodexHookEvent({ cwd: f.root, session_id: `${f.root}:recovery`, hook_event_name: 'SessionStart' }, { spoolDir: join(f.root, 'spool') });
    const evidence = inspectFinding(f.store, f.findingId).opportunities.find(row => row.id === id)!.evidence!;
    assert.equal(evidence.outcome, 'unknown');
    assert.match(evidence.measurement.problems.join(' '), /source changed since/);
  } finally { f.close(); }
});

test('two registrations observing the same host action contribute only one supporting observation', () => {
  const f = fixture();
  try {
    const sessionId = `${f.root}:duplicates`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
    const toolInput = { command: 'one-action' };
    for (const id of ['duplicate-a', 'duplicate-b']) {
      registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime: 'codex', toolName: 'Bash', toolInput } });
      f.review(id);
    }
    const event = { cwd: f.root, session_id: sessionId, tool_use_id: 'shared-call', tool_name: 'Bash', tool_input: toolInput };
    const spool = { spoolDir: join(f.root, 'spool') };
    spoolCodexHookEvent({ ...event, hook_event_name: 'PreToolUse' }, spool);
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
    spoolCodexHookEvent({ ...event, hook_event_name: 'PostToolUse' }, spool);
    spoolCodexHookEvent({ cwd: f.root, session_id: sessionId, hook_event_name: 'Stop' }, spool);
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 1);
  } finally { f.close(); }
});

test('an interrupted opportunity is surfaced in a later ordinary session without inventing its result', () => {
  const f = fixture();
  try {
    const sessionId = `${f.root}:interrupted`, pending = f.prepare(f.deliver(f.root, sessionId).deliveryId);
    const id = `${pending.id}-interrupted`, toolInput = { command: 'repair' };
    registerFindingOpportunity(f.store, { ...pending.input, id, capture: { runtime: 'codex', toolName: 'Bash', toolInput } });
    f.review(id);
    spoolCodexHookEvent({ cwd: f.root, session_id: sessionId, hook_event_name: 'PreToolUse',
      tool_use_id: 'incomplete-call', tool_name: 'Bash', tool_input: toolInput }, { spoolDir: join(f.root, 'spool') });
    writeFileSync(pending.source, JSON.stringify({ applicable: true, followed: true, predicted: true }));
    const next = f.deliver(f.root, `${f.root}:recovery`).output;
    assert.match(next, /Pending finding review/);
    assert.match(next, new RegExp(id));
    assert.match(next, /awaiting-action/);
    assert.equal(inspectFinding(f.store, f.findingId).supporting, 0);
    assert.equal(inspectFinding(f.store, f.findingId).opportunities.find(row => row.id === id)!.evidence, null);
  } finally { f.close(); }
});
