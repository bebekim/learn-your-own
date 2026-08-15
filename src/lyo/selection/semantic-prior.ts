/**
 * semantic-prior - LLM semantic prior π_LLM for lesson selection
 * (Specs/6 Feature 1: LLM prior in belief propagation).
 *
 * The reflector (an LLM) proposes a lesson — hypothesis H — from the failure
 * text. Like the LLM in ordering-based causal discovery (Vashishtha et al.
 * 2023), it has broad semantic knowledge but its judgment is not grounded in
 * this system's outcomes, so it must act as a PRIOR SOURCE, never a decider.
 *
 * The fusion is conjugate Beta, exactly Pearl's BEL(H) ∝ λ(H)·π(H):
 *
 *   alpha = helpful_count + 1 + κ·c        λ = data counts (helpful/harmful)
 *   beta  = harmful_count + 1 + κ·(1−c)    π = prior pseudo-counts κ·c, κ·(1−c)
 *
 * c = the reflector's self-rated confidence that the lesson addresses the
 * failure, κ = prior strength in pseudo-counts. The prior biases EXPLORATION
 * (Thompson sampling) where data is sparse and washes out as grounded
 * outcomes accumulate — κ is fixed, counts grow. Deliberately, the prior does
 * NOT enter helpful/harmful counts, so the Wilson promotion gate and
 * v_lesson_library.posterior_mean stay pure-data: LLM proposes, the
 * environment counts (deterministic-classification.md; Wu et al. 2025 —
 * LLMs in a non-decisional auxiliary role).
 */

/** Pseudo-count strength when the reflector gives confidence but no strength. */
export const DEFAULT_PRIOR_STRENGTH = 2;
/** Hard cap so a confident LLM cannot dominate more than ~10 outcomes. */
export const MAX_PRIOR_STRENGTH = 10;

export interface LessonPrior {
  /** Reflector self-rated confidence in [0, 1]. */
  confidence: number;
  /** Prior strength κ in pseudo-counts; defaults to DEFAULT_PRIOR_STRENGTH. */
  strength?: number;
  /** Provenance, e.g. 'elaborator@1:openai/gpt-4o-mini'. */
  source?: string;
}

export interface NormalizedPrior {
  confidence: number;
  strength: number;
  source: string | null;
}

/**
 * Validate and normalize a prior for storage. Returns null when the input is
 * unusable (non-numeric or out-of-range confidence) — a malformed LLM
 * confidence must degrade to "no prior", never crash lesson creation.
 */
export function normalizePrior(prior: LessonPrior | null | undefined): NormalizedPrior | null {
  if (!prior || typeof prior.confidence !== 'number' || Number.isNaN(prior.confidence)) {
    return null;
  }
  if (prior.confidence < 0 || prior.confidence > 1) {
    return null;
  }
  const rawStrength =
    typeof prior.strength === 'number' && !Number.isNaN(prior.strength)
      ? prior.strength
      : DEFAULT_PRIOR_STRENGTH;
  const strength = Math.min(Math.max(rawStrength, 0), MAX_PRIOR_STRENGTH);
  if (strength === 0) {
    return null;
  }
  return {
    confidence: prior.confidence,
    strength,
    source: typeof prior.source === 'string' && prior.source ? prior.source : null,
  };
}

/** Parse the stored prior_json column; NULL/garbage degrades to no prior. */
export function parsePriorJson(priorJson: string | null | undefined): NormalizedPrior | null {
  if (!priorJson) return null;
  try {
    return normalizePrior(JSON.parse(priorJson) as LessonPrior);
  } catch {
    return null;
  }
}

/**
 * The π pseudo-counts added to the Beta posterior at selection time.
 * No prior -> { alpha: 0, beta: 0 }, leaving the pure-data posterior intact.
 */
export function priorPseudoCounts(prior: NormalizedPrior | null): { alpha: number; beta: number } {
  if (!prior) return { alpha: 0, beta: 0 };
  return {
    alpha: prior.strength * prior.confidence,
    beta: prior.strength * (1 - prior.confidence),
  };
}
