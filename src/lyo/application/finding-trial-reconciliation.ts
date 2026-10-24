import { evaluateFindingTrialPolicy, type FindingTrialPolicyDefinition } from '../domain/finding-trial-policy.ts';

export interface TrialObservationReference {
  id: string;
  assignmentHash: string;
  windowHash: string | null;
  evidenceHash: string | null;
}

export interface TrialObservation {
  id: string;
  assignment: { action: 'advice' | 'no-advice'; probability: 0.5 | 1 };
  sessionId: string | null;
  cwd: string;
  unit?: string;
  closed: boolean;
  outcome: 'pass' | 'fail' | 'unknown';
  reference: TrialObservationReference;
}

export interface TrialPolicyRecord {
  id: string;
  source: 'session-finding-policy@1';
  hash: string;
  supersedes: string | null;
  content: {
    trialId: string;
    trialHash: string;
    status: string;
    arms: ReturnType<typeof evaluateFindingTrialPolicy>['arms'];
    effectInterval: [number, number] | null;
    pValues?: { benefit: number; harm: number };
    evidence: TrialObservationReference[];
    definition: { findingVersion: string; model: string; runtime: 'codex' | 'claude' | null; roots: string[];
      evaluation: FindingTrialPolicyDefinition['evaluation'] | null; enrollment?: FindingTrialPolicyDefinition['enrollment'] };
  };
}

export interface FindingTrialReconciliationPort {
  observations(trialHash: string): readonly TrialObservation[];
  findingState(findingId: string): { version: string; validity: string };
  verifiersChanged(paths: string[], expectedHash: string): boolean;
  superseded(trialId: string): boolean;
  latestPolicy(trialHash: string): TrialPolicyRecord | null;
  recordPolicy(record: TrialPolicyRecord): void;
  hash(value: unknown): string;
}

/** Recheck eligibility from current retained observations; a port never supplies its own verdict. */
export function reconcileFindingTrial(port: FindingTrialReconciliationPort, trial: FindingTrialPolicyDefinition): TrialPolicyRecord {
  const rows = port.observations(trial.hash);
  const state = port.findingState(trial.findingId);
  const suspended = state.version !== trial.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity)
    || port.verifiersChanged(trial.measurement.verifierFiles, port.hash(trial.verifierFiles));
  const superseded = port.superseded(trial.id);
  const { status, arms, effectInterval, pValues } = evaluateFindingTrialPolicy(rows, trial.evaluation, { suspended, superseded });
  // Optional fields appear only when used, so existing trials keep their policy hashes.
  const content = { trialId: trial.id, trialHash: trial.hash, status, arms, effectInterval, ...(pValues ? { pValues } : {}),
    evidence: rows.map(row => row.reference), definition: { findingVersion: trial.findingVersion, model: trial.model,
      runtime: trial.runtime ?? null, roots: trial.roots, evaluation: trial.evaluation ?? null,
      ...(trial.enrollment ? { enrollment: trial.enrollment } : {}) } };
  const previous = port.latestPolicy(trial.hash), hash = port.hash(content);
  const id = previous?.hash === hash ? previous.id : `finding-policy:${port.hash([hash, previous?.id ?? null])}`;
  const record: TrialPolicyRecord = { id, source: 'session-finding-policy@1', content, hash,
    supersedes: previous?.hash === hash ? previous.supersedes : previous?.id ?? null };
  if (previous?.hash !== hash) port.recordPolicy(record);
  return record;
}

/** Validate again inside assignment's write transaction and immediately before emission. */
export function findingTrialAllocation(port: FindingTrialReconciliationPort, opportunity: {
  id: string; prospective?: { automatic?: { trialHash: string; unit: string } };
}, ref: string): 'advice' | 'no-advice' | null {
  const trialHash = opportunity.prospective?.automatic?.trialHash;
  if (!trialHash) throw new Error('policy allocation requires an automatic trial opportunity');
  const policy = port.latestPolicy(trialHash);
  const current = port.observations(trialHash).filter(row => row.id !== opportunity.id);
  const unit = opportunity.prospective!.automatic!.unit, enrollment = policy?.content.definition.enrollment;
  if (enrollment?.unit === 'session') {
    // The cap bounds each repository's share of the randomized cohort; it never blocks later delivery.
    const randomized = current.filter(row => row.unit === unit && row.assignment.probability === 0.5).length;
    if (policy!.content.status === 'collecting' && randomized >= enrollment.maxPerRepository)
      throw new Error('repository reached its session limit for this trial');
  } else if (current.some(row => row.unit === unit)) throw new Error('repository or directory already enrolled in this trial');
  if (policy?.id !== ref || port.hash(current.map(row => row.reference)) !== port.hash(policy.content.evidence))
    throw new Error('finding policy changed; recheck before assignment or delivery');
  return policy.content.status === 'collecting' ? null : policy.content.status === 'promoted' ? 'advice' : 'no-advice';
}
