import { createHash } from 'node:crypto';
import { drainJsonSpoolPackets, writeJsonSpoolPacket } from './spool.ts';
import type { LearningKernel } from '../ledger.ts';
import type {
  DrainHookSpoolInput,
  DrainHookSpoolResult,
  HookEventInput,
  HookEventRecord,
  HookSpoolOptions,
  HookSpoolRecord,
  NormalizeHooksResult,
} from '../types/observation.ts';
import type { HookObservation, HookSpoolPacket } from './events.ts';
import { getLyoVersion } from '../version.ts';

const ISO_NOW = () => new Date().toISOString();

export function recordHookEvent(kernel: LearningKernel, input: HookEventInput): HookEventRecord {
  requireFields(input, ['sessionId', 'eventName', 'cwd', 'payload']);
  const eventId = input.eventId ?? hookEventId(input);
  const lyoVersion = input.lyoVersion ?? getLyoVersion();
  kernel.db.prepare(`
    insert into hook_events (
      event_id, session_id, turn_id, event_name, cwd, model, lyo_version, payload_json, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(event_id) do update set
      session_id = excluded.session_id,
      turn_id = excluded.turn_id,
      event_name = excluded.event_name,
      cwd = excluded.cwd,
      model = excluded.model,
      lyo_version = excluded.lyo_version,
      payload_json = excluded.payload_json
  `).run(
    eventId,
    input.sessionId,
    input.turnId ?? null,
    input.eventName,
    input.cwd,
    input.model ?? null,
    lyoVersion,
    JSON.stringify(input.payload),
    ISO_NOW()
  );
  return {
    eventId,
    sessionId: input.sessionId,
    turnId: input.turnId ?? null,
    eventName: input.eventName,
    cwd: input.cwd,
    model: input.model ?? null,
    lyoVersion,
  };
}

export function spoolHookObservation(observation: HookObservation, options: HookSpoolOptions): HookSpoolRecord {
  requireFields(options, ['spoolDir']);
  const packet: HookSpoolPacket = {
    version: 1,
    kind: 'hook-event',
    runtime: observation.runtime,
    recordedAt: ISO_NOW(),
    hookEvent: observation.hookEvent,
    session: observation.session,
    promptBoundary: observation.promptBoundary,
  };
  const written = writeJsonSpoolPacket({
    spoolDir: options.spoolDir,
    packet,
    packetId: observation.hookEvent.eventId,
  });
  return {
    eventId: observation.hookEvent.eventId ?? hookEventId(observation.hookEvent),
    eventName: observation.runtimeEventName,
    packetPath: written.packetPath,
  };
}

export function drainHookSpoolPackets(
  input: DrainHookSpoolInput,
  processPacket: (packet: HookSpoolPacket) => void
): Omit<DrainHookSpoolResult, 'normalized'> {
  requireFields(input, ['spoolDir']);
  let hookEvents = 0;
  let sessions = 0;
  let promptBoundaries = 0;

  const spool = drainJsonSpoolPackets<HookSpoolPacket>({
    spoolDir: input.spoolDir,
    limit: input.limit,
    parsePacket: parseHookSpoolPacket,
    processPacket: (packet) => {
      processPacket(packet);
      hookEvents += 1;
      if (packet.session) sessions += 1;
      if (packet.promptBoundary) promptBoundaries += 1;
    },
  });

  return {
    processedPackets: spool.processedPackets,
    failedPackets: spool.failedPackets,
    requeuedPackets: spool.requeuedPackets,
    hookEvents,
    sessions,
    promptBoundaries,
  };
}

export function hookEventId(input: HookEventInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      sessionId: input.sessionId,
      turnId: input.turnId ?? null,
      eventName: input.eventName,
      cwd: input.cwd,
      payload: input.payload,
    }))
    .digest('hex')
    .slice(0, 24);
  return `hook-${digest}`;
}

export function parseHookSpoolPacket(value: unknown): HookSpoolPacket {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid hook spool packet');
  }
  const packet = value as HookSpoolPacket;
  if (packet.version !== 1 || (packet.kind !== 'hook-event' && packet.kind !== 'codex-hook-event')) {
    throw new Error('unsupported hook spool packet');
  }
  return packet;
}

export function normalizedHookSpoolResult(
  drained: Omit<DrainHookSpoolResult, 'normalized'>,
  normalized: NormalizeHooksResult | null
): DrainHookSpoolResult {
  return {
    ...drained,
    normalized,
  };
}

function requireFields(input: object, fields: string[]): void {
  const values = input as Record<string, unknown>;
  for (const field of fields) {
    if (values[field] === undefined || values[field] === null || values[field] === '') {
      throw new Error(`missing required field: ${field}`);
    }
  }
}
