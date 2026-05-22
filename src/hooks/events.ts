import type {
  HookEventInput,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../index.ts';

export type HookRuntime = 'codex' | 'gemini' | 'claude' | 'unknown';

export type CanonicalHookEventName =
  | 'session.start'
  | 'session.end'
  | 'prompt.submit'
  | 'tool.before'
  | 'tool.after'
  | 'turn.before'
  | 'turn.after'
  | 'turn.stop'
  | 'model.before'
  | 'model.after'
  | 'context.compact.before'
  | 'context.compact.after'
  | 'notification'
  | 'unknown';

export interface HookObservation {
  runtime: HookRuntime;
  runtimeEventName: string;
  canonicalEventName: CanonicalHookEventName;
  sessionId: string;
  turnId: string | null;
  cwd: string;
  hookEvent: HookEventInput;
  session: RecordSessionStartedInput | null;
  promptBoundary: RecordPromptBoundaryInput | null;
}

export interface HookSpoolPacket {
  version: 1;
  kind: 'hook-event' | 'codex-hook-event';
  runtime?: HookRuntime;
  recordedAt: string;
  hookEvent: HookEventInput;
  session: RecordSessionStartedInput | null;
  promptBoundary: RecordPromptBoundaryInput | null;
}
