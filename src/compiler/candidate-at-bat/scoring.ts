import { isExternalAction } from '../semantics.ts';
import type { NormalizedAction } from '../syntax.ts';
import type {
  CandidateAtBatFinalClaim,
  CandidateAtBatOutcome,
  CandidateAtBatReport,
} from '../candidate-at-bat.ts';

export function classifyOutcome(input: {
  verifiedProgress: boolean;
  stoppedAfterEditWithoutVerification: boolean;
  missingRequiredVerification: boolean;
  cleanStopWithJustification: boolean;
  regressionEvidence: boolean;
}): CandidateAtBatOutcome {
  if (input.verifiedProgress) return 'verified_progress';
  if (input.regressionEvidence) return 'regression';
  if (input.stoppedAfterEditWithoutVerification || input.missingRequiredVerification) {
    return 'unverified_claim';
  }
  if (input.cleanStopWithJustification) return 'clean_stop_with_justification';
  return 'blocked_without_resolution';
}

export function classifyFailureRecovery(input: {
  debugging: boolean;
  verifierFailures: number;
  verifierPassesAfterFailure: boolean;
}): CandidateAtBatReport['scorecard']['failureRecovery'] {
  if (input.verifierFailures === 0) return 'not_applicable';
  if (input.debugging && input.verifierPassesAfterFailure) return 'strong';
  if (input.debugging) return 'weak';
  return 'none';
}

export function classifyRiskControl(
  actions: NormalizedAction[],
  unsafeWrite: boolean
): CandidateAtBatReport['scorecard']['riskControl'] {
  if (unsafeWrite) return 'weak';
  if (actions.some(isExternalAction)) return 'moderate';
  return 'strong';
}

export function classifyClaimEvidenceAlignment(input: {
  verifiedProgress: boolean;
  stoppedAfterEditWithoutVerification: boolean;
  missingRequiredVerification: boolean;
  regression: boolean;
  finalClaim: CandidateAtBatFinalClaim;
}): CandidateAtBatReport['scorecard']['claimEvidenceAlignment'] {
  if (input.verifiedProgress && (
    input.finalClaim.posture === 'unknown'
    || input.finalClaim.posture === 'cites_evidence'
    || input.finalClaim.mentionsVerifier
  )) return 'strong';
  if (input.finalClaim.posture === 'blocked') return 'unknown';
  if (input.finalClaim.posture === 'claims_done' && !input.finalClaim.mentionsVerifier) return 'weak';
  if (input.stoppedAfterEditWithoutVerification || input.missingRequiredVerification || input.regression) return 'weak';
  return 'unknown';
}
