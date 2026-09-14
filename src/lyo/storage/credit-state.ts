import type { DatabaseSync } from 'node:sqlite';
import type { MarkInfo, ResolvedApplicationRow } from '../domain/credit-fidelity.ts';
import type { StratumDecisionRow } from '../domain/injection-weight.ts';

interface ResolvedApplicationSqlRow {
  application_id: string;
  outcome: string;
  stratum: string;
}

export function resolvedCreditApplications(db: DatabaseSync): ResolvedApplicationRow[] {
  return (db.prepare(`SELECT a.application_id AS application_id, a.outcome AS outcome,
      COALESCE(d.failure_class, l.failure_class) AS stratum
    FROM lesson_application a
    JOIN lesson l ON l.lesson_id = a.lesson_id
    LEFT JOIN lesson_decision d ON d.decision_id = a.decision_id
    WHERE a.outcome IN ('passed', 'failed')`).all() as unknown as ResolvedApplicationSqlRow[])
    .map(row => ({ applicationId: row.application_id, outcome: row.outcome, stratum: row.stratum }));
}

interface MarkDeltaRow {
  delta_type: string;
  payload: string;
}

export function markInfoByApplication(db: DatabaseSync): Map<string, MarkInfo> {
  const marks = new Map<string, MarkInfo>();
  for (const row of db.prepare(`SELECT delta_type, payload FROM lesson_delta
      WHERE delta_type IN ('MARK_HELPFUL', 'MARK_HARMFUL')`).all() as unknown as MarkDeltaRow[]) {
    const payload = safeParseObject(row.payload);
    const applicationId = payload?.application_id;
    if (typeof applicationId !== 'string') continue;
    marks.set(applicationId, {
      helpful: row.delta_type === 'MARK_HELPFUL',
      weight: typeof payload?.weight === 'number' ? payload.weight : null,
      estimator: typeof payload?.estimator === 'string' ? payload.estimator : null,
    });
  }
  return marks;
}

export interface PendingApplication {
  applicationId: string;
  lessonId: string;
  decisionId: string | null;
}

export function pendingApplications(db: DatabaseSync, runId: string): PendingApplication[] {
  return (db.prepare('SELECT application_id, lesson_id, decision_id FROM lesson_application WHERE run_id = ? AND counted = 0')
    .all(runId) as unknown as Array<{ application_id: string; lesson_id: string; decision_id: string | null }>)
    .map(row => ({ applicationId: row.application_id, lessonId: row.lesson_id, decisionId: row.decision_id }));
}

export interface DecisionLog {
  candidates: Array<{ lesson_id?: string; propensity?: number }>;
  failureClass: string;
}

export function decisionLog(db: DatabaseSync, decisionId: string): DecisionLog | null {
  const row = db.prepare('SELECT failure_class, candidates FROM lesson_decision WHERE decision_id = ?')
    .get(decisionId) as unknown as { failure_class: string; candidates: string } | undefined;
  return row ? { failureClass: row.failure_class, candidates: safeParseArray(row.candidates) } : null;
}

export function stratumDecisionRows(db: DatabaseSync, failureClass: string): StratumDecisionRow[] {
  const rows = db.prepare(`SELECT d.decision_id AS decision_id, d.selected AS selected, a.outcome AS outcome
      FROM lesson_decision d
      JOIN lesson_application a ON a.decision_id = d.decision_id
      WHERE d.failure_class = ? AND a.outcome IN ('passed', 'failed')`)
    .all(failureClass) as unknown as Array<{ decision_id: string; selected: string; outcome: string }>;
  return rows.map(row => ({ decisionId: row.decision_id,
    selectedLessonIds: safeParseArray(row.selected).flatMap(entry => entry.lesson_id ? [entry.lesson_id] : []),
    outcome: row.outcome }));
}

function safeParseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function safeParseArray(json: string): Array<{ lesson_id?: string; propensity?: number }> {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed as Array<{ lesson_id?: string; propensity?: number }> : [];
  } catch { return []; }
}
