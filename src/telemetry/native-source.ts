import type { HookEventInput } from '../types/observation.ts';
import type { TelemetryEvent, TelemetryKind } from './contract.ts';
import { TELEMETRY_SCHEMA } from './contract.ts';

export function nativeHookToTelemetry(input: HookEventInput, occurredAt = new Date().toISOString()): TelemetryEvent {
  const eventId = input.eventId ?? `${input.sessionId}:${input.turnId ?? 'session'}:${input.eventName}`;
  return {
    schema: TELEMETRY_SCHEMA,
    eventId,
    runId: input.turnId ?? input.sessionId,
    source: 'native',
    kind: nativeKind(input.eventName),
    occurredAt,
    payload: input.payload,
    evidenceRef: `hook:${eventId}`,
  };
}

function nativeKind(eventName: string): TelemetryKind {
  const name = eventName.toLowerCase();
  if (name.includes('prompt')) return 'prompt';
  if (name.includes('model')) return 'model_call';
  if (name.includes('file') || name.includes('worktree')) return 'file';
  if (name.includes('verify') || name.includes('test')) return 'verify';
  if (name.includes('command')) return 'command';
  return 'tool';
}
