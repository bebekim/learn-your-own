import {
  claudeHookObservation,
  emptyClaudeHookOutput,
} from '../adapters/claude.ts';
import type {
  ClaudeHookInput,
  ClaudeHookOptions,
  ClaudeHookOutput,
} from '../adapters/claude.ts';
import {
  codexChannel,
  codexHookObservation,
  codexHookOutput,
  codexTaskShape,
  emptyCodexHookOutput,
  renderProtocolOverlay,
} from '../adapters/codex.ts';
import type {
  CodexHookInput,
  CodexHookOptions,
  CodexHookOutput,
} from '../adapters/codex.ts';
import type { LearningKernel } from '../ledger.ts';
import {
  recordPromptBoundary,
  recordSessionStarted,
  resolveProtocol,
} from '../reducers.ts';
import type { AssociationOutcome } from '../types/activation.ts';
import type {
  DrainHookSpoolInput,
  DrainHookSpoolResult,
  HookEventInput,
  HookSpoolOptions,
  HookSpoolRecord,
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types/observation.ts';
import type { HookObservation, HookSpoolPacket } from './events.ts';
import {
  drainHookSpoolPackets,
  normalizedHookSpoolResult,
  recordHookEvent,
  spoolHookObservation,
} from './ingestion.ts';
import { normalizeHooks } from './normalization-runner.ts';

interface PersistableHookObservation {
  hookEvent: HookEventInput;
  session: RecordSessionStartedInput | null;
  promptBoundary: RecordPromptBoundaryInput | null;
}

interface HookNormalizationOptions {
  normalizeOnStop?: boolean;
  normalizeOnToolUse?: boolean;
  normalizeWorkspaceId?: string;
  normalizeOutcome?: AssociationOutcome;
}

interface HookNormalizationPolicy {
  toolUseEvents: readonly string[];
  stopEvents: readonly string[];
}

const CODEX_NORMALIZATION_POLICY: HookNormalizationPolicy = {
  toolUseEvents: ['PostToolUse'],
  stopEvents: ['Stop'],
};

const CLAUDE_NORMALIZATION_POLICY: HookNormalizationPolicy = {
  toolUseEvents: ['PostToolUse', 'PostToolUseFailure'],
  stopEvents: ['Stop', 'SessionEnd'],
};

export function spoolCodexHookEvent(event: CodexHookInput, options: HookSpoolOptions): HookSpoolRecord {
  const observation = codexHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: false,
  });
  return spoolHookObservation(observation, options);
}

export function spoolClaudeHookEvent(event: ClaudeHookInput, options: HookSpoolOptions): HookSpoolRecord {
  const observation = claudeHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: false,
  });
  return spoolHookObservation(observation, options);
}

export function drainHookSpool(kernel: LearningKernel, input: DrainHookSpoolInput): DrainHookSpoolResult {
  const drained = drainHookSpoolPackets(input, (packet) => {
    ingestHookSpoolPacket(kernel, packet);
  });

  const normalized = input.normalize
    ? normalizeHooks(kernel, {
        workspaceId: input.normalizeWorkspaceId,
        outcome: input.normalizeOutcome ?? 'unknown',
      })
    : null;

  return normalizedHookSpoolResult(drained, normalized);
}

export function handleCodexHook(
  kernel: LearningKernel,
  event: CodexHookInput,
  options: CodexHookOptions = {}
): CodexHookOutput {
  const observation = codexHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: true,
  });
  const eventName = observation.runtimeEventName;
  const { sessionId, turnId } = observation;

  persistHookObservation(kernel, observation);
  maybeNormalizeHookEvent(kernel, eventName, options, CODEX_NORMALIZATION_POLICY);

  if (!['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(eventName)) {
    return emptyCodexHookOutput(eventName);
  }

  const channel = options.channel ?? codexChannel(event);
  const taskShape = options.taskShape ?? codexTaskShape(event);
  const overlay = resolveProtocol(kernel, {
    taskShape,
    channel,
    runId: turnId ?? sessionId,
  });

  if (overlay.protocols.length === 0) {
    return emptyCodexHookOutput(eventName);
  }

  return codexHookOutput(eventName, {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: renderProtocolOverlay(overlay),
    },
  });
}

export function handleClaudeHook(
  kernel: LearningKernel,
  event: ClaudeHookInput,
  options: ClaudeHookOptions = {}
): ClaudeHookOutput {
  const observation = claudeHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: true,
  });
  const eventName = observation.runtimeEventName;

  persistHookObservation(kernel, observation);
  maybeNormalizeHookEvent(kernel, eventName, options, CLAUDE_NORMALIZATION_POLICY);

  return emptyClaudeHookOutput();
}

function ingestHookSpoolPacket(kernel: LearningKernel, packet: HookSpoolPacket): void {
  persistHookObservation(kernel, packet);
}

function persistHookObservation(
  kernel: LearningKernel,
  observation: HookObservation | PersistableHookObservation
): void {
  recordHookEvent(kernel, observation.hookEvent);
  if (observation.session) {
    recordSessionStarted(kernel, observation.session);
  }
  if (observation.promptBoundary) {
    recordPromptBoundary(kernel, observation.promptBoundary);
  }
}

function maybeNormalizeHookEvent(
  kernel: LearningKernel,
  eventName: string,
  options: HookNormalizationOptions,
  policy: HookNormalizationPolicy
): void {
  if (policy.toolUseEvents.includes(eventName) && options.normalizeOnToolUse !== false) {
    normalizeHookEvent(kernel, options);
  }

  if (policy.stopEvents.includes(eventName) && options.normalizeOnStop !== false) {
    normalizeHookEvent(kernel, options);
  }
}

function normalizeHookEvent(kernel: LearningKernel, options: HookNormalizationOptions): void {
  normalizeHooks(kernel, {
    workspaceId: options.normalizeWorkspaceId,
    outcome: options.normalizeOutcome ?? 'unknown',
  });
}
