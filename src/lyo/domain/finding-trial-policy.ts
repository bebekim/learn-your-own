import { exactDifferenceInterval } from './exact-binomial-difference.ts';
import { stratifiedExactPValues, type StratumCounts } from './stratified-exact-test.ts';

export interface FindingTrialPolicyDefinition {
  id: string;
  hash: string;
  findingId: string;
  findingVersion: string;
  model: string;
  runtime?: 'codex' | 'claude';
  roots: string[];
  evaluation?: { sampleSize: number; minimumEffect: number; alpha: number; assumptions: string;
    method?: 'hoeffding' | 'exact-binomial' | 'stratified-exact' };
  enrollment?: { unit: 'session'; maxPerRepository: number };
  measurement: { verifierFiles: string[] };
  verifierFiles: Array<{ path: string; content: string | null }>;
}

export interface FindingTrialOutcome {
  assignment: { action: 'advice' | 'no-advice'; probability: 0.5 | 1 };
  closed: boolean;
  outcome: 'pass' | 'fail' | 'unknown';
  /** Repository (Git common directory) or directory that enrolled; the stratum for session-unit trials. */
  unit?: string;
}

/** Receipt integrity and current finding/verifier checks belong to the adapter. */
export function evaluateFindingTrialPolicy(rows: readonly FindingTrialOutcome[], plan: FindingTrialPolicyDefinition['evaluation'],
  eligibility: { suspended: boolean; superseded: boolean }) {
  const sample = rows.filter(row => row.assignment.probability === 0.5);
  const arms = { advice: { assigned: 0, pass: 0, fail: 0, unknown: 0 }, 'no-advice': { assigned: 0, pass: 0, fail: 0, unknown: 0 } };
  for (const row of sample) { arms[row.assignment.action].assigned++; arms[row.assignment.action][row.outcome]++; }
  let status = 'collecting';
  let effectInterval: [number, number] | null = null;
  let pValues: { benefit: number; harm: number } | undefined;
  if (plan && sample.length >= plan.sampleSize) {
    status = 'awaiting-outcomes';
    if (sample.every(row => row.closed)) {
      // Unknown outcomes take their worst/best possible values; they are never discarded.
      if (plan.method === 'stratified-exact') {
        pValues = {
          benefit: stratifiedExactPValues(strataCounts(sample, 'worst')).benefit,
          harm: stratifiedExactPValues(strataCounts(sample, 'best')).harm,
        };
        // A no-effect test cannot certify a positive margin, so a margin blocks promotion.
        status = pValues.benefit <= plan.alpha / 2 && plan.minimumEffect === 0 ? 'promoted'
          : pValues.harm <= plan.alpha / 2 ? 'harmful' : 'inconclusive';
      } else if (plan.method === 'exact-binomial') {
        const advice = arms.advice, control = arms['no-advice'];
        effectInterval = [
          exactDifferenceInterval({ passes: advice.pass, assigned: advice.assigned },
            { passes: control.pass + control.unknown, assigned: control.assigned }, plan.alpha)[0],
          exactDifferenceInterval({ passes: advice.pass + advice.unknown, assigned: advice.assigned },
            { passes: control.pass, assigned: control.assigned }, plan.alpha)[1],
        ];
      } else {
        // Hoeffding for independent fair assignments: Z = 2*A*Y - 2*(1-A)*Y is in [-2,2].
        const radius = Math.sqrt(8 * Math.log(2 / plan.alpha) / sample.length);
        const base = 2 * (arms.advice.pass - arms['no-advice'].pass) / sample.length;
        effectInterval = [Math.max(-1, base - 2 * arms['no-advice'].unknown / sample.length - radius),
          Math.min(1, base + 2 * arms.advice.unknown / sample.length + radius)];
      }
      if (effectInterval) status = arms.advice.assigned && arms['no-advice'].assigned && effectInterval[0] <= effectInterval[1]
        ? effectInterval[0] > plan.minimumEffect ? 'promoted' : effectInterval[1] < 0 ? 'harmful' : 'inconclusive'
        : 'inconclusive';
    }
    if (sample.length !== plan.sampleSize) status = 'invalid-cohort';
  }
  if (status === 'promoted' && rows.some(row => row.assignment.probability === 1 && row.assignment.action === 'advice'
    && row.closed && row.outcome !== 'pass')) status = 'needs-review';
  if (eligibility.suspended) status = 'suspended';
  if (eligibility.superseded) status = 'superseded';
  return { status, arms, effectInterval, ...(pValues ? { pValues } : {}) };
}

/** Per-repository arm counts, imputing unknown outcomes against (worst) or for (best) the advice. */
function strataCounts(sample: readonly FindingTrialOutcome[], imputation: 'worst' | 'best'): StratumCounts[] {
  const strata = new Map<string, StratumCounts>();
  for (const row of sample) {
    const key = row.unit ?? '';
    const stratum = strata.get(key) ?? { advice: { passes: 0, assigned: 0 }, control: { passes: 0, assigned: 0 } };
    const arm = row.assignment.action === 'advice' ? stratum.advice : stratum.control;
    const unknownPasses = row.assignment.action === 'advice' ? imputation === 'best' : imputation === 'worst';
    arm.assigned++;
    if (row.outcome === 'pass' || (row.outcome === 'unknown' && unknownPasses)) arm.passes++;
    strata.set(key, stratum);
  }
  return [...strata.values()];
}
