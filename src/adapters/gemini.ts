/**
 * gemini adapter — translates Gemini CLI / Antigravity CLI hook payloads into
 * the Claude-shaped events the ingestion runtime already understands.
 *
 * Gemini base payload: { session_id, transcript_path, cwd, hook_event_name,
 * timestamp, ... } — the same base fields as Claude, only the event names
 * differ. Lifecycle events pass through untouched.
 */

export interface GeminiHookEvent {
  hook_event_name?: string;
  [key: string]: unknown;
}

const EVENT_NAME_MAP: Record<string, string> = {
  BeforeTool: 'PreToolUse',
  AfterTool: 'PostToolUse',
  // Per-turn drain trigger, matching Claude's Stop semantics.
  AfterModel: 'Stop',
};

export function translateGeminiEvent(event: GeminiHookEvent): GeminiHookEvent {
  const mapped = event.hook_event_name ? EVENT_NAME_MAP[event.hook_event_name] : undefined;
  if (!mapped) {
    return event;
  }
  return { ...event, hook_event_name: mapped };
}
