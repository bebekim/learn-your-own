/**
 * ratio-lift credit estimator (Specs/6 Feature 3; §3.1 deep-read revision of
 * the design doc's §5.3).
 *
 * Replaces "every pending injection in a run gets the same ±1" with COCOA's
 * hindsight density ratio per injection:
 *
 *   w_i = ĥ(ℓ_i | s_i, u') / ρ_i − 1
 *
 * where s is the stratum (failure_class of the decision), u' the observed run
 * outcome, ρ_i the selection propensity logged in lesson_decision.candidates,
 * and ĥ the probability that lesson ℓ was injected GIVEN the stratum and the
 * outcome — estimated with add-one-smoothed stratified rates instead of a
 * learned classifier (§3.1: "same math, coarser ĥ"). ĥ is fit on PAST resolved
 * receipts only: the run being credited is still pending at call time, so it
 * never contaminates its own hindsight rate.
 *
 * Sign semantics (contribution to the OBSERVED outcome):
 *   u' = passed: w > 0 -> helpful evidence, w < 0 -> harmful
 *   u' = failed: w > 0 -> harmful evidence,  w < 0 -> helpful
 *   w ≈ 0: the lesson is uninformative about this outcome -> NO counter
 *          movement (COCOA's multiplicative gating).
 *
 * Identification notes (§3.5): strata are counted per decision row, not per
 * receipt; within-run cycle stratification is deferred (cycle_index is logged
 * for exactly that). A stratum/outcome cell with fewer than
 * MIN_STRATUM_DECISIONS resolved decisions cannot support the ratio — those
 * injections fall back to the uniform ±1 rule ('uniform-fallback@1'), which
 * over-credits by construction but keeps cold-start learning moving.
 */

import type { DatabaseSync } from 'node:sqlite';

export const RATIO_LIFT_ESTIMATOR_ID = 'ratio-lift@1';
export const UNIFORM_FALLBACK_ESTIMATOR_ID = 'uniform-fallback@1';
export const MIN_STRATUM_DECISIONS = 5;
export const MAX_WEIGHT = 4;

export interface InjectionWeight {
  /** Signed credit; |weight| is the fractional counter movement. */
  weight: number;
  estimator: string;
}

const FALLBACK: InjectionWeight = { weight: 1, estimator: UNIFORM_FALLBACK_ESTIMATOR_ID };

interface PendingApplicationRow {
  application_id: string;
  lesson_id: string;
  decision_id: string | null;
}

interface DecisionLogRow {
  decision_id: string;
  failure_class: string;
  candidates: string;
}

interface StratumDecisionRow {
  decision_id: string;
  selected: string;
  outcome: string;
}

interface CandidateEntry {
  lesson_id?: string;
  propensity?: number;
}

interface StratumStats {
  /** Resolved decisions per outcome: u' -> count. */
  decisionCounts: Map<string, number>;
  /** Decisions whose selected set contains the lesson: lesson_id -> u' -> count. */
  selectionCounts: Map<string, Map<string, number>>;
}

/**
 * Per-injection weights for one run's pending applications. Returns a Map from
 * application_id to its signed weight; applications with no logged decision,
 * no usable propensity, or a too-sparse stratum cell get the uniform fallback.
 */
export function computeInjectionWeights(
  db: DatabaseSync,
  runId: string,
  outcome: 'passed' | 'failed'
): Map<string, InjectionWeight> {
  const weights = new Map<string, InjectionWeight>();
  const applications = db
    .prepare(
      'SELECT application_id, lesson_id, decision_id FROM lesson_application WHERE run_id = ? AND counted = 0'
    )
    .all(runId) as unknown as PendingApplicationRow[];

  const decisionCache = new Map<string, DecisionLogRow | null>();
  const stratumCache = new Map<string, StratumStats>();

  for (const application of applications) {
    if (!application.decision_id) {
      weights.set(application.application_id, FALLBACK);
      continue;
    }

    if (!decisionCache.has(application.decision_id)) {
      decisionCache.set(
        application.decision_id,
        (db
          .prepare('SELECT decision_id, failure_class, candidates FROM lesson_decision WHERE decision_id = ?')
          .get(application.decision_id) as unknown as DecisionLogRow | undefined) ?? null
      );
    }
    const decision = decisionCache.get(application.decision_id);
    if (!decision) {
      weights.set(application.application_id, FALLBACK);
      continue;
    }

    const candidates = safeParseArray(decision.candidates);
    const propensity = candidates.find((entry) => entry.lesson_id === application.lesson_id)?.propensity;
    if (propensity === undefined || propensity === null || propensity <= 0) {
      // Deterministic policies log propensity 0/1 and legacy rows lack
      // propensities entirely: the ratio is not identified there.
      weights.set(application.application_id, FALLBACK);
      continue;
    }
    if (propensity >= 1) {
      // Inclusion was CERTAIN (candidate set fit inside the selection limit):
      // the lesson appears in every decision of its stratum, so ĥ <= ρ by
      // construction and the ratio degenerates to a pure smoothing artifact
      // (w = -1/(N+2)) that would leak spurious credit to the OPPOSITE
      // counter. No selection contrast exists — the injection is not an
      // experiment — so fall back to the uniform rule (§3.5: identification
      // requires propensity strictly inside (0, 1)).
      weights.set(application.application_id, FALLBACK);
      continue;
    }

    const stratum = decision.failure_class;
    if (!stratumCache.has(stratum)) {
      stratumCache.set(stratum, computeStratumStats(db, stratum));
    }
    const stats = stratumCache.get(stratum)!;
    const n = stats.decisionCounts.get(outcome) ?? 0;
    if (n < MIN_STRATUM_DECISIONS) {
      weights.set(application.application_id, FALLBACK);
      continue;
    }

    const k = stats.selectionCounts.get(application.lesson_id)?.get(outcome) ?? 0;
    const hHat = (k + 1) / (n + 2);
    const raw = hHat / propensity - 1;
    weights.set(application.application_id, {
      weight: Math.min(MAX_WEIGHT, Math.max(-1, raw)),
      estimator: RATIO_LIFT_ESTIMATOR_ID,
    });
  }

  return weights;
}

/**
 * Stratified hindsight rates for one failure_class: how often was each lesson
 * in the selected set of resolved decisions, per outcome. Counted per DECISION
 * (deduplicated across its application rows), never per receipt.
 */
function computeStratumStats(db: DatabaseSync, failureClass: string): StratumStats {
  const rows = db
    .prepare(
      `SELECT d.decision_id AS decision_id, d.selected AS selected, a.outcome AS outcome
       FROM lesson_decision d
       JOIN lesson_application a ON a.decision_id = d.decision_id
       WHERE d.failure_class = ? AND a.outcome IN ('passed', 'failed')`
    )
    .all(failureClass) as unknown as StratumDecisionRow[];

  const decisionCounts = new Map<string, number>();
  const selectionCounts = new Map<string, Map<string, number>>();
  const seenDecisions = new Set<string>();

  for (const row of rows) {
    if (seenDecisions.has(row.decision_id)) continue;
    seenDecisions.add(row.decision_id);
    decisionCounts.set(row.outcome, (decisionCounts.get(row.outcome) ?? 0) + 1);
    for (const entry of safeParseArray(row.selected)) {
      if (!entry.lesson_id) continue;
      const perOutcome = selectionCounts.get(entry.lesson_id) ?? new Map<string, number>();
      perOutcome.set(row.outcome, (perOutcome.get(row.outcome) ?? 0) + 1);
      selectionCounts.set(entry.lesson_id, perOutcome);
    }
  }

  return { decisionCounts, selectionCounts };
}

function safeParseArray(json: string): CandidateEntry[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? (parsed as CandidateEntry[]) : [];
  } catch {
    return [];
  }
}
