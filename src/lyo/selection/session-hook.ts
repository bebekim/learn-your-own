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
import { hashValue } from '../contract/refs.ts';
import { formatSelection, type HookSelection, type LessonRow } from './session-banner.ts';
import { runLessonSelection } from './lesson-strategies.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { lessonStorePath } from '../storage/lyo-home.ts';
import { sessionVerifier } from '../bridge/session-bridge.ts';
import { priorCalibration } from './semantic-prior.ts';
import { selectSessionFindings, trialManagedFindings } from '../interface/session-findings.ts';
import type { SessionFinding } from '../interface/session-findings.ts';
import { emitFindingReviewQueue } from '../interface/session-finding-workflow.ts';
import { refreshSessionTrialAdvice } from '../interface/finding-opportunities.ts';
import { repositoryKey } from '../repository.ts';
import { visibleHookContext } from '../hooks/context-visibility.ts';

export { repositoryKey };

const LIMIT = 5;

const STDIN_GUARD_MS = 2500;

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

/**
 * The one lesson store every hook run uses (`LYO_STORE_PATH`, else `<LYO_HOME>/lessons.db`).
 * Null until it exists: hooks never create it. `cwd` no longer selects a store.
 */
export function resolveSessionLessonStorePath(_cwd?: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const candidate = lessonStorePath(env);
  try { return fs.statSync(candidate).isFile() ? candidate : null; } catch { return null; }
}

export function renderSessionLessons(payload: SessionHookPayload = {}): string | null {
  const selection = selectSessionLessons(payload);
  return selection && (selection.selected.length || selection.findings.length) ? formatSelection(selection) : null;
}

function selectSessionLessons(payload: SessionHookPayload, cue = payload.prompt): HookSelection | null {
  const storePath = resolveSessionLessonStorePath(payload.cwd);
  if (!storePath) return null;

  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `SELECT library.*, lesson.status FROM v_lesson_library library
         JOIN lesson ON lesson.lesson_id = library.lesson_id`
      )
      .all() as unknown as LessonRow[];
    const findings = selectSessionFindings(db, { ...payload, repository: () => repositoryKey(payload.cwd) });
    const managedAdvice = new Set(trialManagedFindings(db).values());
    // Session banners never earn validation credit, so an unvalidated lesson
    // delivered here can never leave 0✓/0✗. Withhold it unless explicitly enabled.
    const includeUnvalidated = process.env.LYO_SESSION_UNVALIDATED_LESSONS === '1';
    const scoped = rows.filter(row => {
      if (!row.intervention.trim() || managedAdvice.has(row.intervention.trim())) return false;
      if (!includeUnvalidated && Number(row.helpful_count) + Number(row.harmful_count) === 0) return false;
      const verifier = sessionVerifier(row.explanation);
      return !verifier || verifier.repoPath === payload.cwd;
    });
    try {
      const {selected, retriever, policy, matches, reason} = runLessonSelection(scoped, priorCalibration(scoped).gamma,
        {cue: cue ?? '', limit: LIMIT - findings.length});
      return {selected, findings, storePath, selector: {retriever, policy, matches, reason, poolHash: hashValue(scoped), cueHash: hashValue(cue ?? '')}};
    } catch {
      // An unavailable ordinary selector must not suppress independently scoped findings.
      process.stderr.write('LYO ordinary lesson selection unavailable. Check the configured strategies.\n');
      return {selected: [], findings, storePath, selector: {reason: 'unavailable', matches: [],
        policy: process.env.LYO_LESSON_POLICY ?? 'thompson-beta@1', retriever: process.env.LYO_LESSON_RETRIEVER ?? 'eligible@1'}};
    }
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
    const selectionCue = payload.prompt;
    const refresh = payload.hook_event_name === 'SessionStart' || payload.hook_event_name === 'UserPromptSubmit';
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
    const selection = selectSessionLessons(payload, selectionCue ?? payload.prompt);
    if (!selection) return;
    if (sessionId && selection.selector && !selection.selected.length && (process.env.LYO_LESSON_RETRIEVER || process.env.LYO_LESSON_POLICY)) {
      const store = new LessonStore(selection.storePath);
      try {
        store.recordTrace({trace_id: `lesson-selection:${randomUUID()}`, run_id: sessionId, kind: 'behavior',
          summary: 'Ordinary lesson selection produced no advice.',
          payload: {source: 'lesson-selection@1', turnId: payload.turn_id ?? null, ...selection.selector}});
      } finally { store.close(); }
    }
    if (!refresh && sessionId && selection.selected.length && !claimSessionBanner(sessionId, selection.storePath)) selection.selected = [];
    if (!refresh && sessionId) selection.findings = selection.findings.filter(row => claimSessionBanner(sessionId, selection.storePath, `${row.id}:${row.version}`));
    if (!selection.selected.length && !selection.findings.length) return;
    if (sessionId) deliverSelection(selection, payload, sessionId, write);
    else write(formatSelection(selection));
  } catch {
    // fail-open: never block the session
  }
}

function deliverSelection(selection: HookSelection,
  payload: SessionHookPayload, sessionId: string, write: (text: string) => void, scope?: Record<string, unknown>): void {
  const store = new LessonStore(selection.storePath);
  try {
    const firstTraceId = `session-delivery:${sessionId}`;
    const traceId = store.getTrace(firstTraceId)
      ? `${firstTraceId}:${hashValue([payload.cwd, selection.selector, selection.selected.map(row => row.lesson_id),
        selection.findings.map(row => [row.id, row.version, row.context])])}` : firstTraceId;
    write(formatSelection(selection) + (selection.findings.length
      ? `Finding delivery: ${traceId}. Store: ${selection.storePath}. Before applying advice, use lyo finding inspect --finding-id <id> --store <path> for registration and semantic-review templates. Register the opportunity and exact planned capture action, then review evaluator semantics with finding semantics. Codex/Claude hooks capture paired actions and record assessments automatically. Without a sound evaluator leave the outcome unknown. Use the same --store throughout.\n` : ''));
    for (const row of selection.selected) store.recordApplication({ lesson_id: row.lesson_id,
      run_id: sessionId, trigger_message_id: 'session-banner', task_cue: payload.cwd ?? null });
    if (!store.getTrace(traceId)) store.recordTrace({ trace_id: traceId, run_id: sessionId,
      kind: 'protocol_application', summary: 'Session banner emitted.',
      payload: { cwd: payload.cwd, promptHash: typeof payload.prompt === 'string' ? hashValue(payload.prompt) : null,
        selector: selection.selector, lessons: selection.selected, findings: selection.findings, evidenceKind: 'delivery-only', ...(scope ? { scope } : {}) } });
  } finally { store.close(); }
}

/**
 * Deliver findings for activities inferred from an agent action, at most once per finding
 * version per session. Repository identity alone never establishes activity relevance.
 */
export function emitActionScopedFindings(input: { cwd: string; sessionId: string; activities: string[]; scope: Record<string, unknown> },
  write: (text: string) => void): SessionFinding[] {
  const storePath = resolveSessionLessonStorePath(input.cwd);
  if (!storePath || !input.activities.length) return [];
  const repository = repositoryKey(input.cwd);
  const db = new DatabaseSync(storePath, { readOnly: true });
  let findings: SessionFinding[];
  try {
    const query = (prompt: string) => selectSessionFindings(db, { cwd: input.cwd, prompt, repository: () => repository });
    findings = query(input.activities.map(activity => `[lyo:${activity}]`).join(' '))
      .filter(row => input.activities.includes(row.activity));
  } finally { db.close(); }
  findings = findings.filter(row => claimSessionBanner(input.sessionId, storePath, `action:${row.id}:${row.version}`));
  if (findings.length) deliverSelection({ selected: [], findings, storePath }, { cwd: input.cwd }, input.sessionId, write, input.scope);
  return findings;
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
      const event = { ...payload, cwd: payload.cwd || process.cwd() };
      if (process.argv.includes('--json') && event.hook_event_name) {
        let text = '';
        emitSessionLessons(event, chunk => { text += chunk; });
        const output = text ? visibleHookContext({ hookSpecificOutput: {
          hookEventName: event.hook_event_name, additionalContext: text } }, event, 'session-hook') : {};
        process.stdout.write(JSON.stringify(output) + '\n');
      } else emitSessionLessons(event);
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
