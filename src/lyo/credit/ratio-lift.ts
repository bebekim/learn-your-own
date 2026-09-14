import type { DatabaseSync } from 'node:sqlite';
import { estimateInjectionWeight, stratumStatsFromRows } from '../domain/injection-weight.ts';
import type { InjectionWeight, StratumStats } from '../domain/injection-weight.ts';
import { pendingApplications, decisionLog, stratumDecisionRows } from '../storage/credit-state.ts';
import type { DecisionLog } from '../storage/credit-state.ts';

export { RATIO_LIFT_ESTIMATOR_ID, UNIFORM_FALLBACK_ESTIMATOR_ID, MIN_STRATUM_DECISIONS, MAX_WEIGHT } from '../domain/injection-weight.ts';
export type { InjectionWeight } from '../domain/injection-weight.ts';

/**
 * Per-injection weights for one run's pending applications. Returns a Map from
 * application_id to its signed weight; applications with no logged decision,
 * no usable propensity, or a too-sparse stratum cell get the uniform fallback.
 */
export function computeInjectionWeights(db: DatabaseSync, runId: string, outcome: 'passed' | 'failed'): Map<string, InjectionWeight> {
  const weights = new Map<string, InjectionWeight>();
  const decisionCache = new Map<string, DecisionLog | null>();
  const stratumCache = new Map<string, StratumStats>();

  for (const application of pendingApplications(db, runId)) {
    let decision: DecisionLog | null = null;
    if (application.decisionId) {
      if (!decisionCache.has(application.decisionId)) decisionCache.set(application.decisionId, decisionLog(db, application.decisionId));
      decision = decisionCache.get(application.decisionId)!;
    }
    if (!decision) {
      weights.set(application.applicationId, estimateInjectionWeight({ propensity: undefined, stratumDecisions: 0, selectedCount: 0 }));
      continue;
    }

    const propensity = decision.candidates.find(entry => entry.lesson_id === application.lessonId)?.propensity;
    if (propensity === undefined || propensity === null || propensity <= 0 || propensity >= 1) {
      // Deterministic policies log propensity 0/1 and legacy rows lack
      // propensities entirely: the ratio is not identified there. A
      // propensity of exactly 1 means certain inclusion — no selection
      // contrast, so the ratio degenerates to a smoothing artifact.
      weights.set(application.applicationId, estimateInjectionWeight({ propensity, stratumDecisions: 0, selectedCount: 0 }));
      continue;
    }

    if (!stratumCache.has(decision.failureClass)) stratumCache.set(decision.failureClass, stratumStatsFromRows(stratumDecisionRows(db, decision.failureClass)));
    const stats = stratumCache.get(decision.failureClass)!;
    const n = stats.decisionCounts.get(outcome) ?? 0;
    const k = stats.selectionCounts.get(application.lessonId)?.get(outcome) ?? 0;
    weights.set(application.applicationId, estimateInjectionWeight({ propensity, stratumDecisions: n, selectedCount: k }));
  }

  return weights;
}
