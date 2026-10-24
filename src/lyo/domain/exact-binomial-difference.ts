/**
 * Exact unconditional bounds for the difference of two binomial proportions,
 * pA - pN, from x successes in n trials per arm (Barnard-type test ordered by the
 * observed difference). The p-value is the supremum over the nuisance proportion,
 * evaluated on a fine grid. Assumes independent outcomes within and between arms.
 */

const GRID = 1000;
const TOLERANCE = 1e-4;

export interface ArmCounts { passes: number; assigned: number }

function logFactorials(n: number): Float64Array {
  const table = new Float64Array(n + 1);
  for (let k = 2; k <= n; k++) table[k] = table[k - 1] + Math.log(k);
  return table;
}

function binomialPmf(n: number, p: number, logFact: Float64Array): Float64Array {
  const pmf = new Float64Array(n + 1);
  if (p <= 0) { pmf[0] = 1; return pmf; }
  if (p >= 1) { pmf[n] = 1; return pmf; }
  const lp = Math.log(p), lq = Math.log1p(-p);
  for (let x = 0; x <= n; x++) pmf[x] = Math.exp(logFact[n] - logFact[x] - logFact[n - x] + x * lp + (n - x) * lq);
  return pmf;
}

/** P(observed difference or larger) at pA = pN + delta, maximised over pN. */
export function superiorityPValue(advice: ArmCounts, control: ArmCounts, delta: number): number {
  const nA = advice.assigned, nN = control.assigned;
  // D >= d_obs  <=>  xA*nN - xN*nA >= K, using integers to avoid rounding at ties.
  const K = advice.passes * nN - control.passes * nA;
  const factA = logFactorials(nA), factN = logFactorials(nN);
  const tailAt = (pN: number) => {
    const pmfA = binomialPmf(nA, Math.min(1, Math.max(0, pN + delta)), factA);
    const pmfN = binomialPmf(nN, pN, factN);
    const cdfN = new Float64Array(nN + 1);
    let running = 0;
    for (let x = 0; x <= nN; x++) cdfN[x] = running += pmfN[x];
    let tail = 0;
    for (let xA = 0; xA <= nA; xA++) {
      const maxN = Math.floor((xA * nN - K) / nA);
      if (maxN >= 0) tail += pmfA[xA] * cdfN[Math.min(nN, maxN)];
    }
    return tail;
  };
  const low = Math.max(0, -delta), high = Math.min(1, 1 - delta), width = (high - low) / GRID;
  let supremum = 0, best = low;
  for (let step = 0; step <= GRID; step++) {
    const pN = low + width * step, tail = tailAt(pN);
    if (tail > supremum) { supremum = tail; best = pN; }
  }
  // Refine between the neighbours of the best grid point; the grid alone can understate the supremum.
  for (let step = 1; step < 20; step++) {
    const pN = Math.min(high, Math.max(low, best - width + 2 * width * step / 20));
    supremum = Math.max(supremum, tailAt(pN));
  }
  return Math.min(1, supremum);
}

/** Largest delta rejected at level alpha: a one-sided lower confidence bound for pA - pN. */
export function exactLowerBound(advice: ArmCounts, control: ArmCounts, alpha: number): number {
  if (superiorityPValue(advice, control, -1 + TOLERANCE) > alpha) return -1;
  let rejected = -1, accepted = 1;
  while (accepted - rejected > TOLERANCE) {
    const middle = (rejected + accepted) / 2;
    if (superiorityPValue(advice, control, middle) <= alpha) rejected = middle; else accepted = middle;
  }
  return rejected;
}

/** Two one-sided bounds, each at alpha/2, matching a two-sided 1 - alpha allowance. */
export function exactDifferenceInterval(advice: ArmCounts, control: ArmCounts, alpha: number): [number, number] {
  if (!advice.assigned || !control.assigned) return [-1, 1];
  return [exactLowerBound(advice, control, alpha / 2), -exactLowerBound(control, advice, alpha / 2)];
}
