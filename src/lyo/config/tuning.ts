/**
 * Machine-dependent settings (Spec 15). Machines differ, so nothing here is a constant in code:
 * every value lives in the `tuning` section of `<LYO_HOME>/config.json` (or `LYO_CONFIG_FILE`),
 * with the defaults below. `lyo tune` measures the machine and suggests values.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { lyoHome } from '../storage/lyo-home.ts';

export const tuningSchema = z.object({
  hooks: z.object({
    /** Wall-time budget for each evaluator check run inside a hook; running out reads as unknown. */
    checkSeconds: z.number().min(0.2).max(30).default(2),
    /** A hook process exits after this long if the host never closes stdin. */
    stdinGuardMs: z.number().int().min(100).max(60000).default(2500),
  }).strict().prefault({}),
  git: z.object({
    /** Repository identity lookups (`git rev-parse`) made during hooks and commands. */
    timeoutMs: z.number().int().min(100).max(60000).default(1000),
  }).strict().prefault({}),
  sqlite: z.object({
    /** How long a writer waits for another writer's lock on the lesson store or corpus before failing. */
    busyTimeoutMs: z.number().int().min(0).max(120000).default(5000),
    /** The same for per-repository capture ledgers, which many concurrent hooks write. */
    ledgerBusyTimeoutMs: z.number().int().min(0).max(120000).default(10000),
  }).strict().prefault({}),
  lab: z.object({
    /** One model call by the OpenAI-compatible lab executor (OpenRouter, local servers). */
    openaiCompatibleMs: z.number().int().min(1000).max(3600000).default(120000),
    /** One model call by the Upstage executor. */
    upstageMs: z.number().int().min(1000).max(3600000).default(300000),
    /** One run of the Kimi CLI executor. */
    kimiCliMs: z.number().int().min(1000).max(3600000).default(600000),
    /** Pause before the Kimi CLI executor retries. */
    kimiRetryDelayMs: z.number().int().min(0).max(600000).default(5000),
    /** One `node --test` run by the lab verifier. */
    verifierMs: z.number().int().min(1000).max(3600000).default(300000),
    /** One OpenRouter judge call. */
    judgeMs: z.number().int().min(1000).max(3600000).default(180000),
    /** One elaborator-reflector call. */
    elaboratorMs: z.number().int().min(500).max(600000).default(8000),
  }).strict().prefault({}),
  decisions: z.object({
    /** One decision while replaying a case set or matching shadowed hypotheses (not the hook worker). */
    replayMs: z.number().int().min(1000).max(1800000).default(120000),
    /** One request to a Jev decision server. */
    jevRequestMs: z.number().int().min(500).max(600000).default(10000),
  }).strict().prefault({}),
  sessions: z.object({
    /** A host session quiet this long is bridged as ended. */
    staleAfterHours: z.number().min(0.1).max(720).default(12),
  }).strict().prefault({}),
}).strict();
export type Tuning = z.infer<typeof tuningSchema>;

export const DEFAULT_TUNING: Tuning = tuningSchema.parse({});

export function lyoConfigPath(env: NodeJS.ProcessEnv = process.env) {
  return env.LYO_CONFIG_FILE ?? join(lyoHome(env), 'config.json');
}

const cache = new Map<string, { mtimeMs: number; tuning: Tuning }>();

/**
 * The effective tuning. A missing file or section means defaults; an invalid section is reported
 * once on stderr and also means defaults, so a typo can never block a hook.
 */
export function loadTuning(env: NodeJS.ProcessEnv = process.env): Tuning {
  const file = lyoConfigPath(env);
  if (!existsSync(file)) return DEFAULT_TUNING;
  let mtimeMs = 0;
  try { mtimeMs = statSync(file).mtimeMs; } catch { return DEFAULT_TUNING; }
  const hit = cache.get(file);
  if (hit && hit.mtimeMs === mtimeMs) return hit.tuning;
  let tuning = DEFAULT_TUNING;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    const parsed = tuningSchema.safeParse(raw?.tuning ?? {});
    if (parsed.success) tuning = parsed.data;
    else process.stderr.write(`Lyo tuning in ${file} is invalid (${parsed.error.issues.slice(0, 3)
      .map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}); using defaults.\n`);
  } catch (error) {
    process.stderr.write(`Lyo config ${file} is unreadable (${error instanceof Error ? error.message : String(error)}); using default tuning.\n`);
  }
  cache.set(file, { mtimeMs, tuning });
  return tuning;
}
