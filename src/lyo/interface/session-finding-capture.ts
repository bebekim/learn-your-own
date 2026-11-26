import { realpathSync } from 'node:fs';
import { hashValue } from '../contract/refs.ts';
import type { HookObservation } from '../hooks/events.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingActionBoundary, findingSessionModel, toolCommand } from '../storage/finding-evidence.ts';
import type { Registered } from '../storage/finding-evidence.ts';
import { findingFiles } from '../storage/finding-files.ts';
import { findingState } from './session-findings.ts';

export { captureSchema, findingActionEvidence, findingSessionModel } from '../storage/finding-evidence.ts';

export function captureFindingAction(store: LessonStore, registered: Registered, event: HookObservation) {
  const { input, sessionId } = registered.content, capture = input.capture;
  if (store.getTrace(`finding-window:${input.id}`)) return;
  const payload = event.hookEvent.payload as Record<string, unknown>;
  if (!capture || event.runtime !== capture.runtime || event.sessionId !== sessionId || realpathSync(event.cwd) !== input.cwd
    || payload.tool_name !== capture.toolName || (capture.toolInput !== undefined && hashValue(payload.tool_input) !== hashValue(capture.toolInput))
    || typeof payload.tool_use_id !== 'string' || !payload.tool_use_id) return;
  if (!['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event.runtimeEventName)) return;
  const phase = event.runtimeEventName === 'PreToolUse' ? 'before' : 'after';
  if (findingActionBoundary(store.db, input.id, phase)) return;
  const before = findingActionBoundary(store.db, input.id, 'before');
  if (capture.next && phase === 'after' && !before) return;
  if (capture.commandPattern && !new RegExp(capture.commandPattern).test(toolCommand(payload.tool_input))) return;
  if (before && (before.toolUseId !== payload.tool_use_id || before.toolInputHash !== hashValue(payload.tool_input))) return;
  const current = phase === 'before' ? findingState(store.db, input.findingId) : null;
  const content = { source: 'session-finding-action@1', opportunityId: input.id, opportunityHash: registered.payload.hash,
    eventId: event.hookEvent.eventId!, runtime: event.runtime, sessionId, cwd: input.cwd,
    toolUseId: payload.tool_use_id, toolName: capture.toolName, toolInputHash: hashValue(payload.tool_input),
    ...(input.prospective?.automatic ? { model: typeof payload.model === 'string' ? payload.model
      : findingSessionModel(store.db, event.runtime, sessionId)?.model ?? null } : {}),
    eventName: event.runtimeEventName, sourceFiles: findingFiles(input.sourceFiles), verifierFiles: findingFiles(input.verifierFiles),
    ...(current ? { findingState: { version: current.version, validity: current.validity } } : {}),
    responseHash: phase === 'after' ? hashValue(payload.tool_response ?? payload.error ?? null) : null,
    ...(phase === 'after' && capture.measures === 'action' ? { action: actionSummary(payload) } : {}) };
  store.recordTrace({ trace_id: `finding-action:${input.id}:${phase}`, run_id: sessionId, kind: 'behavior',
    summary: 'Live finding action boundary; no outcome inferred from tool status.', payload: { ...content, hash: hashValue(content) } });
}

/** Spec 13: what the captured command was and how it ended, from the already-redacted payload. No output text. */
function actionSummary(payload: Record<string, unknown>) {
  const command = toolCommand(payload.tool_input);
  const signals = [payload.error, payload.tool_response].find(v => v && typeof v === 'object') as Record<string, unknown> | undefined;
  const label = (key: string, max: number) => typeof signals?.[key] === 'string' ? (signals[key] as string).slice(0, max) : null;
  return { command: command.slice(0, 2000), exitCode: typeof signals?.exit_code === 'number' ? signals.exit_code : null,
    failureKind: label('failure_kind', 40), errorClass: label('error_class', 60) };
}
