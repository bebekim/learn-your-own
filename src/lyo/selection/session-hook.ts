#!/usr/bin/env node
/**
 * Session lesson banner: print grounded LYO lessons for hook-capable agents.
 *
 * Read-only and fail-open by design. Cluster runs write lessons; interactive
 * agent hooks only consume the existing lesson library.
 *
 * When the hook payload carries a session id (e.g. kimi-code UserPromptSubmit,
 * which fires on every prompt), the banner prints at most once per session;
 * the marker is only written when lessons were actually printed, so a session
 * that starts with an empty library can still receive lessons on a later
 * prompt. Without a session id (e.g. `--cwd` manual runs) it always prints.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { resolvePolicy } from './selection-policies.ts';

const LIMIT = 5;
const MAX_TEXT = 220;
const STDIN_GUARD_MS = 2500;

interface LessonRow {
  lesson_id: string;
  failure_class: string;
  intervention: string;
  helpful_count: number;
  harmful_count: number;
  posterior_mean: number;
}

export interface SessionHookPayload {
  cwd?: string | null;
  session_id?: string | null;
  sessionId?: string | null;
}

export function resolveSessionLessonStorePath(cwd?: string | null): string | null {
  const candidates: string[] = [];
  if (process.env.ZEROSHOT_LYO_STORE_PATH) {
    candidates.push(process.env.ZEROSHOT_LYO_STORE_PATH);
  }
  if (cwd) {
    candidates.push(path.join(cwd, '.zeroshot', 'lyo-lessons.db'));
  }
  candidates.push(path.join(os.homedir(), '.zeroshot', 'lyo-lessons.db'));

  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function formatLesson(row: LessonRow): string {
  const text = row.intervention.replace(/\s+/g, ' ').trim();
  const short = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 3)}...` : text;
  const mean = Number(row.posterior_mean || 0).toFixed(2);
  return `- [${mean} · ${row.helpful_count}✓/${row.harmful_count}✗ · ${row.failure_class}] ${short}`;
}

export function renderSessionLessons(payload: SessionHookPayload = {}): string | null {
  const storePath = resolveSessionLessonStorePath(payload.cwd);
  if (!storePath) return null;

  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT lesson_id, failure_class, intervention,
                helpful_count, harmful_count, posterior_mean
         FROM v_lesson_library`
      )
      .all() as unknown as LessonRow[];
    if (rows.length === 0) return null;

    const candidates = rows.map((row) => ({
      lesson_id: row.lesson_id,
      alpha: Number(row.helpful_count) + 1,
      beta: Number(row.harmful_count) + 1,
    }));
    const picks = resolvePolicy(null).sampleSelection(candidates, LIMIT);
    const lines = picks.map(({ index }) => formatLesson(rows[index])).filter(Boolean);
    if (lines.length === 0) return null;

    return (
      `LYO lessons from your past runs (${rows.length} in library, Thompson-sampled top ${lines.length}; ` +
      `score = posterior mean, ✓/✗ = validated outcomes; apply when relevant):\n` +
      `${lines.join('\n')}\n`
    );
  } finally {
    db.close();
  }
}

function claimSessionBanner(sessionId: string): boolean {
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '_');
  if (!safe) return true;
  const dir = path.join(os.tmpdir(), 'lyo-lesson-banner');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, safe);
    if (fs.existsSync(marker)) return false;
    fs.writeFileSync(marker, new Date().toISOString());
    return true;
  } catch {
    // fail-open: if the marker store is unusable, print rather than suppress
    return true;
  }
}

export function emitSessionLessons(payload: SessionHookPayload = {}): void {
  try {
    const text = renderSessionLessons(payload);
    if (!text) return;
    const sessionId = payload.session_id ?? payload.sessionId;
    if (sessionId && !claimSessionBanner(sessionId)) return;
    process.stdout.write(text);
  } catch {
    // fail-open: never block the session
  }
}

function runCli(): void {
  const cwdFlagIndex = process.argv.indexOf('--cwd');
  if (cwdFlagIndex !== -1) {
    emitSessionLessons({ cwd: process.argv[cwdFlagIndex + 1] || process.cwd() });
    return;
  }

  let input = '';
  process.stdin.on('data', (chunk: Buffer) => {
    input += chunk.toString();
  });
  process.stdin.on('end', () => {
    try {
      emitSessionLessons(JSON.parse(input || '{}') as SessionHookPayload);
    } catch {
      // fail-open: never block the session
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), STDIN_GUARD_MS).unref();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
