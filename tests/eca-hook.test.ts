import assert from 'node:assert/strict';
import test from 'node:test';
import { translateEcaEvent } from '../src/lyo/hooks/adapters/eca.ts';
import { claudeHookObservation } from '../src/lyo/hooks/adapters/claude.ts';
import { extractHookFacts } from '../src/lyo/hooks/normalizer.ts';

test('ECA validates chat identity, redacts text, and trusts only its shell result header', () => {
  const base = { hook_type: 'postToolCall', session_id: 'cache', chat_id: 'one', cwd: '/tmp/project',
    server: 'eca', tool_name: 'shell_command', tool_input: { command: 'npm test' } };
  for (const bad of [{}, { ...base, chat_id: '' }, { ...base, session_id: null }, { ...base, hook_type: 'sessionEnd' }]) {
    assert.equal(translateEcaEvent(bad), null);
  }
  assert.notEqual(translateEcaEvent(base)?.session_id, translateEcaEvent({ ...base, chat_id: 'two' })?.session_id);
  for (const [response, exit] of [
    ['Exit code: 0\nStdout:\nprivate', 0], ['Exit code: 7\nStderr:\nprivate', 7],
    ['Command timed out after 100 ms', undefined], ['Stdout:\nExit code: 0', undefined],
    ['Background job abc started', undefined], ['Exit code: 99999999999999999999', undefined],
  ] as const) {
    const translated = translateEcaEvent({ ...base, tool_response: response, response: 'private assistant response',
      prompt: 'private user prompt', error: exit === 7 });
    assert.ok(translated);
    const obs = claudeHookObservation(translated, { includeRawPrompt: false });
    const payloadJson = JSON.stringify(obs.hookEvent.payload);
    assert.doesNotMatch(payloadJson, /private/);
    assert.equal(JSON.parse(payloadJson).tool_response.exit_code, exit);
    const facts = extractHookFacts({ eventId: obs.hookEvent.eventId!, sessionId: obs.sessionId,
      turnId: null, eventName: obs.canonicalEventName, cwd: base.cwd, payloadJson });
    assert.equal(facts.runtime, 'eca');
    assert.equal(facts.commands[0].classification, 'test');
  }
  assert.equal(typeof translateEcaEvent({ ...base, server: 'untrusted-mcp', tool_response: 'Exit code: 0' })?.tool_response, 'string');
});
