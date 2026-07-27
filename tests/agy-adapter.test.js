import assert from 'node:assert/strict';
import test from 'node:test';

import { translateAgyEvent } from '../src/index.ts';

test('agy tool payload maps to claude-shaped event', () => {
  const event = translateAgyEvent('PreToolUse', {
    conversationId: 'conv-1',
    workspacePaths: ['/tmp/repo'],
    toolCall: { name: 'list_dir', args: { DirectoryPath: '/tmp/repo' } },
  });
  assert.equal(event.hook_event_name, 'PreToolUse');
  assert.equal(event.session_id, 'conv-1');
  assert.equal(event.cwd, '/tmp/repo');
  assert.equal(event.tool_name, 'list_dir');
  assert.deepEqual(event.tool_input, { DirectoryPath: '/tmp/repo' });
});

test('agy invocation payload has no tool fields', () => {
  const event = translateAgyEvent('PreInvocation', {
    conversationId: 'conv-2',
    workspacePaths: ['/tmp/repo'],
    invocationNum: 0,
  });
  assert.equal(event.hook_event_name, 'PreInvocation');
  assert.equal(event.session_id, 'conv-2');
  assert.equal(event.cwd, '/tmp/repo');
  assert.equal(event.tool_name, undefined);
  assert.equal(event.invocationNum, 0);
});

test('agy Stop payload maps cwd and keeps termination fields', () => {
  const event = translateAgyEvent('Stop', {
    conversationId: 'conv-3',
    workspacePaths: ['/tmp/repo'],
    terminationReason: 'NO_TOOL_CALL',
    fullyIdle: true,
  });
  assert.equal(event.hook_event_name, 'Stop');
  assert.equal(event.session_id, 'conv-3');
  assert.equal(event.terminationReason, 'NO_TOOL_CALL');
});

test('missing workspacePaths falls back gracefully', () => {
  const event = translateAgyEvent('Stop', { conversationId: 'conv-4' });
  assert.equal(event.cwd, undefined);
});
