/**
 * pipeline-order - fixed topological ordering of the failure-class taxonomy
 * (Specs/6 Feature 2: causal ordering as selection search-space reduction).
 *
 * The six TRAIL failure classes are not an unordered bag: they label STAGES of
 * the agent pipeline, and pipeline stages have a causal order. A failure
 * OBSERVED at stage k can only have been CAUSED at stages 0..k — the upstream
 * closure. Lessons targeting downstream stages (> k) are causally incompatible
 * with the observation and can be excluded from the candidate set before
 * sampling. This mirrors ordering-based causal discovery (Vashishtha et al.
 * 2023, arxiv 2310.15117): the ordering is a domain prior that prunes the
 * search space; data-driven pruning WITHIN the closure is left to the
 * selection policy's posteriors and the ratio-lift credit estimator (F3).
 *
 * Deliberately deterministic (deterministic-classification.md): the order is
 * hand-specified domain knowledge, not LLM-inferred.
 */
export const PIPELINE_ORDER = [
  'goal_deviation',
  'context_handling',
  'tool_selection',
  'orchestration',
  'output_generation',
  'system_execution',
] as const;

export type CandidateScope = 'exact' | 'upstream';

/** Position of a failure class in the pipeline order; -1 when untaxonomied. */
export function stageIndex(failureClass: string): number {
  return (PIPELINE_ORDER as readonly string[]).indexOf(failureClass);
}

/**
 * Classes that can causally produce a failure observed at `observedClass`:
 * everything from the pipeline start through the observed stage, in order. An
 * unknown class degenerates to itself — identical to 'exact' scope.
 */
export function upstreamClosure(observedClass: string): string[] {
  const index = stageIndex(observedClass);
  if (index < 0) return [observedClass];
  return [...PIPELINE_ORDER.slice(0, index + 1)];
}

/**
 * stageIndex(observed) - stageIndex(candidate). >= 0: candidate is at or
 * upstream of the observation (causally compatible root cause). < 0:
 * downstream (incompatible — excluded under 'upstream' scope). null when
 * either class is outside the taxonomy.
 */
export function stageDistance(observedClass: string, candidateClass: string): number | null {
  const observed = stageIndex(observedClass);
  const candidate = stageIndex(candidateClass);
  if (observed < 0 || candidate < 0) return null;
  return observed - candidate;
}
