import assert from 'node:assert/strict';
import test from 'node:test';
import { failureSignals, executedFailureSignals } from '../src/lyo/hooks/failure-signals.ts';
import { redactToolError } from '../src/lyo/hooks/adapters/claude.ts';
import { extractHookFacts } from '../src/lyo/hooks/normalizer.ts';

// Leading texts below are the host wordings observed in Claude transcripts and Kimi wire logs (2026-11-25).
test('declined and never-executed calls are labelled apart from executed failures', () => {
  const cases: Array<[string, string]> = [
    ["The user doesn't want to proceed with this tool use. The tool use was rejected", 'user_denied'],
    ['Tool "Bash" was not run because the user rejected the approval request', 'user_denied'],
    ['Permission for this action was denied by the Claude Code auto mode classifier', 'policy_denied'],
    ['The server-side auto mode classifier gave no verdict (error), so auto mode', 'policy_denied'],
    ['<tool_use_error>Blocked: sleep 30 followed by: cat out</tool_use_error>', 'harness_blocked'],
    ['<tool_use_error>File has not been read yet. Read it first</tool_use_error>', 'harness_rejected'],
    ['MCP server "claude.ai Atlassian" is not connected', 'tool_unavailable'],
    ['Exit code 1', 'exit_nonzero'],
    ['something a host has never said', 'unknown'],
  ];
  for (const [text, kind] of cases) assert.equal(failureSignals(text).failure_kind, kind, text);
  assert.equal(failureSignals("The user doesn't want to proceed. KeyError: x").error_class, undefined, 'denials carry no cause');
});

test('the escaping exception names the cause; output cannot impersonate a denial', () => {
  const traceback = 'Exit code 1\nTraceback (most recent call last):\n  File "<string>", line 1\nKeyError: \'jobs\'\nDuring handling...\njson.decoder.JSONDecodeError: Expecting value: line 1 column 1';
  assert.deepEqual(failureSignals(traceback), { failure_kind: 'exit_nonzero', error_class: 'JSONDecodeError' });
  assert.equal(failureSignals('Exit code 1\nError: unknown flag: --job-id').error_class, 'cli_usage');
  assert.equal(failureSignals('Exit code 127\nzsh: command not found: jqq').error_class, 'command_not_found');
  assert.equal(failureSignals("Exit code 1\nThe user doesn't want to proceed").failure_kind, 'exit_nonzero');
  assert.equal(failureSignals('Exit code 1\nMyPrivateCustomError: secret').error_class, undefined, 'unlisted names are not retained');
  assert.deepEqual(executedFailureSignals('Traceback\nModuleNotFoundError: No module named x'), { failure_kind: 'exit_nonzero', error_class: 'ModuleNotFoundError' });
});

test('redaction keeps only the closed labels and a denial is not a failed command', () => {
  const redacted = redactToolError({ code: 'internal', message: 'Tool "Bash" was not run because the user rejected the approval for /secret/path' }) as Record<string, unknown>;
  assert.equal(redacted.failure_kind, 'user_denied');
  assert.doesNotMatch(JSON.stringify(redacted), /secret/);
  const facts = (error: unknown) => extractHookFacts({ eventId: 'e', eventName: 'tool.failure', sessionId: 's', turnId: null, cwd: '/tmp',
    payloadJson: JSON.stringify({ hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'npm test' },
      error: redactToolError(error), _lyo: { runtime: 'kimi' } }) }).commands[0].status;
  assert.equal(facts({ code: 'internal', message: 'Tool "Bash" was not run because the user rejected it' }), 'denied');
  assert.equal(facts('<tool_use_error>InputValidationError: bad</tool_use_error>'), 'unknown');
  assert.equal(facts('Exit code 1\nTraceback\nKeyError: x'), 'failed');
  assert.equal(facts({ code: 'internal', message: 'opaque' }), 'failed', 'an unrecognised failure stays a failure');
});
