/**
 * evidence — sequential likelihood-ratio accumulation for the trust gate.
 *
 * Each run is one Bernoulli observation of a disagreement class: does it
 * recur (1) or not (0, including weaken events — clean runs with the same
 * spec and writer model)? Evidence accumulates as a log-likelihood ratio
 * between "recurring pattern" (rate p1) and "background noise" (rate p0).
 *
 * Promotion happens when E > 1/alpha. The threshold is not a heuristic: it
 * is the tolerated false-promotion rate, stated in its own units, and it is
 * always-valid — the process may be checked after every run with the error
 * guarantee intact. p0 is estimated from the run corpus (empirical null);
 * overestimating p0 errs on the safe side (fewer false promotions).
 */

export function logEvidenceRatio(x: 0 | 1, p1: number, p0: number): number {
  const numerator = x === 1 ? p1 : 1 - p1;
  const denominator = x === 1 ? p0 : 1 - p0;
  return Math.log(numerator / denominator);
}

export function accumulateEvidence(stream: Array<0 | 1>, p1: number, p0: number): number {
  let logE = 0;
  for (const x of stream) {
    logE += logEvidenceRatio(x, p1, p0);
  }
  return Math.exp(logE);
}

export function evidenceThreshold(alpha: number): number {
  return 1 / alpha;
}
