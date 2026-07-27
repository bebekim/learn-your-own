import assert from 'node:assert/strict';
import test from 'node:test';

import { translateDcodeEvent } from '../src/index.ts';

test('dcode lifecycle events map to claude-shaped names', () => {
  assert.deepEqual(
    translateDcodeEvent({ event: 'session.start', thread_id: 't1' }),
    { event: 'session.start', thread_id: 't1', hook_event_name: 'SessionStart', session_id: 't1' }
  );
  assert.deepEqual(
    translateDcodeEvent({ event: 'session.end', thread_id: 't1' }),
    { event: 'session.end', thread_id: 't1', hook_event_name: 'SessionEnd', session_id: 't1' }
  );
  assert.deepEqual(
    translateDcodeEvent({ event: 'task.complete', thread_id: 't1' }),
    { event: 'task.complete', thread_id: 't1', hook_event_name: 'Stop', session_id: 't1' }
  );
  assert.deepEqual(
    translateDcodeEvent({ event: 'user.prompt', thread_id: 't1' }),
    { event: 'user.prompt', thread_id: 't1', hook_event_name: 'UserPromptSubmit', session_id: 't1' }
  );
});

test('dcode tool.error maps tool names and keeps the thread', () => {
  const event = translateDcodeEvent({ event: 'tool.error', thread_id: 't2', tools: ['shell', 'write_file'] });
  assert.equal(event.hook_event_name, 'PostToolUseFailure');
  assert.equal(event.session_id, 't2');
  assert.equal(event.tool_name, 'shell,write_file');
});

test('unknown dcode events pass through with event name preserved', () => {
  const event = translateDcodeEvent({ event: 'context.compact', thread_id: 't3' });
  assert.equal(event.hook_event_name, 'context.compact');
  assert.equal(event.session_id, 't3');
});
