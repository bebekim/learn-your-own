/**
 * deepagents adapter — translates Deep Agents Code (dcode) hook payloads
 * ({ event, thread_id, ... }) into Claude-shaped events for the shared
 * ingestion path. dcode's vocabulary is thinner (no per-tool-call events,
 * no prompt text, no cwd), so task.complete doubles as the Stop/drain
 * trigger and session_id comes from thread_id.
 */

export interface DcodeHookEvent {
  hook_event_name?: string;
  session_id?: string;
  [key: string]: unknown;
}

const EVENT_NAME_MAP: Record<string, string> = {
  'session.start': 'SessionStart',
  'session.end': 'SessionEnd',
  'task.complete': 'Stop',
  'user.prompt': 'UserPromptSubmit',
  'tool.error': 'PostToolUseFailure',
};

export function translateDcodeEvent(payload: Record<string, unknown>): DcodeHookEvent {
  const eventName = typeof payload.event === 'string' ? payload.event : 'unknown';
  const mapped = EVENT_NAME_MAP[eventName] ?? eventName;
  const tools = Array.isArray(payload.tools) ? (payload.tools as string[]) : undefined;
  const translated: DcodeHookEvent = {
    ...payload,
    hook_event_name: mapped,
    session_id: typeof payload.thread_id === 'string' ? payload.thread_id : undefined,
  };
  if (tools) {
    translated.tool_name = tools.join(',');
  }
  return translated;
}
