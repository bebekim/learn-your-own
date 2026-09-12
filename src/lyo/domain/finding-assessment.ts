type Check = { satisfied: boolean | null };
type ClaimKind = 'deterministic' | 'improvement' | 'unspecified';

export interface FindingObservation {
  withdrawn: boolean;
  claimKind: ClaimKind;
  deliveryId?: string;
  semantics: { verdict: 'accepted' | 'disputed'; claimKind: ClaimKind } | null;
  action: { problems: readonly string[] } | null;
  registration: { problems: readonly string[]; applicability: Check; adherenceBefore: Check };
  measurement: { problems: readonly string[]; adherence: Check | null; prediction: Check | null };
}

/** The adapter has checked receipt integrity and binding; these rules limit the claims they permit. */
export function assessFindingObservation(input: FindingObservation) {
  const { semantics, registration, measurement } = input;
  const usable = !input.withdrawn && semantics?.verdict === 'accepted' && semantics.claimKind === input.claimKind
    && !input.action?.problems.length && !measurement.problems.length && !registration.problems.length;
  const applicable = usable ? registration.applicability.satisfied : null;
  const followed = usable && registration.adherenceBefore.satisfied === false ? measurement.adherence?.satisfied ?? null : null;
  const predicted = input.deliveryId && applicable === true && followed === true && semantics?.claimKind === 'deterministic'
    ? measurement.prediction?.satisfied ?? null : null;
  return {
    incrementalBenefit: 'unknown',
    observedOutcome: usable && applicable === true && measurement.prediction?.satisfied != null
      ? measurement.prediction.satisfied ? 'pass' : 'fail' : 'unknown',
    applicability: applicable === null ? 'unknown' : applicable ? 'applicable' : 'inapplicable',
    adherence: followed === null ? 'unknown' : followed ? 'followed' : 'not-followed',
    outcome: predicted === null ? 'unknown' : predicted ? 'supported' : 'contradicted',
  } as const;
}
