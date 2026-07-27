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

test('PostToolUse with null toolCall is filtered as noise', () => {
  assert.equal(translateAgyEvent('PostToolUse', { conversationId: 'c', toolCall: null }), null);
  assert.equal(translateAgyEvent('PostToolUse', { conversationId: 'c' }), null);
});

test('agy-hook PreToolUse returns an explicit allow decision', async () => {
  const { runAgyHookCommand } = await import('../src/cli/hooks.ts');
  const { CliArgs } = await import('../src/cli/args.ts');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const cwd = mkdtempSync(join(tmpdir(), 'lyo-agy-cmd-'));
  try {
    const payload = JSON.stringify({
      conversationId: 'c1',
      workspacePaths: [cwd],
      toolCall: { name: 'run_command', args: { CommandLine: 'ls' } },
    });
    const args = new CliArgs(
      ['node', 'lyo', 'agy-hook', 'PreToolUse', '--db-from-event-cwd', '--spool-dir-from-event-cwd'],
      process.env,
      cwd
    );
    const preTool = await runAgyHookCommand(args, (async function* () { yield payload; })());
    assert.deepEqual(preTool, { decision: 'allow' });

    const stopPayload = JSON.stringify({ conversationId: 'c1', workspacePaths: [cwd], terminationReason: 'NO_TOOL_CALL' });
    const stopArgs = new CliArgs(
      ['node', 'lyo', 'agy-hook', 'Stop', '--db-from-event-cwd', '--spool-dir-from-event-cwd'],
      process.env,
      cwd
    );
    const stop = await runAgyHookCommand(stopArgs, (async function* () { yield stopPayload; })());
    assert.deepEqual(stop, {});
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
