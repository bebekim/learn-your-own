import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stringPayloadSize } from '../hooks/normalizer.ts';

const DEFAULT_HOOK_RESPONSE_HASH_LIMIT = 200_000;

export function summarizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export function writePromptBlob(promptDir: string, id: string, role: string, text: string): string {
  mkdirSync(promptDir, { recursive: true });
  const safeId = String(id || sha256(text).slice(0, 16)).replace(/[^A-Za-z0-9_.:-]/g, '_');
  const path = join(promptDir, `${safeId}-${role}.txt`);
  writeFileSync(path, text, 'utf8');
  return path;
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function createHookEventId(input: {
  sessionId: string;
  turnId?: string | null;
  eventName: string;
  cwd: string;
  payload: unknown;
}): string {
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

export function fingerprintHookValue(value: unknown): { sha256: string; outputSize: number; truncated: boolean } {
  const outputSize = stringPayloadSize(value);
  const serialized = JSON.stringify(value);
  const limit = hookResponseHashLimit();
  const truncated = serialized.length > limit;
  const hashInput = truncated ? serialized.slice(0, limit) : serialized;
  return {
    sha256: sha256(hashInput),
    outputSize,
    truncated,
  };
}

function hookResponseHashLimit(): number {
  const raw = process.env.LEARNLOOP_HOOK_RESPONSE_HASH_LIMIT;
  if (!raw) return DEFAULT_HOOK_RESPONSE_HASH_LIMIT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_HOOK_RESPONSE_HASH_LIMIT;
}
