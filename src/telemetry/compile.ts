import { closeKernel, createKernel } from '../ledger.ts';
import { initLedger } from '../schema.ts';
import { recordHookEvent } from '../hooks/ingestion.ts';
import { compileTelemetryRun } from '../compiler/frontend.ts';
import type { CompiledTelemetryRun } from '../compiler/frontend.ts';
import type { HookEventInput } from '../types/observation.ts';
import type { TelemetryEvent } from './contract.ts';

export function compileTelemetryArtifact(
  events: readonly TelemetryEvent[],
  runId?: string
): CompiledTelemetryRun {
  const kernel = createKernel({ dbPath: ':memory:' });
  initLedger(kernel);
  try {
    for (const event of events) {
      recordHookEvent(kernel, telemetryEventToHookInput(event));
    }
    return compileTelemetryRun(kernel, { runId: runId ?? events[0]?.runId ?? 'telemetry-run' });
  } finally {
    closeKernel(kernel);
  }
}

export function telemetryEventToHookInput(event: TelemetryEvent): HookEventInput {
  return {
    eventId: event.eventId,
    sessionId: sessionIdFor(event),
    turnId: event.runId,
    eventName: eventNameFor(event),
    cwd: cwdFor(event),
    model: modelFor(event),
    payload: hookPayloadFor(event),
    lyoVersion: 'telemetry.v1',
  };
}

function eventNameFor(event: TelemetryEvent): string {
  if (event.source === 'native' && isObject(event.payload) && typeof event.payload.hook_event_name === 'string') {
    return event.payload.hook_event_name;
  }
  return {
    prompt: 'prompt.submit',
    model_call: 'model.after',
    tool: 'tool.after',
    file: 'file.changed',
    command: 'tool.after',
    verify: 'tool.after',
    outcome: 'turn.stop',
  }[event.kind];
}

function hookPayloadFor(event: TelemetryEvent): unknown {
  if (event.source === 'native') return event.payload;
  const envelope = isObject(event.payload) ? event.payload : {};
  const sourceEvent = isObject(envelope.event) ? envelope.event : envelope;
  const payload = isObject(sourceEvent.payload) ? sourceEvent.payload : {};
  const params = isObject(payload.params) ? payload.params : {};
  const path = stringValue(payload.path) ?? stringValue(sourceEvent.path);
  const command = stringValue(payload.command)
    ?? stringValue(params.command)
    ?? stringValue(sourceEvent.command);
  const toolName = event.kind === 'command'
    ? 'Bash'
    : event.kind === 'file'
      ? 'FileChange'
      : stringValue(payload.tool_name)
        ?? stringValue(payload.toolName)
        ?? stringValue(payload.effect_type)
        ?? stringValue(sourceEvent.provider_event_kind)
        ?? stringValue(sourceEvent.kind)
        ?? event.kind;
  return {
    hook_event_name: eventNameFor(event),
    tool_name: toolName,
    tool_input: {
      ...sourceEvent,
      ...payload,
      ...params,
      ...(path ? { path, file_path: path } : {}),
      ...(command ? { command } : {}),
    },
    tool_response: {
      exit_code: payload.success === false ? 1 : 0,
      output: payload.output ?? payload.error_message ?? '',
    },
  };
}

function sessionIdFor(event: TelemetryEvent): string {
  const payload = isObject(event.payload) ? event.payload : {};
  return stringValue(payload.session_id) ?? stringValue(payload.sessionId) ?? event.runId;
}

function cwdFor(event: TelemetryEvent): string {
  const payload = isObject(event.payload) ? event.payload : {};
  return stringValue(payload.cwd) ?? '.';
}

function modelFor(event: TelemetryEvent): string | null {
  const payload = isObject(event.payload) ? event.payload : {};
  return stringValue(payload.model) ?? stringValue(payload.model_id) ?? null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}
