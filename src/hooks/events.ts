import type {
  HookEventInput,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types/observation.ts';

export type HookRuntime = 'codex' | 'gemini' | 'claude' | 'unknown';

export type CanonicalHookEventName =
  | 'session.start'
  | 'session.end'
  | 'prompt.submit'
  | 'permission.request'
  | 'tool.before'
  | 'tool.after'
  | 'tool.failure'
  | 'tool.batch.after'
  | 'turn.before'
  | 'turn.after'
  | 'turn.stop'
  | 'model.before'
  | 'model.after'
  | 'context.compact.before'
  | 'context.compact.after'
  | 'subagent.start'
  | 'subagent.stop'
  | 'task.created'
  | 'task.completed'
  | 'config.change'
  | 'cwd.changed'
  | 'file.changed'
  | 'worktree.create'
  | 'worktree.remove'
  | 'notification'
  | 'elicitation'
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
