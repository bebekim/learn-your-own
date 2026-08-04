/**
 * merge-confidence — actuarial trust for agent work. Four signals, two hard
 * gates, one score. The guardrail (deterministic standards) and the sandbox
 * (did it run) are non-negotiable: either failing routes to a human at
 * confidence zero. Above them, confidence = evalTrajectory × (1 - revertRate)
 * — a multiplicative independence model, documented as such. The threshold
 * is a policy input, not a buried constant (Argona's shadow-mode rule: score
 * first, choose the boundary from observed disagreement, not from vibes).
 */

export interface MergeSignals {
  guardrailPassed: boolean;
  /** Recent eval score for this agent version, 0..1. */
  evalTrajectory: number;
  /** Historical rollback rate for this agent + repo + change class, 0..1. */
  revertRate: number;
  sandboxPassed: boolean;
}

export interface MergeDecision {
  confidence: number;
  decision: 'merge' | 'route-to-human';
  failingSignal?: 'guardrail' | 'sandbox' | 'evalTrajectory' | 'revertRate';
}

export function computeMergeDecision(
  signals: MergeSignals,
  { threshold = 0.8 }: { threshold?: number } = {}
): MergeDecision {
  if (!signals.guardrailPassed) {
    return { confidence: 0, decision: 'route-to-human', failingSignal: 'guardrail' };
  }
  if (!signals.sandboxPassed) {
    return { confidence: 0, decision: 'route-to-human', failingSignal: 'sandbox' };
  }

  const trajectoryContribution = signals.evalTrajectory;
  const revertContribution = 1 - signals.revertRate;
  const confidence = trajectoryContribution * revertContribution;

  if (confidence >= threshold) {
    return { confidence, decision: 'merge' };
  }
  return {
    confidence,
    decision: 'route-to-human',
    failingSignal:
      trajectoryContribution <= revertContribution ? 'evalTrajectory' : 'revertRate',
  };
}
