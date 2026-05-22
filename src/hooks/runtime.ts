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
import type {
  DrainHookSpoolInput,
  DrainHookSpoolResult,
  HookSpoolOptions,
  HookSpoolRecord,
} from '../types.ts';
import type { HookSpoolPacket } from './events.ts';
import {
  drainHookSpoolPackets,
  normalizedHookSpoolResult,
  recordHookEvent,
  spoolHookObservation,
} from './ingestion.ts';
import { normalizeHooks } from './normalization-runner.ts';

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

  recordHookEvent(kernel, observation.hookEvent);

  if (observation.session) {
    recordSessionStarted(kernel, observation.session);
  }
  if (observation.promptBoundary) {
    recordPromptBoundary(kernel, observation.promptBoundary);
  }

  if (eventName === 'PostToolUse' && options.normalizeOnToolUse !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  if (eventName === 'Stop' && options.normalizeOnStop !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

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

  recordHookEvent(kernel, observation.hookEvent);

  if (observation.session) {
    recordSessionStarted(kernel, observation.session);
  }
  if (observation.promptBoundary) {
    recordPromptBoundary(kernel, observation.promptBoundary);
  }

  if ((eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') && options.normalizeOnToolUse !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  if ((eventName === 'Stop' || eventName === 'SessionEnd') && options.normalizeOnStop !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  return emptyClaudeHookOutput();
}

function ingestHookSpoolPacket(kernel: LearningKernel, packet: HookSpoolPacket): void {
  recordHookEvent(kernel, packet.hookEvent);
  if (packet.session) {
    recordSessionStarted(kernel, packet.session);
  }
  if (packet.promptBoundary) {
    recordPromptBoundary(kernel, packet.promptBoundary);
  }
}
