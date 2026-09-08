/**
 * Descriptive comparison of recorded ratio-lift weights with uniform credit.
 * |w - 1| is estimator disagreement, not error against a known causal effect.
 * It cannot establish whether either estimator is correct. No external
 * intervention ground truth is available to this report.
 */

import type { DatabaseSync } from 'node:sqlite';

export interface CreditFidelityRow {
  /** Decision failure_class (the ratio-lift stratum), or '(overall)'. */
  stratum: string;
  /** Resolved injections (applications with outcome passed/failed). */
  receipts: number;
  /** Receipts credited before F3 logging (MARK delta without weight). */
  legacy: number;
  /** Receipts credited under 'uniform-fallback@1' (unidentified strata). */
  uniformFallback: number;
  /** Receipts credited under 'ratio-lift@1'. */
  ratioLift: number;
  /** Receipts resolved with zero counter movement (w ≈ 0). */
  gated: number;
  /** Ratio-lift receipts whose signed weight moved the opposite counter. */
  signFlips: number;
  /** mean |w_signed − 1| over ratio-lift receipts; null when none. */
  meanAbsWeightDifference: number | null;
  /** mean |w_signed| over ratio-lift receipts; null when none. */
  meanAbsWeight: number | null;
}

export interface CreditFidelityReport {
  overall: CreditFidelityRow;
  strata: CreditFidelityRow[];
}

interface ResolvedApplicationRow {
  application_id: string;
  outcome: string;
  stratum: string;
}

interface MarkDeltaRow {
  delta_type: string;
  payload: string;
}

interface MarkInfo {
  helpful: boolean;
  weight: number | null;
  estimator: string | null;
}

const RATIO_LIFT = 'ratio-lift@1';

export function computeCreditFidelity(db: DatabaseSync): CreditFidelityReport {
  const applications = db
    .prepare(
      `SELECT a.application_id AS application_id, a.outcome AS outcome,
              COALESCE(d.failure_class, l.failure_class) AS stratum
       FROM lesson_application a
       JOIN lesson l ON l.lesson_id = a.lesson_id
       LEFT JOIN lesson_decision d ON d.decision_id = a.decision_id
       WHERE a.outcome IN ('passed', 'failed')`
    )
    .all() as unknown as ResolvedApplicationRow[];

  const marks = new Map<string, MarkInfo>();
  for (const row of db
    .prepare(
      `SELECT delta_type, payload FROM lesson_delta
       WHERE delta_type IN ('MARK_HELPFUL', 'MARK_HARMFUL')`
    )
    .all() as unknown as MarkDeltaRow[]) {
    const payload = safeParseObject(row.payload);
    const applicationId = payload?.application_id;
    if (typeof applicationId !== 'string') continue;
    marks.set(applicationId, {
      helpful: row.delta_type === 'MARK_HELPFUL',
      weight: typeof payload?.weight === 'number' ? payload.weight : null,
      estimator: typeof payload?.estimator === 'string' ? payload.estimator : null,
    });
  }

  const groups = new Map<string, RunningRow>();
  const overall = emptyRow('(overall)');
  groups.set(overall.stratum, overall);

  for (const application of applications) {
    let row = groups.get(application.stratum);
    if (!row) {
      row = emptyRow(application.stratum);
      groups.set(application.stratum, row);
    }
    accumulate(row, application, marks.get(application.application_id));
    accumulate(overall, application, marks.get(application.application_id));
  }

  for (const row of groups.values()) {
    finalize(row);
  }

  return {
    overall,
    strata: [...groups.values()]
      .filter((row) => row.stratum !== '(overall)')
      .sort((a, b) => b.receipts - a.receipts || a.stratum.localeCompare(b.stratum)),
  };
}

// Running sums are kept in non-exported fields and folded by finalize().
interface RunningRow extends CreditFidelityRow {
  _errorSum?: number;
  _weightSum?: number;
}

function emptyRow(stratum: string): RunningRow {
  return {
    stratum,
    receipts: 0,
    legacy: 0,
    uniformFallback: 0,
    ratioLift: 0,
    gated: 0,
    signFlips: 0,
    meanAbsWeightDifference: null,
    meanAbsWeight: null,
    _errorSum: 0,
    _weightSum: 0,
  };
}

function accumulate(
  row: RunningRow,
  application: ResolvedApplicationRow,
  mark: MarkInfo | undefined
): void {
  row.receipts++;
  if (!mark) {
    // Resolved with no MARK delta: ratio-lift judged the injection
    // uninformative (w = 0) — the receipt the uniform rule would have
    // over-credited.
    row.gated++;
    return;
  }
  if (mark.weight === null) {
    row.legacy++;
    return;
  }
  if (mark.estimator !== RATIO_LIFT) {
    row.uniformFallback++;
    return;
  }
  row.ratioLift++;
  // Outcome-signed weight: positive when the credit lands on the counter the
  // observed outcome points to (helpful on pass, harmful on fail).
  const aligned = (application.outcome === 'passed') === mark.helpful;
  const signed = aligned ? mark.weight : -mark.weight;
  if (signed < 0) row.signFlips++;
  row._errorSum = (row._errorSum ?? 0) + Math.abs(signed - 1);
  row._weightSum = (row._weightSum ?? 0) + Math.abs(signed);
}

function finalize(row: RunningRow): void {
  if (row.ratioLift > 0) {
    row.meanAbsWeightDifference = (row._errorSum ?? 0) / row.ratioLift;
    row.meanAbsWeight = (row._weightSum ?? 0) / row.ratioLift;
  }
  delete row._errorSum;
  delete row._weightSum;
}

function safeParseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
