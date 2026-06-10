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
} from '../types/activation.ts';
import type {
  HookEventInput,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types/observation.ts';
import type { ResolveProtocolResult } from '../types/core.ts';
import { getLyoVersion } from '../version.ts';

export interface CodexHookInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  model?: string | null;
  turn_id?: string;
  prompt?: string;
  source?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
}

export interface CodexHookOptions {
  channel?: string;
  taskShape?: string;
  promptDir?: string;
  normalizeOnStop?: boolean;
  normalizeOnToolUse?: boolean;
  normalizeWorkspaceId?: string;
  normalizeOutcome?: AssociationOutcome;
}

export interface CodexHookOutput {
  continue?: true;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
}

export function codexHookObservation(
  event: CodexHookInput,
  options: { promptDir?: string; includeRawPrompt: boolean }
): HookObservation {
  const runtimeEventName = event.hook_event_name ?? 'Unknown';
  const canonicalEventName = canonicalCodexEventName(runtimeEventName);
  const sessionId = event.session_id ?? 'unknown-session';
  const cwd = event.cwd ?? process.cwd();
  const turnId = event.turn_id ?? null;
  const lyoVersion = getLyoVersion();
  const hookEvent: HookEventInput = {
    sessionId,
    turnId,
    eventName: canonicalEventName,
    cwd,
    model: event.model ?? null,
    lyoVersion,
    payload: redactCodexHookEvent(event, {
      runtimeEventName,
      canonicalEventName,
      lyoVersion,
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
      platform: 'codex',
      model: event.model ?? null,
    };
  } else if (runtimeEventName === 'UserPromptSubmit' && typeof event.prompt === 'string' && event.prompt) {
    const promptRef = options.promptDir ? writePromptBlob(options.promptDir, turnId ?? sessionId, 'user', event.prompt) : undefined;
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
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
      platform: 'codex',
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
    runtime: 'codex',
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

export function codexChannel(event: CodexHookInput): string {
  if (event.hook_event_name === 'UserPromptSubmit') return 'codex.user_prompt';
  if (event.hook_event_name === 'SessionStart') return 'codex.session';
  if (event.tool_name) return `codex.tool.${event.tool_name}`;
  return `codex.${event.hook_event_name ?? 'unknown'}`;
}

export function codexTaskShape(event: CodexHookInput): string {
  if (event.hook_event_name === 'SessionStart') return `session-${event.source ?? 'startup'}`;
  if (event.hook_event_name === 'UserPromptSubmit') return 'user-prompt';
  if (event.tool_name) return `tool-${event.tool_name}`;
  return event.hook_event_name ?? 'unknown';
}

export function renderProtocolOverlay(overlay: ResolveProtocolResult): string {
  const lines = [
    'Agent learning overlay:',
    ...overlay.protocols.map((protocol) => (
      `- ${protocol.title}: ${protocol.action} [${protocol.protocolId}]`
    )),
  ];
  return lines.join('\n');
}

export function emptyCodexHookOutput(eventName: string): CodexHookOutput {
  if (eventName === 'PreToolUse') return {};
  return { continue: true };
}

export function codexHookOutput(eventName: string, output: CodexHookOutput): CodexHookOutput {
  if (eventName === 'PreToolUse') return output;
  return { continue: true, ...output };
}

function canonicalCodexEventName(eventName: string): CanonicalHookEventName {
  if (eventName === 'SessionStart') return 'session.start';
  if (eventName === 'UserPromptSubmit') return 'prompt.submit';
  if (eventName === 'PreToolUse' || eventName === 'PermissionRequest') return 'tool.before';
  if (eventName === 'PostToolUse') return 'tool.after';
  if (eventName === 'PreCompact') return 'context.compact.before';
  if (eventName === 'PostCompact') return 'context.compact.after';
  if (eventName === 'Stop') return 'turn.stop';
  return 'unknown';
}

function redactCodexHookEvent(
  event: CodexHookInput,
  names: { runtimeEventName: string; canonicalEventName: CanonicalHookEventName; lyoVersion: string }
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {
    ...event,
    _lyo: {
      runtime: 'codex',
      runtime_event_name: names.runtimeEventName,
      canonical_event_name: names.canonicalEventName,
      lyo_version: names.lyoVersion,
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
  if (event.tool_response !== undefined) {
    const fingerprint = fingerprintHookValue(event.tool_response);
    redacted.tool_response = {
      sha256: fingerprint.sha256,
      output_size: fingerprint.outputSize,
      truncated: fingerprint.truncated,
      recorded: false,
      ...safeToolStatusSignals(event.tool_response),
    };
  }
  return redacted;
}

function safeToolStatusSignals(value: unknown): Record<string, unknown> {
  const signals: Record<string, unknown> = {};
  collectToolStatusSignals(value, signals);
  return signals;
}

function collectToolStatusSignals(value: unknown, signals: Record<string, unknown>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectToolStatusSignals(item, signals);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
    if (['exitcode', 'returncode'].includes(normalizedKey) && typeof child === 'number') {
      signals.exit_code = child;
    } else if (['success', 'ok'].includes(normalizedKey) && typeof child === 'boolean') {
      signals.success = child;
    } else if (['status', 'state', 'outcome'].includes(normalizedKey) && typeof child === 'string') {
      signals.status = child;
    } else {
      collectToolStatusSignals(child, signals);
    }
  }
}
