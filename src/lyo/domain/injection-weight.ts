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
 * learned classifier (§3.1: "same math, coarser ĥ").
 *
 * Sign semantics (contribution to the OBSERVED outcome):
 *   u' = passed: w > 0 -> helpful evidence, w < 0 -> harmful
 *   u' = failed: w > 0 -> harmful evidence,  w < 0 -> helpful
 *   w ≈ 0: the lesson is uninformative about this outcome -> NO counter
 *          movement (COCOA's multiplicative gating).
 *
 * Identification notes (§3.5): a stratum/outcome cell with fewer than
 * MIN_STRATUM_DECISIONS resolved decisions, an undefined/non-positive
 * propensity, or a propensity of 1 (no selection contrast: certain inclusion)
 * cannot support the ratio — those injections fall back to the uniform ±1
 * rule ('uniform-fallback@1'), which over-credits by construction but keeps
 * cold-start learning moving.
 */

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

/**
 * The estimator's one decision point: given a resolved propensity and the
 * stratum's hindsight counts for this outcome, credit by the ratio or fall
 * back to uniform. A caller with no logged decision, or a decision the
 * candidates list doesn't cover, passes propensity as undefined and gets the
 * same fallback as an unidentified stratum — missing input and an
 * unidentifiable ratio are the same "we cannot support the ratio" case.
 */
export function estimateInjectionWeight(input: {
  propensity: number | null | undefined;
  stratumDecisions: number;
  selectedCount: number;
}): InjectionWeight {
  if (input.propensity === undefined || input.propensity === null || input.propensity <= 0) return FALLBACK;
  if (input.propensity >= 1) return FALLBACK;
  if (input.stratumDecisions < MIN_STRATUM_DECISIONS) return FALLBACK;
  const hHat = (input.selectedCount + 1) / (input.stratumDecisions + 2);
  const raw = hHat / input.propensity - 1;
  return { weight: Math.min(MAX_WEIGHT, Math.max(-1, raw)), estimator: RATIO_LIFT_ESTIMATOR_ID };
}

export interface StratumDecisionRow {
  decisionId: string;
  selectedLessonIds: string[];
  outcome: string;
}

export interface StratumStats {
  /** Resolved decisions per outcome: u' -> count. */
  decisionCounts: Map<string, number>;
  /** Decisions whose selected set contains the lesson: lesson_id -> u' -> count. */
  selectionCounts: Map<string, Map<string, number>>;
}

/**
 * Stratified hindsight rates for one failure_class: how often was each lesson
 * in the selected set of resolved decisions, per outcome. Counted per DECISION
 * (deduplicated by decisionId), never per receipt.
 */
export function stratumStatsFromRows(rows: readonly StratumDecisionRow[]): StratumStats {
  const decisionCounts = new Map<string, number>();
  const selectionCounts = new Map<string, Map<string, number>>();
  const seenDecisions = new Set<string>();

  for (const row of rows) {
    if (seenDecisions.has(row.decisionId)) continue;
    seenDecisions.add(row.decisionId);
    decisionCounts.set(row.outcome, (decisionCounts.get(row.outcome) ?? 0) + 1);
    for (const lessonId of row.selectedLessonIds) {
      const perOutcome = selectionCounts.get(lessonId) ?? new Map<string, number>();
      perOutcome.set(row.outcome, (perOutcome.get(row.outcome) ?? 0) + 1);
      selectionCounts.set(lessonId, perOutcome);
    }
  }

  return { decisionCounts, selectionCounts };
}
