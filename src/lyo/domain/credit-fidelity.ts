/**
 * Descriptive comparison of recorded ratio-lift weights with uniform credit.
 * |w - 1| is estimator disagreement, not error against a known causal effect.
 * It cannot establish whether either estimator is correct. No external
 * intervention ground truth is available to this report.
 */

import { RATIO_LIFT_ESTIMATOR_ID } from './injection-weight.ts';

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

export interface ResolvedApplicationRow {
  applicationId: string;
  outcome: string;
  stratum: string;
}

export interface MarkInfo {
  helpful: boolean;
  weight: number | null;
  estimator: string | null;
}

// Running sums are kept in non-exported fields and folded away before return.
interface RunningRow extends CreditFidelityRow {
  _errorSum?: number;
  _weightSum?: number;
}

export function aggregateCreditFidelity(applications: readonly ResolvedApplicationRow[],
  marks: ReadonlyMap<string, MarkInfo>): CreditFidelityReport {
  const groups = new Map<string, RunningRow>();
  const overall = emptyRow('(overall)');
  groups.set(overall.stratum, overall);

  for (const application of applications) {
    let row = groups.get(application.stratum);
    if (!row) {
      row = emptyRow(application.stratum);
      groups.set(application.stratum, row);
    }
    accumulate(row, application, marks.get(application.applicationId));
    accumulate(overall, application, marks.get(application.applicationId));
  }

  for (const row of groups.values()) finalize(row);

  return {
    overall,
    strata: [...groups.values()]
      .filter(row => row.stratum !== '(overall)')
      .sort((a, b) => b.receipts - a.receipts || a.stratum.localeCompare(b.stratum)),
  };
}

function emptyRow(stratum: string): RunningRow {
  return { stratum, receipts: 0, legacy: 0, uniformFallback: 0, ratioLift: 0, gated: 0, signFlips: 0,
    meanAbsWeightDifference: null, meanAbsWeight: null, _errorSum: 0, _weightSum: 0 };
}

function accumulate(row: RunningRow, application: ResolvedApplicationRow, mark: MarkInfo | undefined): void {
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
  if (mark.estimator !== RATIO_LIFT_ESTIMATOR_ID) {
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
