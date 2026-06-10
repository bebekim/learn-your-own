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

export type CyberneticCredibility =
  | 'conjectural'
  | 'plausible'
  | 'credible'
  | 'weakened'
  | 'defeated';

export type CyberneticCredibilityEffect =
  | 'supports'
  | 'weakens'
  | 'defeats'
  | 'neutral'
  | 'incomparable';

export type CyberneticPolyaPattern =
  | 'verifying_consequence'
  | 'successive_varied_consequence'
  | 'improbable_consequence'
  | 'inference_from_analogy'
  | 'possible_ground_defeated'
  | 'rival_conjecture_defeated'
  | 'conflicting_conjecture_present';

export type CyberneticConsequenceFreshness =
  | 'fresh_after_source'
  | 'stale_or_before_source'
  | 'not_observed';

export type CyberneticEvidenceIndependence =
  | 'independent'
  | 'partially_redundant'
  | 'unknown';

export type CyberneticEvidenceNovelty =
  | 'new_source_scope'
  | 'repeated_source_scope'
  | 'unknown';

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

export interface CyberneticAssociationHypothesis {
  id: string;
  source: string;
  relation: string;
  target: string;
  scope: string;
  artifactId: string;
  predictedConsequences: string[];
  prerequisites: string[];
  knownDefeaters: string[];
  credibility: CyberneticCredibility;
  evidenceEventIds: string[];
}

export interface CyberneticEvidenceEvent {
  evidenceEventId: string;
  hypothesisId: string;
  runId: string;
  observedConsequence: string | null;
  consequenceFreshness: CyberneticConsequenceFreshness;
  sourceWasActivated: boolean;
  activatedSources: string[];
  rivalExplanations: string[];
  defeatersPresent: string[];
  evidenceIndependence: CyberneticEvidenceIndependence;
  evidenceNovelty: CyberneticEvidenceNovelty;
  credibilityEffect: CyberneticCredibilityEffect;
  polyaPattern: CyberneticPolyaPattern | null;
  rationale: string;
  provenanceRefs: string[];
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

export interface CyberneticExperimentReport {
  experimentVersion: typeof CYBERNETIC_EXPERIMENT_VERSION;
  familyId: string;
  attempts: CyberneticExperimentAttemptReport[];
  deltas: {
    treatmentVsBaseline: CyberneticExperimentDelta | null;
    variantVsTreatment: CyberneticExperimentDelta | null;
  };
  associationHypotheses: CyberneticAssociationHypothesis[];
  evidenceEvents: CyberneticEvidenceEvent[];
  decision: CyberneticExperimentDecision;
  nextExperiment: string | null;
  limitations: string[];
}

export function buildCyberneticExperimentReport(input: CyberneticExperimentInput): CyberneticExperimentReport {
  const attempts = input.attempts.map(summarizeAttempt);
  const hypothesisSeeds = (input.associationEdges ?? [])
    .map((edge) => seedHypothesis(edge, input.familyId));
  const evidenceEvents = hypothesisSeeds.flatMap((hypothesis) => {
    return evidenceEventsForHypothesis(hypothesis, input.attempts, attempts);
  });
  const associationHypotheses = hypothesisSeeds.map((hypothesis) => {
    const hypothesisEvidence = evidenceEvents.filter((event) => event.hypothesisId === hypothesis.id);
    return {
      ...hypothesis,
      credibility: credibilityForEvidence(hypothesisEvidence),
      evidenceEventIds: hypothesisEvidence.map((event) => event.evidenceEventId),
    };
  });

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
    associationHypotheses,
    evidenceEvents,
    decision: decideExperiment(evidenceEvents),
    nextExperiment: input.nextExperiment ?? null,
    limitations: [
      'experiment v1 is a dry-run report and does not persist hypothesis or artifact state',
      'run scores are explanatory summaries over evidence refs, not a final learning algorithm',
      'credibility effects are provisional plausible-reasoning updates, not production-rule proof',
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

function seedHypothesis(
  edge: CyberneticAssociationEdgeInput,
  familyId: string
): CyberneticAssociationHypothesis {
  const parsed = parseAssociationEdge(edge.edge);
  const id = `hyp-${slug(edge.artifactId)}-${slug(parsed.source)}-${slug(parsed.target)}`;

  return {
    id,
    source: parsed.source,
    relation: parsed.relation,
    target: parsed.target,
    scope: familyId,
    artifactId: edge.artifactId,
    predictedConsequences: [
      'fresh passing verifier evidence after a related source activation',
    ],
    prerequisites: [
      'artifact is delivered into the attempt',
      'source scope is activated before the predicted consequence',
    ],
    knownDefeaters: [
      'artifact was delivered but source scope was not activated',
      'verifier failed after source activation without recovery',
      'run stopped after local mutation without a later verifier',
      'unsafe write occurred in the attempt',
    ],
    credibility: 'conjectural',
    evidenceEventIds: [],
  };
}

function evidenceEventsForHypothesis(
  hypothesis: CyberneticAssociationHypothesis,
  attemptInputs: CyberneticExperimentAttemptInput[],
  attempts: CyberneticExperimentAttemptReport[]
): CyberneticEvidenceEvent[] {
  const events: CyberneticEvidenceEvent[] = [];
  const priorSupportingSources = new Set<string>();

  for (const attemptInput of attemptInputs) {
    if (!(attemptInput.deliveredArtifacts ?? []).includes(hypothesis.artifactId)) {
      continue;
    }

    const attempt = attempts.find((candidate) => candidate.attemptId === attemptInput.attemptId);
    if (!attempt) continue;

    const activatedSources = activatedSourceRefs(attemptInput.telemetry.actions, hypothesis.source);
    const sourceWasActivated = activatedSources.length > 0;
    const passingEvidence = passingVerifierEvidenceAfterFinalEdit(attemptInput.telemetry.actions);
    const consequenceFreshness: CyberneticConsequenceFreshness = passingEvidence.length > 0
      ? 'fresh_after_source'
      : 'not_observed';
    const defeatersPresent = defeatersForAttempt(attempt, sourceWasActivated);
    const effect = credibilityEffectForAttempt({
      attempt,
      sourceWasActivated,
      passingEvidence,
      defeatersPresent,
    });
    const novelty = evidenceNovelty(activatedSources, priorSupportingSources);
    const polyaPattern = polyaPatternForEvidence(effect, novelty, priorSupportingSources.size > 0);
    const provenanceRefs = effect === 'supports'
      ? passingEvidence
      : attempt.evidenceRefs.slice(-1);

    if (effect === 'supports') {
      for (const source of activatedSources) {
        priorSupportingSources.add(source);
      }
    }

    events.push({
      evidenceEventId: `ev-${attempt.attemptId}-${hypothesis.id}`,
      hypothesisId: hypothesis.id,
      runId: attempt.runId,
      observedConsequence: passingEvidence.length > 0
        ? 'fresh passing verifier after final edit'
        : null,
      consequenceFreshness,
      sourceWasActivated,
      activatedSources,
      rivalExplanations: rivalExplanationsForAttempt(effect, sourceWasActivated),
      defeatersPresent,
      evidenceIndependence: evidenceIndependenceForNovelty(novelty),
      evidenceNovelty: novelty,
      credibilityEffect: effect,
      polyaPattern,
      rationale: rationaleForEvidence(effect, polyaPattern, defeatersPresent),
      provenanceRefs,
    });
  }

  return events;
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

function decideExperiment(events: CyberneticEvidenceEvent[]): CyberneticExperimentDecision {
  if (events.some((event) => event.credibilityEffect === 'defeats')) return 'demote_candidate';
  const supports = events.filter((event) => event.credibilityEffect === 'supports');
  if (supports.some((event) => event.polyaPattern === 'successive_varied_consequence')) {
    return 'generalize_candidate';
  }
  if (supports.length > 0) return 'retain_candidate';
  if (events.some((event) => event.credibilityEffect === 'weakens')) return 'specialize_candidate';
  return 'collect_more_evidence';
}

function credibilityForEvidence(events: CyberneticEvidenceEvent[]): CyberneticCredibility {
  if (events.some((event) => event.credibilityEffect === 'defeats')) return 'defeated';
  const supports = events.filter((event) => event.credibilityEffect === 'supports').length;
  const weakens = events.filter((event) => event.credibilityEffect === 'weakens').length;
  if (supports >= 2 && weakens === 0) return 'credible';
  if (supports >= 1 && weakens === 0) return 'plausible';
  if (weakens > 0) return 'weakened';
  return 'conjectural';
}

function parseAssociationEdge(edge: string): { source: string; relation: string; target: string } {
  const parts = edge.split('->').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      source: parts[0],
      relation: 'verified_by',
      target: parts.slice(1).join(' -> '),
    };
  }
  return {
    source: edge.trim(),
    relation: 'associated_with',
    target: edge.trim(),
  };
}

function activatedSourceRefs(actions: NormalizedAction[], sourcePattern: string): string[] {
  const refs = actions.flatMap((action) => [
    ...action.resources.read,
    ...action.resources.written,
  ]).map((resource) => resource.ref);
  return Array.from(new Set(refs.filter((ref) => matchesSourcePattern(ref, sourcePattern)))).sort();
}

function matchesSourcePattern(ref: string, pattern: string): boolean {
  const normalizedRef = normalizePathLike(ref);
  const normalizedPattern = normalizePathLike(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedRef === prefix || normalizedRef.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith('*')) {
    return normalizedRef.startsWith(normalizedPattern.slice(0, -1));
  }
  return normalizedRef === normalizedPattern;
}

function normalizePathLike(value: string): string {
  return value.replace(/^\.\//, '').replace(/\\/g, '/');
}

function defeatersForAttempt(
  attempt: CyberneticExperimentAttemptReport,
  sourceWasActivated: boolean
): string[] {
  const defeaters: string[] = [];
  if (!sourceWasActivated) {
    defeaters.push('artifact was delivered but source scope was not activated');
  }
  if (attempt.regression) {
    defeaters.push('verifier failed after source activation without recovery');
  }
  if (attempt.stoppedAfterEditWithoutVerification) {
    defeaters.push('run stopped after local mutation without a later verifier');
  }
  if (attempt.unsafeWrite) {
    defeaters.push('unsafe write occurred in the attempt');
  }
  return defeaters;
}

function credibilityEffectForAttempt(input: {
  attempt: CyberneticExperimentAttemptReport;
  sourceWasActivated: boolean;
  passingEvidence: string[];
  defeatersPresent: string[];
}): CyberneticCredibilityEffect {
  if (!input.sourceWasActivated) return 'incomparable';
  if (input.attempt.unsafeWrite || input.attempt.regression) return 'defeats';
  if (input.attempt.stoppedAfterEditWithoutVerification) return 'weakens';
  if (input.passingEvidence.length > 0) return 'supports';
  return input.defeatersPresent.length > 0 ? 'weakens' : 'neutral';
}

function evidenceNovelty(
  activatedSources: string[],
  priorSupportingSources: Set<string>
): CyberneticEvidenceNovelty {
  if (activatedSources.length === 0) return 'unknown';
  return activatedSources.some((source) => !priorSupportingSources.has(source))
    ? 'new_source_scope'
    : 'repeated_source_scope';
}

function evidenceIndependenceForNovelty(
  novelty: CyberneticEvidenceNovelty
): CyberneticEvidenceIndependence {
  if (novelty === 'new_source_scope') return 'independent';
  if (novelty === 'repeated_source_scope') return 'partially_redundant';
  return 'unknown';
}

function polyaPatternForEvidence(
  effect: CyberneticCredibilityEffect,
  novelty: CyberneticEvidenceNovelty,
  hasPriorSupport: boolean
): CyberneticPolyaPattern | null {
  if (effect === 'supports' && hasPriorSupport && novelty === 'new_source_scope') {
    return 'successive_varied_consequence';
  }
  if (effect === 'supports') return 'verifying_consequence';
  if (effect === 'weakens') return 'possible_ground_defeated';
  if (effect === 'defeats') return 'conflicting_conjecture_present';
  return null;
}

function rivalExplanationsForAttempt(
  effect: CyberneticCredibilityEffect,
  sourceWasActivated: boolean
): string[] {
  if (!sourceWasActivated) {
    return ['verified outcome, if any, may be unrelated to the hypothesized source scope'];
  }
  if (effect === 'neutral') {
    return ['delivered artifact was present but no predicted consequence was observed'];
  }
  return [];
}

function rationaleForEvidence(
  effect: CyberneticCredibilityEffect,
  polyaPattern: CyberneticPolyaPattern | null,
  defeatersPresent: string[]
): string {
  if (effect === 'supports' && polyaPattern === 'successive_varied_consequence') {
    return 'A fresh consequence was verified in a different activated source scope, increasing credibility without treating one success as proof.';
  }
  if (effect === 'supports') {
    return 'The predicted consequence was verified after the source was activated and no stronger defeater was present.';
  }
  if (effect === 'weakens') {
    return `A defeater weakened the conjecture: ${defeatersPresent.join('; ')}`;
  }
  if (effect === 'defeats') {
    return `A conflicting observation defeated the conjecture in this scope: ${defeatersPresent.join('; ')}`;
  }
  if (effect === 'incomparable') {
    return 'The observation is not comparable because the hypothesized source was not activated.';
  }
  return 'The artifact was delivered but the trace did not observe the predicted consequence.';
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
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
