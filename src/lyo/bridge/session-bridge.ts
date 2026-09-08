import { hashValue } from '../../contract/refs.ts';
import type { LearningKernel } from '../../ledger.ts';
import { recordTrace } from '../../reducers/core.ts';
import { extractHookFacts } from '../../hooks/normalizer.ts';
import { extractExitCode } from '../../hooks/exercise.ts';
import { LessonStore } from '../storage/lesson-store.ts';

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

/** Closed receipt path; observational outcomes never masquerade as causal credit. */
export function bridgeSessionOnEnd(kernel: LearningKernel, sessionId: string, storePath: string): { created: number; observed: number } {
  const session = kernel.db.prepare('SELECT repo_path, ended_at FROM agent_sessions WHERE session_id = ?')
    .get(sessionId) as { repo_path: string; ended_at: string | null } | undefined;
  if (!session?.ended_at) return { created: 0, observed: 0 };
  const store = new LessonStore(storePath);
  const traceId = `session-outcome:${hashValue(sessionId)}`;
  try {
    const previous = store.getTrace(traceId);
    if (previous) {
      if (!kernel.db.prepare('SELECT 1 FROM learning_traces WHERE trace_id = ?').get(traceId))
        recordTrace(kernel, { traceId, runId: sessionId, kind: 'behavior', summary: 'Session learning bridge observations.',
          payload: previous.payload_json ? JSON.parse(previous.payload_json) : null });
      return { created: 0, observed: 0 };
    }
    const rows = kernel.db.prepare(`SELECT event_id, event_name, turn_id, cwd, payload_json, created_at
      FROM hook_events WHERE session_id = ? ORDER BY created_at, rowid`).all(sessionId) as unknown as Array<{
      event_id: string; event_name: string; turn_id: string | null; cwd: string; payload_json: string; created_at: string;
    }>;
    const commands = rows.flatMap(row => {
      const facts = extractHookFacts({ eventId: row.event_id, eventName: row.event_name,
        sessionId, turnId: row.turn_id, cwd: row.cwd, payloadJson: row.payload_json });
      const exitCode = extractExitCode(facts.payload);
      if (exitCode === null || !['PostToolUse', 'PostToolUseFailure', 'tool.after', 'tool.failure'].includes(row.event_name)) return [];
      return facts.commands.filter(c => ['test', 'build', 'lint'].includes(c.classification))
        .map(c => ({ command: c.argvSummary, passed: exitCode === 0, ref: facts.evidenceRef }));
    });
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
