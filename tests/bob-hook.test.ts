import assert from 'node:assert/strict';
import test from 'node:test';
import { translateBobEvent } from '../src/lyo/hooks/adapters/bob.ts';
import { claudeHookObservation } from '../src/lyo/hooks/adapters/claude.ts';
import { extractHookFacts } from '../src/lyo/hooks/normalizer.ts';

test('Bob accepts both hook contracts without inventing completion or shell exit evidence', () => {
  for (const bad of [{}, { event: 'Stop', session_id: '' }, { event: 'SessionEnd', session_id: 'bob' }]) {
    assert.equal(translateBobEvent(bad), null);
  }
  for (const documented of [true, false]) {
    for (const output of ['private output', 'Exit code: 0\nprivate output', '[TIMED OUT after 10s]: npm test',
      { output: 'private output', exit_code: 1 }]) {
      const event = translateBobEvent({ session_id: 'bob', cwd: '/tmp/project', prompt: 'private prompt',
        last_assistant_message: 'private response', ...(documented
          ? { event: 'PostToolUse', tool: 'execute_command', input: { command: 'npm test' }, output }
          : { hook_event_name: 'PostToolUse', tool_name: 'execute_command', tool_input: { command: 'npm test' }, tool_response: output }) });
      assert.ok(event);
      const obs = claudeHookObservation(event, { includeRawPrompt: false });
      const payloadJson = JSON.stringify(obs.hookEvent.payload);
      assert.doesNotMatch(payloadJson, /private/);
      assert.equal(obs.runtime, 'bob');
      assert.equal(obs.sessionEnd, null);
      const facts = extractHookFacts({ eventId: obs.hookEvent.eventId!, sessionId: obs.sessionId,
        turnId: null, eventName: obs.canonicalEventName, cwd: obs.cwd, payloadJson });
      assert.equal(facts.runtime, 'bob');
      assert.equal(facts.commands[0].classification, 'test');
      assert.equal(facts.commands[0].status, typeof output === 'string' ? 'unknown' : 'failed');
      assert.equal(JSON.parse(payloadJson).tool_response.exit_code, typeof output === 'string' ? undefined : 1);
    }
  }
  const stop = claudeHookObservation(translateBobEvent({ event: 'Stop', session_id: 'bob' })!, { includeRawPrompt: false });
  assert.equal(stop.canonicalEventName, 'turn.stop');
  assert.equal(stop.sessionEnd, null);
});
