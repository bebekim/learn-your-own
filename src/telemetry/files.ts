import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decodeTelemetry, type TelemetryEvent } from './contract.ts';
import { shepherdExportToTelemetry } from './shepherd-source.ts';

export function readTelemetryFile(path: string): TelemetryEvent[] {
  return decodeTelemetry(readFileSync(path, 'utf8'));
}

export function readShepherdExportFile(path: string, runId: string): TelemetryEvent[] {
  const sourcePath = statSync(path).isDirectory() ? join(path, 'scope_root.jsonl') : path;
  return shepherdExportToTelemetry(readFileSync(sourcePath, 'utf8'), runId);
}

export function summarizeTelemetry(events: readonly TelemetryEvent[]): {
  events: number;
  runs: number;
  bySource: Record<string, number>;
  byKind: Record<string, number>;
} {
  const runs = new Set(events.map((event) => event.runId));
  const bySource: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const event of events) {
    bySource[event.source] = (bySource[event.source] ?? 0) + 1;
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
  }
  return { events: events.length, runs: runs.size, bySource, byKind };
}
