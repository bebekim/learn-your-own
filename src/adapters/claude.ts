import type { CanonicalHookEventName, HookObservation } from '../hooks/events.ts';
import {
  createHookEventId,
  fingerprintHookValue,
  sha256,
  summarizeText,
  writePromptBlob,
} from './runtime.ts';
import type {
  AssociationOutcome,
  HookEventInput,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types.ts';

export interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  model?: string | null;
  turn_id?: string;
  prompt?: string;
  source?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  tool_output?: unknown;
  result?: unknown;
  error?: unknown;
  last_assistant_message?: string | null;
}

export interface ClaudeHookOptions {
  promptDir?: string;
  normalizeOnStop?: boolean;
  normalizeOnToolUse?: boolean;
  normalizeWorkspaceId?: string;
  normalizeOutcome?: AssociationOutcome;
}

export interface ClaudeHookOutput {
  continue?: true;
}

export function claudeHookObservation(
  event: ClaudeHookInput,
  options: { promptDir?: string; includeRawPrompt: boolean }
): HookObservation {
  const runtimeEventName = event.hook_event_name ?? 'Unknown';
  const canonicalEventName = canonicalClaudeEventName(runtimeEventName);
  const sessionId = event.session_id ?? 'unknown-session';
  const cwd = event.cwd ?? process.cwd();
  const turnId = event.turn_id ?? null;
  const hookEvent: HookEventInput = {
    sessionId,
    turnId,
    eventName: canonicalEventName,
    cwd,
    model: event.model ?? null,
    payload: redactClaudeHookEvent(event, {
      runtimeEventName,
      canonicalEventName,
    }),
  };
  hookEvent.eventId = createHookEventId(hookEvent);

  let session: RecordSessionStartedInput | null = null;
  let promptBoundary: RecordPromptBoundaryInput | null = null;

  if (runtimeEventName === 'SessionStart') {
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'claude',
      model: event.model ?? null,
    };
  } else if (runtimeEventName === 'UserPromptSubmit' && typeof event.prompt === 'string' && event.prompt) {
    const promptRef = options.promptDir ? writePromptBlob(options.promptDir, turnId ?? sessionId, 'user', event.prompt) : undefined;
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'claude',
      model: event.model ?? null,
    };
    promptBoundary = {
      sessionId,
      turnId,
      role: 'user',
      kind: 'user_prompt',
      promptText: options.includeRawPrompt ? event.prompt : undefined,
      promptHash: options.includeRawPrompt ? undefined : sha256(event.prompt),
      promptLength: options.includeRawPrompt ? undefined : event.prompt.length,
      promptRef,
      summary: options.includeRawPrompt ? undefined : summarizeText(event.prompt),
      model: event.model ?? null,
    };
  } else if (runtimeEventName === 'Stop' && typeof event.last_assistant_message === 'string' && event.last_assistant_message) {
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'claude',
      model: event.model ?? null,
    };
    promptBoundary = {
      sessionId,
      turnId,
      role: 'assistant',
      kind: 'assistant_response',
      responseSummary: summarizeText(event.last_assistant_message),
      model: event.model ?? null,
    };
  }

  return {
    runtime: 'claude',
    runtimeEventName,
    canonicalEventName,
    sessionId,
    turnId,
    cwd,
    hookEvent,
    session,
    promptBoundary,
  };
}

export function emptyClaudeHookOutput(): ClaudeHookOutput {
  return {};
}

function canonicalClaudeEventName(eventName: string): CanonicalHookEventName {
  if (eventName === 'SessionStart') return 'session.start';
  if (eventName === 'SessionEnd') return 'session.end';
  if (eventName === 'UserPromptSubmit') return 'prompt.submit';
  if (eventName === 'PreToolUse') return 'tool.before';
  if (eventName === 'PermissionRequest') return 'permission.request';
  if (eventName === 'PostToolUse') return 'tool.after';
  if (eventName === 'PostToolUseFailure') return 'tool.failure';
  if (eventName === 'PostToolBatch') return 'tool.batch.after';
  if (eventName === 'PreCompact') return 'context.compact.before';
  if (eventName === 'PostCompact') return 'context.compact.after';
  if (eventName === 'Stop') return 'turn.stop';
  if (eventName === 'SubagentStart') return 'subagent.start';
  if (eventName === 'SubagentStop') return 'subagent.stop';
  if (eventName === 'TaskCreated') return 'task.created';
  if (eventName === 'TaskCompleted') return 'task.completed';
  if (eventName === 'ConfigChange') return 'config.change';
  if (eventName === 'CwdChanged') return 'cwd.changed';
  if (eventName === 'FileChanged') return 'file.changed';
  if (eventName === 'WorktreeCreate') return 'worktree.create';
  if (eventName === 'WorktreeRemove') return 'worktree.remove';
  if (eventName === 'Notification') return 'notification';
  if (eventName === 'Elicitation') return 'elicitation';
  return 'unknown';
}

function redactClaudeHookEvent(
  event: ClaudeHookInput,
  names: { runtimeEventName: string; canonicalEventName: CanonicalHookEventName }
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {
    ...event,
    _lyo: {
      runtime: 'claude',
      runtime_event_name: names.runtimeEventName,
      canonical_event_name: names.canonicalEventName,
    },
  };
  if (typeof event.prompt === 'string') {
    redacted.prompt = {
      sha256: sha256(event.prompt),
      length: event.prompt.length,
    };
  }
  if (typeof event.last_assistant_message === 'string') {
    redacted.last_assistant_message = {
      sha256: sha256(event.last_assistant_message),
      length: event.last_assistant_message.length,
    };
  }
  for (const key of ['tool_response', 'tool_output', 'result'] as const) {
    if (event[key] !== undefined) {
      const fingerprint = fingerprintHookValue(event[key]);
      redacted[key] = {
        sha256: fingerprint.sha256,
        output_size: fingerprint.outputSize,
        truncated: fingerprint.truncated,
        recorded: false,
      };
    }
  }
  return redacted;
}
