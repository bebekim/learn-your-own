import { readFileSync } from 'node:fs';
import { normalizeHooks } from '../hooks/normalization-runner.ts';
import { recordHookEvent } from '../hooks/ingestion.ts';
import type { LearningKernel } from '../ledger.ts';
import { parseTelemetryEvent, type TelemetryEvent } from './contract.ts';
import { telemetryEventToHookInput } from './compile.ts';

const ISO_NOW = () => new Date().toISOString();

export interface ConsumeTelemetryOutboxInput {
  outboxPath: string;
  consumerId?: string;
  limit?: number;
}

export interface ConsumeTelemetryOutboxResult {
  consumerId: string;
  outboxPath: string;
  events: number;
  normalized: ReturnType<typeof normalizeHooks>;
  acknowledgedOffset: number;
}

export function consumeTelemetryOutbox(
  kernel: LearningKernel,
  input: ConsumeTelemetryOutboxInput
): ConsumeTelemetryOutboxResult {
  const consumerId = input.consumerId ?? 'lyo-default';
  const sourcePath = input.outboxPath;
  const currentOffset = cursorOffset(kernel, consumerId, sourcePath);
  const bytes = readFileSync(sourcePath);
  if (bytes.length < currentOffset) {
    throw new Error(`outbox was truncated below acknowledged offset: ${sourcePath}`);
  }

  const lines: Array<{ event: TelemetryEvent; nextOffset: number }> = [];
  let cursor = currentOffset;
  while (lines.length < (input.limit ?? 1000)) {
    const newline = bytes.indexOf(0x0a, cursor);
    if (newline === -1) break;
    const line = bytes.subarray(cursor, newline).toString('utf8').trim();
    cursor = newline + 1;
    if (!line) continue;
    lines.push({
      event: parseTelemetryEvent(JSON.parse(line), lines.length + 1),
      nextOffset: cursor,
    });
  }

  kernel.db.exec('begin immediate');
  try {
    for (const { event } of lines) {
      recordHookEvent(kernel, telemetryEventToHookInput(event));
    }
    const normalized = normalizeHooks(kernel, { outcome: 'unknown' });
    const acknowledgedOffset = lines.at(-1)?.nextOffset ?? currentOffset;
    kernel.db.prepare(`
      insert into telemetry_cursors (consumer_id, source_path, byte_offset, updated_at)
      values (?, ?, ?, ?)
      on conflict(consumer_id, source_path) do update set
        byte_offset = excluded.byte_offset,
        updated_at = excluded.updated_at
    `).run(consumerId, sourcePath, acknowledgedOffset, ISO_NOW());
    kernel.db.exec('commit');
    return { consumerId, outboxPath: sourcePath, events: lines.length, normalized, acknowledgedOffset };
  } catch (error) {
    kernel.db.exec('rollback');
    throw error;
  }
}

export async function followTelemetryOutbox(
  kernel: LearningKernel,
  input: ConsumeTelemetryOutboxInput & { intervalMs?: number },
  onBatch?: (result: ConsumeTelemetryOutboxResult) => void
): Promise<never> {
  for (;;) {
    const result = consumeTelemetryOutbox(kernel, input);
    if (result.events > 0) onBatch?.(result);
    await new Promise((resolve) => setTimeout(resolve, input.intervalMs ?? 1000));
  }
}

function cursorOffset(kernel: LearningKernel, consumerId: string, sourcePath: string): number {
  const row = kernel.db.prepare(`
    select byte_offset as byteOffset
    from telemetry_cursors
    where consumer_id = ? and source_path = ?
  `).get(consumerId, sourcePath) as { byteOffset?: number } | undefined;
  return row?.byteOffset ?? 0;
}
