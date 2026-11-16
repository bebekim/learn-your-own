import { hashValue } from '../contract/refs.ts';
import type { LearningKernel } from '../storage/ledger.ts';
import { recordTrace } from '../storage/reducers/core.ts';
import { extractHookFacts } from '../hooks/normalizer.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { verifierCommand } from './verifier-command.ts';

export interface SessionVerifier {
  source: 'session-verifier@1';
  repoPath: string;
  command: string;
  failureRef: string;
  recoveryRef: string | null;
}

export function sessionVerifier(explanation: string): SessionVerifier | null {
  try {
    const value = JSON.parse(explanation) as SessionVerifier;
    return value.source === 'session-verifier@1' && typeof value.repoPath === 'string' &&
      typeof value.command === 'string' ? value : null;
  } catch { return null; }
}

const RESULT_EVENTS = ['PostToolUse', 'PostToolUseFailure', 'tool.after', 'tool.failure'];

/**
 * Test/build/lint results in session order. Pass/fail comes from the normalizer's
 * command status, not a numeric exit code: hosts rarely send one and capture redacts
 * tool output. Commands whose status is unknown, or whose shell line hides the
 * verifier's status (see verifierCommand), are skipped, never assumed.
 */
function verifierObservations(kernel: LearningKernel, sessionId: string): Array<{ command: string; passed: boolean; ref: string }> {
  const rows = kernel.db.prepare(`SELECT event_id, event_name, turn_id, cwd, payload_json
    FROM hook_events WHERE session_id = ? ORDER BY created_at, rowid`).all(sessionId) as unknown as Array<{
    event_id: string; event_name: string; turn_id: string | null; cwd: string; payload_json: string;
  }>;
  return rows.filter(row => RESULT_EVENTS.includes(row.event_name)).flatMap(row => {
    const facts = extractHookFacts({ eventId: row.event_id, eventName: row.event_name,
      sessionId, turnId: row.turn_id, cwd: row.cwd, payloadJson: row.payload_json });
    return facts.commands.flatMap(c => {
      const verifier = c.status === 'succeeded' || c.status === 'failed' ? verifierCommand(c.argv) : null;
      return verifier ? [{ command: verifier.command, passed: c.status === 'succeeded', ref: facts.evidenceRef }] : [];
    });
  });
}

/**
 * v1 required a numeric exit code that real hosts never send, so v1 receipts recorded
 * no commands. A v1 receipt that did see commands stands; otherwise the session is
 * re-observed under the v2 id. v1 receipts are never rewritten. An existing v2 receipt
 * is mirrored into the kernel ledger if missing there.
 */
function alreadyBridged(kernel: LearningKernel, store: LessonStore, sessionId: string, traceId: string): boolean {
  const v1 = store.getTrace(`session-outcome:${hashValue(sessionId)}`);
  if (v1 && (JSON.parse(v1.payload_json ?? '{}').commands ?? []).length > 0) return true;
  const previous = store.getTrace(traceId);
  if (!previous) return false;
  if (!kernel.db.prepare('SELECT 1 FROM learning_traces WHERE trace_id = ?').get(traceId))
    recordTrace(kernel, { traceId, runId: sessionId, kind: 'behavior', summary: 'Session learning bridge observations.',
      payload: previous.payload_json ? JSON.parse(previous.payload_json) : null });
  return true;
}

/** Closed receipt path; observational outcomes never masquerade as causal credit. */
export function bridgeSessionOnEnd(kernel: LearningKernel, sessionId: string, storePath: string): { created: number; observed: number } {
  const session = kernel.db.prepare('SELECT repo_path, ended_at FROM agent_sessions WHERE session_id = ?')
    .get(sessionId) as { repo_path: string; ended_at: string | null } | undefined;
  if (!session?.ended_at) return { created: 0, observed: 0 };
  const store = new LessonStore(storePath);
  const traceId = `session-outcome:v2:${hashValue(sessionId)}`;
  try {
    if (alreadyBridged(kernel, store, sessionId, traceId)) return { created: 0, observed: 0 };
    const commands = verifierObservations(kernel, sessionId);
    const created: string[] = [];
    for (const command of [...new Set(commands.filter(c => !c.passed).map(c => c.command))].slice(0, 3)) {
      const observations = commands.filter(c => c.command === command);
      const failure = observations.find(c => !c.passed)!;
      const last = observations.at(-1)!;
      if (!last.passed) continue; // Unrecovered failures remain observations, not actionable advice.
      const metadata: SessionVerifier = { source: 'session-verifier@1', repoPath: session.repo_path,
        command, failureRef: failure.ref, recoveryRef: last.passed ? last.ref : null };
      const cue = `session-verifier:${hashValue([session.repo_path, command])}`;
      const existing = store.db.prepare('SELECT lesson_id, provenance FROM lesson WHERE trigger_cue = ?').get(cue) as
        { lesson_id: string; provenance: string } | undefined;
      if (existing && (JSON.parse(existing.provenance) as string[]).includes(sessionId)) continue;
      const lesson = store.createLesson({ failure_class: 'output_generation', trigger_cue: cue,
        explanation: JSON.stringify(metadata),
        intervention: `Run ${command} after the final edit; it caught a failure in earlier work in this repository.`,
        run_id: sessionId, actor: 'session-bridge' });
      if (lesson) created.push(lesson.lesson_id);
    }
    const applications = store.db.prepare(`SELECT a.application_id, l.explanation FROM lesson_application a
      JOIN lesson l ON l.lesson_id = a.lesson_id WHERE a.run_id = ? AND a.counted = 0`)
      .all(sessionId) as unknown as Array<{ application_id: string; explanation: string }>;
    const outcomes = applications.map(a => {
      const verifier = sessionVerifier(a.explanation);
      const observed = verifier?.repoPath === session.repo_path ? commands.filter(c => c.command === verifier.command).at(-1) : undefined;
      return { applicationId: a.application_id, outcome: observed ? (observed.passed ? 'observed-pass' : 'observed-fail') : 'unobserved',
        evidenceRef: observed?.ref ?? null };
    });
    const payload = { source: 'native-session-observation', sessionId, repoPath: session.repo_path,
      createdLessonIds: created, commands, outcomes, causalCredit: false };
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.recordTrace({ trace_id: traceId, run_id: sessionId, kind: 'behavior',
        summary: 'Session verifier observations; no causal benefit inferred.', payload });
      for (const row of outcomes) store.db.prepare('UPDATE lesson_application SET outcome = ?, counted = 1 WHERE application_id = ? AND counted = 0')
        .run(row.outcome, row.applicationId);
      store.db.exec('COMMIT');
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
    if (!kernel.db.prepare('SELECT 1 FROM learning_traces WHERE trace_id = ?').get(traceId))
      recordTrace(kernel, { traceId, runId: sessionId, kind: 'behavior', summary: 'Session learning bridge observations.', payload });
    return { created: created.length, observed: outcomes.length };
  } finally { store.close(); }
}
