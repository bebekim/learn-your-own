import type { ClaudeHookInput } from './claude.ts';

// IBM's documented event/tool/input/output fields and Bob Shell 2.0.2's
// Claude-shaped payloads share the same lifecycle. Stop ends a turn, not a task.
export function translateBobEvent(payload: Record<string, unknown>): (ClaudeHookInput & Record<string, unknown>) | null {
  const eventName = payload.hook_event_name ?? payload.event;
  if (typeof eventName !== 'string'
    || !['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'Stop'].includes(eventName)
    || typeof payload.session_id !== 'string' || !payload.session_id.trim()) return null;
  return {
    platform: 'bob',
    session_id: payload.session_id,
    hook_event_name: eventName,
    cwd: typeof payload.cwd === 'string' ? payload.cwd : undefined,
    prompt: typeof payload.prompt === 'string' ? payload.prompt : undefined,
    last_assistant_message: typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : undefined,
    tool_name: typeof payload.tool_name === 'string' ? payload.tool_name : typeof payload.tool === 'string' ? payload.tool : undefined,
    tool_input: payload.tool_input ?? payload.input,
    tool_response: payload.tool_response ?? payload.output,
    tool_use_id: typeof payload.tool_use_id === 'string' ? payload.tool_use_id : undefined,
  };
}
