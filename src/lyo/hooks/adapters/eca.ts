import type { ClaudeHookInput } from './claude.ts';

const EVENTS: Record<string, string> = {
  chatStart: 'SessionStart',
  chatEnd: 'SessionEnd',
  preRequest: 'UserPromptSubmit',
  postRequest: 'Stop',
  preToolCall: 'PreToolUse',
  postToolCall: 'PostToolUse',
};

// ECA 0.158: https://eca.dev/config/hooks/. A cache session contains many chats;
// only chatEnd closes a learning session. postRequest is a turn boundary.
export function translateEcaEvent(payload: Record<string, unknown>): (ClaudeHookInput & Record<string, unknown>) | null {
  const eventName = typeof payload.hook_type === 'string' ? EVENTS[payload.hook_type] : undefined;
  if (!eventName || typeof payload.chat_id !== 'string' || !payload.chat_id.trim()
    || typeof payload.session_id !== 'string' || !payload.session_id.trim()) return null;
  const toolName = typeof payload.tool_name === 'string'
    ? `${typeof payload.server === 'string' ? payload.server + '__' : ''}${payload.tool_name}` : undefined;
  let response = payload.tool_response;
  if (toolName === 'eca__shell_command' && typeof response === 'string') {
    // Only ECA's foreground result header is an exit status. Timeout/background
    // messages and strings embedded in command stdout provide no numeric evidence.
    const match = /^Exit code: (-?\d+)(?:\r?\n|$)/.exec(response);
    if (match && Number.isSafeInteger(Number(match[1]))) response = { output: response, exit_code: Number(match[1]) };
  }
  return {
    platform: 'eca',
    session_id: `eca:${JSON.stringify([payload.session_id, payload.chat_id])}`,
    hook_event_name: eventName === 'PostToolUse' && payload.error ? 'PostToolUseFailure' : eventName,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
    model: typeof payload.full_model === 'string' ? payload.full_model : undefined,
    prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
    last_assistant_message: typeof payload.response === 'string' ? payload.response : undefined,
    tool_name: toolName,
    tool_input: payload.tool_input,
    tool_response: response,
    tool_use_id: typeof payload.tool_call_id === 'string' ? payload.tool_call_id : undefined,
    error: Boolean(payload.error),
  };
}
