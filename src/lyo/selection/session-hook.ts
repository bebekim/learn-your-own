#!/usr/bin/env node
/**
 * Session lesson banner: print grounded LYO lessons for hook-capable agents.
 *
 * Read-only rendering; emitted banners record delivery receipts when a session
 * id is available. Hook failures never block the agent.
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
import { hashValue } from '../../contract/refs.ts';
import { resolvePolicy } from './selection-policies.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { sessionVerifier } from '../bridge/session-bridge.ts';
import { parsePriorJson, priorCalibration, priorPseudoCounts } from './semantic-prior.ts';

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
  explanation: string;
  prior_json: string | null;
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
  return selectSessionLessons(payload)?.text ?? null;
}

function selectSessionLessons(payload: SessionHookPayload): { text: string; selected: LessonRow[]; storePath: string } | null {
  const storePath = resolveSessionLessonStorePath(payload.cwd);
  if (!storePath) return null;

  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT * FROM v_lesson_library`
      )
      .all() as unknown as LessonRow[];
    const scoped = rows.filter(row => {
      if (!row.intervention.trim()) return false;
      const verifier = sessionVerifier(row.explanation);
      return !verifier || verifier.repoPath === payload.cwd;
    });
    if (scoped.length === 0) return null;
    const gamma = priorCalibration(scoped).gamma;
    const candidates = scoped.map((row) => ({
      lesson_id: row.lesson_id,
      alpha: Number(row.helpful_count) + 1 + priorPseudoCounts(parsePriorJson(row.prior_json), gamma).alpha,
      beta: Number(row.harmful_count) + 1 + priorPseudoCounts(parsePriorJson(row.prior_json), gamma).beta,
    }));
    const picks = resolvePolicy(null).sampleSelection(candidates, LIMIT);
    const selected = picks.map(({ index }) => scoped[index]);
    const lines = selected.map(formatLesson);
    if (lines.length === 0) return null;

    return { selected, storePath, text:
      `LYO lessons from your past runs (${scoped.length} in library, Thompson-sampled top ${lines.length}; ` +
      `score = posterior mean, ✓/✗ = validated outcomes; apply when relevant):\n` +
      `${lines.join('\n')}\n`
    };
  } finally {
    db.close();
  }
}

function claimSessionBanner(sessionId: string, storePath: string): boolean {
  const safe = hashValue([storePath, sessionId]);
  if (!safe) return true;
  const dir = path.join(os.tmpdir(), 'lyo-lesson-banner');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, safe);
    try { fs.writeFileSync(marker, new Date().toISOString(), { flag: 'wx' }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false; throw error; }
    return true;
  } catch {
    // fail-open: if the marker store is unusable, print rather than suppress
    return true;
  }
}

export function emitSessionLessons(
  payload: SessionHookPayload = {},
  write: (text: string) => void = text => { process.stdout.write(text); },
): void {
  try {
    const selection = selectSessionLessons(payload);
    if (!selection) return;
    const sessionId = payload.session_id ?? payload.sessionId;
    if (sessionId && !claimSessionBanner(sessionId, selection.storePath)) return;
    write(selection.text);
    if (sessionId) {
      const store = new LessonStore(selection.storePath);
      try {
        for (const row of selection.selected) store.recordApplication({ lesson_id: row.lesson_id,
          run_id: sessionId, trigger_message_id: 'session-banner', task_cue: payload.cwd ?? null });
        const traceId = `session-delivery:${sessionId}`;
        if (!store.getTrace(traceId)) store.recordTrace({ trace_id: traceId, run_id: sessionId,
          kind: 'protocol_application', summary: 'Session banner emitted.',
          payload: { cwd: payload.cwd, lessons: selection.selected, evidenceKind: 'delivery-only' } });
      } finally { store.close(); }
    }
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

if (process.argv[1] && fs.existsSync(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  runCli();
}
