import type { TelemetryEvent, TelemetryKind } from './contract.ts';
import { TELEMETRY_SCHEMA } from './contract.ts';

export interface ShepherdEffect {
  eventId: string;
  runId: string;
  effectType: string;
  occurredAt: string;
  payload: unknown;
  evidenceRef?: string;
}

export function shepherdEffectToTelemetry(effect: ShepherdEffect): TelemetryEvent {
  return {
    schema: TELEMETRY_SCHEMA,
    eventId: effect.eventId,
    runId: effect.runId,
    source: 'shepherd',
    kind: shepherdKind(effect.effectType),
    occurredAt: effect.occurredAt,
    payload: effect.payload,
    evidenceRef: effect.evidenceRef ?? `shepherd:${effect.eventId}`,
  };
}

export function shepherdExportToTelemetry(
  source: string | object | readonly object[],
  runId: string,
  occurredAt = new Date().toISOString()
): TelemetryEvent[] {
  const entries = shepherdExportEntries(source);
  return entries.map((entry, index) => {
    const metadata = entry as Record<string, unknown>;
    const effect = effectObject(entry);
    const sequence = numberValue(metadata.sequence) ?? numberValue(metadata._sequence) ?? index;
    const eventId = stringValue(effect.event_id)
      ?? stringValue(effect.eventId)
      ?? `shepherd:${runId}:${sequence}`;
    const timestamp = numberValue(effect.timestamp);
    return shepherdEffectToTelemetry({
      eventId,
      runId,
      effectType: stringValue(effect.effect_type) ?? stringValue(effect.effectType) ?? 'base',
      occurredAt: timestamp === undefined ? occurredAt : new Date(timestamp * 1000).toISOString(),
      payload: effect,
      evidenceRef: `shepherd:${runId}:${sequence}`,
    });
  });
}

function shepherdExportEntries(source: string | object | readonly object[]): object[] {
  if (Array.isArray(source)) return source.filter(isObject);
  if (typeof source === 'object' && source !== null) {
    const document = source as { timeline?: unknown };
    if (Array.isArray(document.timeline)) return document.timeline.filter(isObject);
    return [source];
  }

  const text = source.trim();
  if (text.startsWith('{')) return shepherdExportEntries(JSON.parse(text) as object);
  if (text.startsWith('[')) return shepherdExportEntries(JSON.parse(text) as object[]);
  return text.split(/\r?\n/).filter(Boolean).map((line) => {
    const entry = JSON.parse(line) as object;
    return isObject((entry as { effect?: unknown }).effect)
      ? { ...entry, effect: (entry as { effect: object }).effect }
      : entry;
  });
}

function effectObject(entry: object): Record<string, unknown> {
  const effect = (entry as { effect?: unknown }).effect;
  return isObject(effect) ? effect : entry as Record<string, unknown>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function shepherdKind(effectType: string): TelemetryKind {
  const type = effectType.toLowerCase();
  if (type.includes('prompt') || type.includes('message')) return 'prompt';
  if (type.includes('model') || type.includes('provider')) return 'model_call';
  if (type.includes('file') || type.includes('patch')) return 'file';
  if (type.includes('tool') || type.includes('stage')) return 'tool';
  if (type.includes('verify') || type.includes('test')) return 'verify';
  if (type.includes('command') || type.includes('exec')) return 'command';
  if (type.includes('complete') || type.includes('failed') || type.includes('outcome')) return 'outcome';
  return 'tool';
}
