import { recordHookEvent } from '../../src/index.ts';

export function recordPrompt(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'UserPromptSubmit',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'UserPromptSubmit',
      prompt: { sha256: `${input.eventId}-prompt`, length: 20 },
    },
  });
}

export function recordCommand(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'PostToolUse',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: input.command },
      tool_response: { exit_code: input.exitCode ?? 0, stdout: '' },
    },
  });
}

export function recordPatch(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'PostToolUse',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        patch: `*** Begin Patch\n*** Update File: ${input.path}\n@@\n-old\n+new\n*** End Patch`,
      },
      tool_response: { exit_code: 0 },
    },
  });
}

export function recordStop(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'Stop',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'Stop',
      last_assistant_message: input.message,
    },
  });
}
