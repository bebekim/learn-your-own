import assert from 'node:assert/strict';
import test from 'node:test';

import { translateGeminiEvent } from '../src/index.ts';

test('gemini tool events map to claude hook event names', () => {
  const before = translateGeminiEvent({
    hook_event_name: 'BeforeTool',
    session_id: 's1',
    cwd: '/tmp/repo',
    tool_name: 'run_shell_command',
    tool_input: { command: 'ls' },
  });
  assert.equal(before.hook_event_name, 'PreToolUse');
  assert.equal(before.tool_name, 'run_shell_command');
  assert.deepEqual(before.tool_input, { command: 'ls' });

  const after = translateGeminiEvent({
    hook_event_name: 'AfterTool',
    session_id: 's1',
    cwd: '/tmp/repo',
    tool_name: 'write_file',
    tool_input: { path: 'a.js' },
    tool_response: { llmContent: 'ok' },
  });
  assert.equal(after.hook_event_name, 'PostToolUse');
  assert.deepEqual(after.tool_response, { llmContent: 'ok' });
});

test('gemini AfterModel maps to Stop so spool drains per turn', () => {
  const event = translateGeminiEvent({ hook_event_name: 'AfterModel', session_id: 's1', cwd: '/tmp' });
  assert.equal(event.hook_event_name, 'Stop');
});

test('lifecycle events pass through unchanged', () => {
  for (const name of ['SessionStart', 'SessionEnd', 'UserPromptSubmit']) {
    const event = { hook_event_name: name, session_id: 's1', cwd: '/tmp', prompt: 'hi' };
    assert.deepEqual(translateGeminiEvent(event), event);
  }
});

test('unknown events pass through untouched', () => {
  const event = { hook_event_name: 'BeforeModel', session_id: 's1', cwd: '/tmp', llm_request: {} };
  assert.deepEqual(translateGeminiEvent(event), event);
});
