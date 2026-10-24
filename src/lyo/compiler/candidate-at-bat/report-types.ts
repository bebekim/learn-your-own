// Report types shared by the candidate at-bat assembler and its helpers.
import type { WorkflowStyleClassification } from '../workflow-style.ts';

export const CANDIDATE_AT_BAT_REPORT_VERSION = 'lyo/candidate-at-bat/v1';

export type CandidateAtBatOutcome =
  | 'verified_progress'
  | 'regression'
  | 'unverified_claim'
  | 'clean_stop_with_justification'
  | 'blocked_without_resolution';

export type CandidateAtBatTechniqueSignature =
  | 'verifier-first'
  | 'explorer'
  | 'prompt-heavy-generator'
  | 'debugger'
  | 'risky-shipper'
  | 'manual-orchestrated'
  | 'loop-assisted'
  | 'loop-driven-candidate';

export type CandidateAtBatVerifierKind =
  | 'targeted'
  | 'broad'
  | 'static'
  | 'build'
  | 'smoke'
  | 'unknown';

export type CandidateAtBatVerifierMatchMode =
  | 'contains'
  | 'exact'
  | 'regex';

export type CandidateAtBatVerifierQuality =
  | 'strong'
  | 'moderate'
  | 'weak'
  | 'missing';

export type CandidateAtBatFinalClaimPosture =
  | 'claims_done'
  | 'cites_evidence'
  | 'blocked'
  | 'asks_for_followup'
  | 'unknown';

export interface CandidateAtBatVerifierSpec {
  id: string;
  commandPattern: string;
  kind: CandidateAtBatVerifierKind;
  required: boolean;
  matchMode?: CandidateAtBatVerifierMatchMode;
}

export interface CandidateAtBatMatchedVerifier {
  id: string;
  kind: CandidateAtBatVerifierKind;
  required: boolean;
  command: string;
  evidenceRef: string;
  passed: boolean;
  freshAfterFinalEdit: boolean;
}

export interface CandidateAtBatFinalClaim {
  posture: CandidateAtBatFinalClaimPosture;
  mentionsVerifier: boolean;
  mentionsBlocker: boolean;
  summary: string | null;
  evidenceRefs: string[];
}

export interface CandidateAtBatTaskContext {
  taskId: string;
  language?: string | null;
  taskComplexity: number;
  expectedPattern: string;
  successCriteria: string[];
  allowedTools: string[];
  verifiers?: CandidateAtBatVerifierSpec[];
  baseline: {
    existingTestsPass?: boolean | null;
    buildSucceeds?: boolean | null;
    knownIssues?: string[];
  };
}

export interface CandidateAtBatReport {
  reportVersion: typeof CANDIDATE_AT_BAT_REPORT_VERSION;
  mode: 'evaluate';
  runId: string;
  sessionId: string | null;
  taskId: string;
  taskContext: CandidateAtBatTaskContext;
  outcome: CandidateAtBatOutcome;
  shipReadiness: boolean;
  verifierQuality: CandidateAtBatVerifierQuality;
  matchedVerifiers: CandidateAtBatMatchedVerifier[];
  missingRequiredVerifiers: string[];
  finalClaim: CandidateAtBatFinalClaim;
  scorecard: {
    verifiedProgress: boolean;
    stoppedAfterEditWithoutVerification: boolean;
    inspectBeforeEdit: boolean;
    cleanStopWithJustification: boolean;
    failureRecovery: 'strong' | 'weak' | 'none' | 'not_applicable';
    riskControl: 'strong' | 'moderate' | 'weak';
    claimEvidenceAlignment: 'strong' | 'weak' | 'unknown';
  };
  conversion: {
    turns: number | null;
    toolCalls: number;
    edits: number;
    verifierRuns: number;
    verifierPasses: number;
    verifierFailures: number;
  };
  timing: {
    timeToFirstInspectMs: number | null;
    timeToFirstEditMs: number | null;
    timeToFirstVerifierMs: number | null;
    meanEditToVerifierDelayMs: number | null;
    failureRecoveryLatencyMs: number | null;
    totalSessionDurationMs: number | null;
  };
  resourceChurn: {
    writeCountsByResource: Record<string, number>;
    commandCountsByKind: {
      inspect: number;
      edit: number;
      test: number;
      external: number;
      unknown: number;
    };
    resourceTouchCounts: Record<string, number>;
    repeatedEditHotspots: string[];
  };
  workflowStyle: {
    classification: WorkflowStyleClassification;
    confidence: 'low' | 'medium' | 'high';
    lineageMode: 'inferred_only' | 'explicit';
  };
  techniqueSignature: CandidateAtBatTechniqueSignature[];
  evidenceRefs: string[];
  limitations: string[];
}
