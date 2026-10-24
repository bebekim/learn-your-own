/**
 * Exact stratified randomization test of "advice changes no outcome" (exact
 * Cochran–Mantel–Haenszel). Within each stratum, conditional on its arm sizes and
 * pass total, advice passes are hypergeometric under that null; the strata are
 * convolved. Validity needs fair assignment and no interference between units, not
 * independent outcomes, so units in one stratum may be arbitrarily alike.
 */

export interface StratumCounts {
  advice: { passes: number; assigned: number };
  control: { passes: number; assigned: number };
}

function logChoose(n: number, k: number, logFact: number[]): number {
  return logFact[n] - logFact[k] - logFact[n - k];
}

function hypergeometric(total: number, passes: number, draws: number, logFact: number[]): Map<number, number> {
  const pmf = new Map<number, number>();
  const denominator = logChoose(total, draws, logFact);
  for (let x = Math.max(0, draws - (total - passes)); x <= Math.min(draws, passes); x++) {
    pmf.set(x, Math.exp(logChoose(passes, x, logFact) + logChoose(total - passes, draws - x, logFact) - denominator));
  }
  return pmf;
}

/** One-sided p-values: benefit = P(T >= observed), harm = P(T <= observed). */
export function stratifiedExactPValues(strata: readonly StratumCounts[]): { benefit: number; harm: number } {
  const maxTotal = Math.max(0, ...strata.map(s => s.advice.assigned + s.control.assigned));
  const logFact = [0];
  for (let k = 1; k <= maxTotal; k++) logFact[k] = logFact[k - 1] + Math.log(k);
  let distribution = new Map<number, number>([[0, 1]]);
  let observed = 0;
  for (const { advice, control } of strata) {
    // Strata with an empty arm carry no comparison and are fixed under conditioning.
    if (!advice.assigned || !control.assigned) continue;
    observed += advice.passes;
    const stratum = hypergeometric(advice.assigned + control.assigned, advice.passes + control.passes, advice.assigned, logFact);
    const next = new Map<number, number>();
    for (const [sum, p] of distribution) for (const [x, q] of stratum) next.set(sum + x, (next.get(sum + x) ?? 0) + p * q);
    distribution = next;
  }
  if (distribution.size === 1) return { benefit: 1, harm: 1 };
  let benefit = 0, harm = 0;
  for (const [sum, p] of distribution) {
    if (sum >= observed) benefit += p;
    if (sum <= observed) harm += p;
  }
  return { benefit: Math.min(1, benefit), harm: Math.min(1, harm) };
}
