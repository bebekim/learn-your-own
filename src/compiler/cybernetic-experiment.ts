import {
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isTestAction,
} from './semantics.ts';
import type { NormalizedAction, RunTelemetryAst } from './syntax.ts';

export const CYBERNETIC_EXPERIMENT_VERSION = 'lyo/cybernetic-learning-experiment/v1';

export type CyberneticExperimentAttemptMode = 'baseline' | 'treatment' | 'variant';

export type CyberneticExperimentDecision =
  | 'retain_candidate'
  | 'specialize_candidate'
  | 'generalize_candidate'
  | 'demote_candidate'
  | 'collect_more_evidence';

export interface CyberneticExperimentAttemptInput {
  attemptId: string;
  mode: CyberneticExperimentAttemptMode;
  telemetry: RunTelemetryAst;
  deliveredArtifacts?: string[];
}

export interface CyberneticAssociationEdgeInput {
  edge: string;
  artifactId: string;
}

export interface CyberneticExperimentInput {
  familyId: string;
  attempts: CyberneticExperimentAttemptInput[];
  associationEdges?: CyberneticAssociationEdgeInput[];
  nextExperiment?: string | null;
}

export interface CyberneticExperimentAttemptReport {
  attemptId: string;
  mode: CyberneticExperimentAttemptMode;
  runId: string;
  deliveredArtifacts: string[];
  verifiedCompletion: boolean;
  stoppedAfterEditWithoutVerification: boolean;
  regression: boolean;
  unsafeWrite: boolean;
  runScore: number;
  promptCount: number;
  toolActionCount: number;
  editCount: number;
  verifierCount: number;
  failedVerifierCount: number;
  meanEditToVerifierDelayMs: number | null;
  evidenceRefs: string[];
}

export interface CyberneticExperimentDelta {
  fromAttemptId: string;
  toAttemptId: string;
  runScoreDelta: number;
  toolActionCountDelta: number;
  verifierCountDelta: number;
}

export interface CyberneticAssociationCredit {
  edge: string;
  artifactId: string;
  credit: -1 | 0 | 1;
  reason: string;
  evidenceRefs: string[];
}

export interface CyberneticExperimentReport {
  experimentVersion: typeof CYBERNETIC_EXPERIMENT_VERSION;
  familyId: string;
  attempts: CyberneticExperimentAttemptReport[];
  deltas: {
    treatmentVsBaseline: CyberneticExperimentDelta | null;
    variantVsTreatment: CyberneticExperimentDelta | null;
  };
  associationCredits: CyberneticAssociationCredit[];
  decision: CyberneticExperimentDecision;
  nextExperiment: string | null;
  limitations: string[];
}

export function buildCyberneticExperimentReport(input: CyberneticExperimentInput): CyberneticExperimentReport {
  const attempts = input.attempts.map(summarizeAttempt);
  const associationCredits = (input.associationEdges ?? [])
    .map((edge) => creditAssociation(edge, input.attempts, attempts));

  return {
    experimentVersion: CYBERNETIC_EXPERIMENT_VERSION,
    familyId: input.familyId,
    attempts,
    deltas: {
      treatmentVsBaseline: deltaBetween(
        attempts.find((attempt) => attempt.mode === 'baseline') ?? null,
        attempts.find((attempt) => attempt.mode === 'treatment') ?? null
      ),
      variantVsTreatment: deltaBetween(
        attempts.find((attempt) => attempt.mode === 'treatment') ?? null,
        attempts.find((attempt) => attempt.mode === 'variant') ?? null
      ),
    },
    associationCredits,
    decision: decideExperiment(associationCredits),
    nextExperiment: input.nextExperiment ?? null,
    limitations: [
      'experiment v1 is a dry-run report and does not persist association or artifact state',
      'run scores are explanatory summaries over evidence refs, not a final learning algorithm',
    ],
  };
}

function summarizeAttempt(input: CyberneticExperimentAttemptInput): CyberneticExperimentAttemptReport {
  const actions = input.telemetry.actions;
  const verifiedCompletion = hasVerifiedCompletion(actions);
  const stoppedAfterEditWithoutVerification = hasStoppedAfterEditWithoutVerification(actions);
  const regression = hasRegressionAfterEdit(actions);
  const unsafeWrite = hasUnsafeWrite(actions);
  const verifierActions = actions.filter(isTestAction);

  return {
    attemptId: input.attemptId,
    mode: input.mode,
    runId: input.telemetry.runId,
    deliveredArtifacts: input.deliveredArtifacts ?? [],
    verifiedCompletion,
    stoppedAfterEditWithoutVerification,
    regression,
    unsafeWrite,
    runScore: scoreAttempt({
      verifiedCompletion,
      stoppedAfterEditWithoutVerification,
      regression,
      unsafeWrite,
      toolActionCount: actions.filter((action) => action.eventKind !== 'boundary').length,
    }),
    promptCount: actions.filter(isPromptBoundary).length,
    toolActionCount: actions.filter((action) => action.eventKind !== 'boundary').length,
    editCount: actions.filter(isEditAction).length,
    verifierCount: verifierActions.length,
    failedVerifierCount: verifierActions.filter(actionFailed).length,
    meanEditToVerifierDelayMs: meanEditToVerifierDelay(actions),
    evidenceRefs: actions.map((action) => action.provenance.evidenceRef),
  };
}

function scoreAttempt(input: {
  verifiedCompletion: boolean;
  stoppedAfterEditWithoutVerification: boolean;
  regression: boolean;
  unsafeWrite: boolean;
  toolActionCount: number;
}): number {
  let score = 0;
  if (input.verifiedCompletion) score += 10;
  if (input.stoppedAfterEditWithoutVerification) score -= 6;
  if (input.regression) score -= 10;
  if (input.unsafeWrite) score -= 8;
  if (input.toolActionCount > 40) score -= Math.min(5, Math.floor((input.toolActionCount - 40) / 10) + 1);
  return score;
}

function creditAssociation(
  edge: CyberneticAssociationEdgeInput,
  attemptInputs: CyberneticExperimentAttemptInput[],
  attempts: CyberneticExperimentAttemptReport[]
): CyberneticAssociationCredit {
  const deliveredAttempts = attempts.filter((attempt) => attempt.deliveredArtifacts.includes(edge.artifactId));
  const deliveredInputs = attemptInputs.filter((attempt) => (attempt.deliveredArtifacts ?? []).includes(edge.artifactId));
  const evidenceRefs = deliveredInputs.flatMap((attempt) => passingVerifierEvidenceAfterFinalEdit(attempt.telemetry.actions));
  const treatment = deliveredAttempts.find((attempt) => attempt.mode === 'treatment') ?? null;
  const variant = deliveredAttempts.find((attempt) => attempt.mode === 'variant') ?? null;

  if (treatment?.verifiedCompletion && variant?.verifiedCompletion) {
    return {
      ...edge,
      credit: 1,
      reason: 'delivered artifact was followed by verified completion in treatment and variant attempts',
      evidenceRefs,
    };
  }

  if (treatment?.verifiedCompletion) {
    return {
      ...edge,
      credit: 1,
      reason: 'delivered artifact was followed by verified completion in the treatment attempt',
      evidenceRefs,
    };
  }

  if (deliveredAttempts.some((attempt) => attempt.regression || attempt.stoppedAfterEditWithoutVerification || attempt.unsafeWrite)) {
    return {
      ...edge,
      credit: -1,
      reason: 'delivered artifact was followed by regression, unsafe write, or unverified stop evidence',
      evidenceRefs: deliveredAttempts.flatMap((attempt) => attempt.evidenceRefs.slice(-1)),
    };
  }

  return {
    ...edge,
    credit: 0,
    reason: 'delivered artifact did not have enough outcome evidence for positive or negative credit',
    evidenceRefs,
  };
}

function deltaBetween(
  from: CyberneticExperimentAttemptReport | null,
  to: CyberneticExperimentAttemptReport | null
): CyberneticExperimentDelta | null {
  if (!from || !to) return null;
  return {
    fromAttemptId: from.attemptId,
    toAttemptId: to.attemptId,
    runScoreDelta: to.runScore - from.runScore,
    toolActionCountDelta: to.toolActionCount - from.toolActionCount,
    verifierCountDelta: to.verifierCount - from.verifierCount,
  };
}

function decideExperiment(credits: CyberneticAssociationCredit[]): CyberneticExperimentDecision {
  if (credits.some((credit) => credit.credit === -1)) return 'demote_candidate';
  if (credits.some((credit) => {
    return credit.credit === 1
      && credit.reason.includes('treatment and variant');
  })) return 'generalize_candidate';
  if (credits.some((credit) => credit.credit === 1)) return 'retain_candidate';
  return credits.length > 0 ? 'collect_more_evidence' : 'collect_more_evidence';
}

function hasRegressionAfterEdit(actions: NormalizedAction[]): boolean {
  const lastEditIndex = findLastIndex(actions, isEditAction);
  if (lastEditIndex === -1) return false;
  const verifiersAfterEdit = actions.slice(lastEditIndex + 1).filter(isTestAction);
  return verifiersAfterEdit.length > 0
    && verifiersAfterEdit.some(actionFailed)
    && !verifiersAfterEdit.some(actionSucceeded);
}

function passingVerifierEvidenceAfterFinalEdit(actions: NormalizedAction[]): string[] {
  const lastEditIndex = findLastIndex(actions, isEditAction);
  if (lastEditIndex === -1) return [];
  return actions
    .slice(lastEditIndex + 1)
    .filter((action) => isTestAction(action) && actionSucceeded(action))
    .map((action) => action.provenance.evidenceRef);
}

function meanEditToVerifierDelay(actions: NormalizedAction[]): number | null {
  const delays: number[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!isEditAction(action)) continue;

    const verifier = actions.slice(index + 1).find(isTestAction);
    if (!verifier) continue;

    const startedAt = Date.parse(action.provenance.createdAt);
    const verifiedAt = Date.parse(verifier.provenance.createdAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(verifiedAt)) continue;
    delays.push(Math.max(0, verifiedAt - startedAt));
  }

  if (delays.length === 0) return null;
  return Math.round(delays.reduce((sum, delay) => sum + delay, 0) / delays.length);
}

function isPromptBoundary(action: NormalizedAction): boolean {
  return action.eventKind === 'boundary' && action.provenance.eventName === 'UserPromptSubmit';
}

function actionSucceeded(action: NormalizedAction): boolean {
  return action.status === 'succeeded';
}

function actionFailed(action: NormalizedAction): boolean {
  return action.status === 'failed';
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}
