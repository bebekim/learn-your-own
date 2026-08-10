export const TELEMETRY_SCHEMA = 'lyo.telemetry.v1' as const;

export type TelemetrySource = 'native' | 'shepherd' | (string & {});

export type TelemetryKind =
  | 'prompt'
  | 'model_call'
  | 'tool'
  | 'file'
  | 'command'
  | 'verify'
  | 'outcome';

export interface TelemetryEvent {
  schema: typeof TELEMETRY_SCHEMA;
  eventId: string;
  runId: string;
  source: TelemetrySource;
  kind: TelemetryKind;
  occurredAt: string;
  payload: unknown;
  evidenceRef?: string;
}

export function encodeTelemetry(events: readonly TelemetryEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join('\n') + (events.length ? '\n' : '');
}

export function decodeTelemetry(text: string): TelemetryEvent[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseTelemetryEvent(JSON.parse(line), index + 1));
}

export function parseTelemetryEvent(value: unknown, line = 1): TelemetryEvent {
  if (!value || typeof value !== 'object') throw new Error(`invalid telemetry event at line ${line}`);
  const event = value as Partial<TelemetryEvent>;
  if (event.schema !== TELEMETRY_SCHEMA) throw new Error(`unsupported telemetry schema at line ${line}`);
  if (!nonEmpty(event.eventId) || !nonEmpty(event.runId) || !nonEmpty(event.source)) {
    throw new Error(`telemetry event requires eventId, runId, and source at line ${line}`);
  }
  if (!isTelemetryKind(event.kind)) throw new Error(`invalid telemetry kind at line ${line}`);
  if (!nonEmpty(event.occurredAt)) throw new Error(`telemetry event requires occurredAt at line ${line}`);
  return event as TelemetryEvent;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTelemetryKind(value: unknown): value is TelemetryKind {
  return value === 'prompt'
    || value === 'model_call'
    || value === 'tool'
    || value === 'file'
    || value === 'command'
    || value === 'verify'
    || value === 'outcome';
}
