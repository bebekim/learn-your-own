export const DEFAULT_POLICY_ID = 'thompson-beta@1';

export interface SelectionCandidate {
  lesson_id: string;
  alpha: number;
  beta: number;
}

export interface ScoredSelection {
  index: number;
  score: number | null;
}

function sampleStandardNormal(rng: () => number): number {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

// Marsaglia-Tsang gamma sampler. Local implementation, no new dependencies.
export function sampleGamma(shape: number, rng: () => number): number {
  if (shape <= 0) {
    throw new Error(`sampleGamma: shape must be > 0, got ${shape}`);
  }
  if (shape < 1) {
    return sampleGamma(shape + 1, rng) * Math.pow(rng(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u <= 0) continue;
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleThompsonBetaSelection(
  candidates: SelectionCandidate[],
  limit: number,
  rng: () => number = Math.random
): ScoredSelection[] {
  const scored = candidates.map((candidate, index) => {
    const alpha = sampleGamma(candidate.alpha, rng);
    const beta = sampleGamma(candidate.beta, rng);
    return { index, score: alpha / (alpha + beta) };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(0, limit));
}
