#!/usr/bin/env node
/**
 * Session lesson banner: print grounded LYO lessons for hook-capable agents.
 *
 * Read-only rendering; emitted banners record delivery receipts when a session
 * id is available. Hook failures never block the agent.
 *
 * SessionStart (including compact/resume) and UserPromptSubmit refresh guidance.
 * Legacy callers without an event name retain once-per-session delivery.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { hashValue } from '../../contract/refs.ts';
import { resolvePolicy } from './selection-policies.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { sessionVerifier } from '../bridge/session-bridge.ts';
import { parsePriorJson, priorCalibration, priorPseudoCounts } from './semantic-prior.ts';
import { selectSessionFindings, trialManagedFindings } from '../interface/session-findings.ts';
import type { SessionFinding } from '../interface/session-findings.ts';
import { emitFindingReviewQueue } from '../interface/session-finding-workflow.ts';
import { refreshSessionTrialAdvice } from '../interface/finding-opportunities.ts';
import { repositoryKey } from '../repository.ts';

export { repositoryKey };

const LIMIT = 5;
const MAX_TEXT = 220;
const STDIN_GUARD_MS = 2500;
const REASONING_MANDATE = 'LYO reasoning mandate: Could this evidence exist while the claim is false? ' +
  'Separate claim, observation, and inference; check alternative causes and witness assumptions. ' +
  'Preserve unknown. Advice delivery and passing checks alone do not establish benefit.\n';

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
  prompt?: string | null;
  session_id?: string | null;
  sessionId?: string | null;
  hook_event_name?: string | null;
  source?: string | null;
  turn_id?: string | null;
  model?: string | null;
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
  const selection = selectSessionLessons(payload);
  return selection ? formatSelection(selection) : null;
}

function formatSelection({ selected, findings }: { selected: LessonRow[]; findings: SessionFinding[] }): string {
  return [
    findings.length ? 'Observed findings — future usefulness unvalidated; apply only when the stated activity fits:\n' +
      findings.map(row => `- [${row.activity}; ${row.id}] ${row.intervention}\n  Observed: ${row.observation} Evidence: ${row.evidenceRef}` +
        (row.supporting ? `\n  ${row.supporting} supporting observation(s); broader usefulness unvalidated.` : '')).join('\n') : '',
    selected.length ? `LYO lessons from your past runs (Thompson-sampled ${selected.length}; ` +
      'score = posterior mean, ✓/✗ = validated outcomes; apply when relevant):\n' + selected.map(formatLesson).join('\n') : '',
  ].filter(Boolean).join('\n') + '\n';
}

function selectSessionLessons(payload: SessionHookPayload): { selected: LessonRow[]; findings: SessionFinding[]; storePath: string } | null {
  const storePath = resolveSessionLessonStorePath(payload.cwd);
  if (!storePath) return null;

  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT * FROM v_lesson_library`
      )
      .all() as unknown as LessonRow[];
    const findings = selectSessionFindings(db, { ...payload, repository: () => repositoryKey(payload.cwd) });
    const managedAdvice = new Set(trialManagedFindings(db).values());
    const scoped = rows.filter(row => {
      if (!row.intervention.trim() || managedAdvice.has(row.intervention.trim())) return false;
      const verifier = sessionVerifier(row.explanation);
      return !verifier || verifier.repoPath === payload.cwd;
    });
    const gamma = priorCalibration(scoped).gamma;
    const candidates = scoped.map((row) => ({
      lesson_id: row.lesson_id,
      alpha: Number(row.helpful_count) + 1 + priorPseudoCounts(parsePriorJson(row.prior_json), gamma).alpha,
      beta: Number(row.harmful_count) + 1 + priorPseudoCounts(parsePriorJson(row.prior_json), gamma).beta,
    }));
    const picks = resolvePolicy(null).sampleSelection(candidates, LIMIT - findings.length);
    const selected = picks.map(({ index }) => scoped[index]);
    return selected.length || findings.length ? { selected, findings, storePath } : null;
  } finally {
    db.close();
  }
}

function claimSessionBanner(sessionId: string, storePath: string, findingId?: string): boolean {
  const safe = hashValue(findingId ? [storePath, sessionId, findingId] : [storePath, sessionId]);
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

function refreshActivity(payload: SessionHookPayload, storePath: string): SessionHookPayload {
  const sessionId = payload.session_id ?? payload.sessionId;
  if (!sessionId || !payload.cwd) return payload;
  const store = new LessonStore(storePath);
  try {
    const cwd = fs.realpathSync(payload.cwd);
    let cue = typeof payload.prompt === 'string'
      ? [...payload.prompt.matchAll(/\[lyo:(transfer-review|experiment-design|learning-budget)\]/g)].map(match => match[0]).join(' ') : '';
    if (payload.hook_event_name === 'SessionStart' && ['compact', 'resume'].includes(payload.source ?? '')) {
      const row = store.db.prepare(`SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
        AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-context@1'
        ORDER BY rowid DESC LIMIT 1`).get(sessionId);
      const previous = row ? JSON.parse(String(row.payload_json)) : null;
      cue = previous?.cwd === cwd && typeof previous.activityCue === 'string' ? previous.activityCue : '';
    }
    // Retain explicit activity tags, never the user's prompt. A clear/new prompt
    // records an empty cue too, so compaction cannot revive an obsolete scope.
    store.recordTrace({ trace_id: `session-context:${randomUUID()}`, run_id: sessionId,
      kind: 'behavior', summary: 'Prepared session context refresh; no outcome evidence.',
      payload: { source: 'session-context@1', cwd, activityCue: cue, event: payload.hook_event_name,
        reason: payload.source ?? null, turnId: payload.turn_id ?? null } });
    return { ...payload, prompt: cue };
  } finally { store.close(); }
}

export function emitSessionLessons(
  payload: SessionHookPayload = {},
  write: (text: string) => void = text => { process.stdout.write(text); },
): void {
  try {
    const refresh = payload.hook_event_name === 'SessionStart' || payload.hook_event_name === 'UserPromptSubmit';
    if (refresh) write(REASONING_MANDATE);
    const storePath = resolveSessionLessonStorePath(payload.cwd);
    if (refresh && storePath) payload = refreshActivity(payload, storePath);
    const sessionId = payload.session_id ?? payload.sessionId;
    if (refresh && storePath && sessionId && payload.cwd) {
      const store = new LessonStore(storePath);
      try { refreshSessionTrialAdvice(store, { sessionId, cwd: payload.cwd, model: payload.model,
        event: payload.hook_event_name, source: payload.source }, write); }
      finally { store.close(); }
    }
    try {
      if (storePath && payload.cwd) emitFindingReviewQueue(storePath, payload.cwd, payload.session_id ?? payload.sessionId ?? null, write);
    } catch { /* A damaged review queue must not hide ordinary guidance. */ }
    const selection = selectSessionLessons(payload);
    if (!selection) return;
    if (!refresh && sessionId && selection.selected.length && !claimSessionBanner(sessionId, selection.storePath)) selection.selected = [];
    if (!refresh && sessionId) selection.findings = selection.findings.filter(row => claimSessionBanner(sessionId, selection.storePath, `${row.id}:${row.version}`));
    if (!selection.selected.length && !selection.findings.length) return;
    if (sessionId) {
      const store = new LessonStore(selection.storePath);
      try {
        const firstTraceId = `session-delivery:${sessionId}`;
        const traceId = store.getTrace(firstTraceId)
          ? `${firstTraceId}:${hashValue([payload.cwd, selection.selected.map(row => row.lesson_id),
            selection.findings.map(row => [row.id, row.version, row.context])])}` : firstTraceId;
        write(formatSelection(selection) + (selection.findings.length
          ? `Finding delivery: ${traceId}. Store: ${selection.storePath}. Before applying advice, use lyo finding inspect --finding-id <id> --store <path> for registration and semantic-review templates. Register the opportunity and exact planned capture action, then review evaluator semantics with finding semantics. Codex/Claude hooks capture paired actions and record assessments automatically. Without a sound evaluator leave the outcome unknown. Use the same --store throughout.\n` : ''));
        for (const row of selection.selected) store.recordApplication({ lesson_id: row.lesson_id,
          run_id: sessionId, trigger_message_id: 'session-banner', task_cue: payload.cwd ?? null });
        if (!store.getTrace(traceId)) store.recordTrace({ trace_id: traceId, run_id: sessionId,
          kind: 'protocol_application', summary: 'Session banner emitted.',
          payload: { cwd: payload.cwd, promptHash: typeof payload.prompt === 'string' ? hashValue(payload.prompt) : null,
            lessons: selection.selected, findings: selection.findings, evidenceKind: 'delivery-only' } });
      } finally { store.close(); }
    } else write(formatSelection(selection));
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
      const payload = JSON.parse(input || '{}') as SessionHookPayload;
      emitSessionLessons({ ...payload, cwd: payload.cwd || process.cwd() });
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
