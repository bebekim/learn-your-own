export interface FindingTrialPolicyDefinition {
  id: string;
  hash: string;
  findingId: string;
  findingVersion: string;
  model: string;
  runtime?: 'codex' | 'claude';
  roots: string[];
  evaluation?: { sampleSize: number; minimumEffect: number; alpha: number; assumptions: string };
  measurement: { verifierFiles: string[] };
  verifierFiles: Array<{ path: string; content: string | null }>;
}

export interface FindingTrialOutcome {
  assignment: { action: 'advice' | 'no-advice'; probability: 0.5 | 1 };
  closed: boolean;
  outcome: 'pass' | 'fail' | 'unknown';
}

/** Receipt integrity and current finding/verifier checks belong to the adapter. */
export function evaluateFindingTrialPolicy(rows: readonly FindingTrialOutcome[], plan: FindingTrialPolicyDefinition['evaluation'],
  eligibility: { suspended: boolean; superseded: boolean }) {
  const sample = rows.filter(row => row.assignment.probability === 0.5);
  const arms = { advice: { assigned: 0, pass: 0, fail: 0, unknown: 0 }, 'no-advice': { assigned: 0, pass: 0, fail: 0, unknown: 0 } };
  for (const row of sample) { arms[row.assignment.action].assigned++; arms[row.assignment.action][row.outcome]++; }
  let status = 'collecting';
  let effectInterval: [number, number] | null = null;
  if (plan && sample.length >= plan.sampleSize) {
    status = 'awaiting-outcomes';
    if (sample.every(row => row.closed)) {
      // Hoeffding for independent fair assignments: Z = 2*A*Y - 2*(1-A)*Y is in [-2,2].
      // Unknown outcomes take their worst/best possible values; they are never discarded.
      const radius = Math.sqrt(8 * Math.log(2 / plan.alpha) / sample.length);
      const base = 2 * (arms.advice.pass - arms['no-advice'].pass) / sample.length;
      effectInterval = [Math.max(-1, base - 2 * arms['no-advice'].unknown / sample.length - radius),
        Math.min(1, base + 2 * arms.advice.unknown / sample.length + radius)];
      status = arms.advice.assigned && arms['no-advice'].assigned && effectInterval[0] <= effectInterval[1]
        ? effectInterval[0] > plan.minimumEffect ? 'promoted' : effectInterval[1] < 0 ? 'harmful' : 'inconclusive'
        : 'inconclusive';
    }
    if (sample.length !== plan.sampleSize) status = 'invalid-cohort';
  }
  if (status === 'promoted' && rows.some(row => row.assignment.probability === 1 && row.assignment.action === 'advice'
    && row.closed && row.outcome !== 'pass')) status = 'needs-review';
  if (eligibility.suspended) status = 'suspended';
  if (eligibility.superseded) status = 'superseded';
  return { status, arms, effectInterval };
}
