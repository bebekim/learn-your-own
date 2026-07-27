/**
 * antigravity adapter — translates Antigravity CLI hook payloads into the
 * Claude-shaped events the ingestion runtime understands.
 *
 * Antigravity (hooks.json, PreInvocation/PostInvocation/PreToolUse/
 * PostToolUse/Stop) does NOT include the event name in its payload, so the
 * configured command passes it as an argument: `lyo agy-hook PreToolUse`.
 * Field mapping: conversationId → session_id, workspacePaths[0] → cwd,
 * toolCall.name/args → tool_name/tool_input.
 */

export interface AgyHookEvent {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: unknown;
  [key: string]: unknown;
}

export function translateAgyEvent(
  eventName: string,
  payload: Record<string, unknown>
): AgyHookEvent {
  const workspacePaths = Array.isArray(payload.workspacePaths)
    ? (payload.workspacePaths as string[])
    : [];
  const toolCall = payload.toolCall as { name?: string; args?: unknown } | undefined;
  return {
    ...payload,
    hook_event_name: eventName,
    session_id: typeof payload.conversationId === 'string' ? payload.conversationId : undefined,
    cwd: workspacePaths[0],
    tool_name: toolCall?.name,
    tool_input: toolCall?.args,
  };
}
