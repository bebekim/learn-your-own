import { compileTelemetryRunAst } from './parser.ts';
import {
  buildExplanationGraphReport,
  type ExplanationFactorInput,
  type ExplanationGraphReport,
} from './explanation-graph.ts';
import {
  hasExternalSideEffects,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  isEditAction,
  isTestAction,
} from './semantics.ts';
import {
  countHookEvents,
  findAgentLearningDatabases,
  hasTable,
  listTelemetryRunIds,
  openReadOnlyLedger,
  type SkippedDatabase,
} from './ledger-scan.ts';
import type { LearningKernel } from '../ledger.ts';
import type { NormalizedAction, ResourceRef, RunTelemetryAst } from './syntax.ts';

export const ASSOCIATION_LEARNING_VERSION = 'lyo/association-learning/v1';

export type AssociationCredibility =
  | 'conjectural'
  | 'plausible'
  | 'credible'
  | 'weakened'
  | 'defeated';

export type AssociationCredibilityEffect =
  | 'supports'
  | 'weakens'
  | 'defeats'
  | 'neutral'
  | 'incomparable';

export type AssociationPolyaPattern =
  | 'verifying_consequence'
  | 'successive_varied_consequence'
  | 'improbable_consequence'
  | 'inference_from_analogy'
  | 'possible_ground_defeated'
  | 'rival_conjecture_defeated'
  | 'conflicting_conjecture_present';

export type AssociationConsequenceFreshness =
  | 'fresh_after_source'
  | 'stale_or_before_source'
  | 'not_observed';

export type AssociationEvidenceIndependence =
  | 'independent'
  | 'partially_redundant'
  | 'unknown';

export type AssociationEvidenceNovelty =
  | 'new_source_scope'
  | 'repeated_source_scope'
  | 'unknown';

export interface AssociationHypothesis {
  id: string;
  source: string;
  relation: 'verified_by';
  target: string;
  scope: string;
  predictedConsequences: string[];
  prerequisites: string[];
  knownDefeaters: string[];
  credibility: AssociationCredibility;
  supportCount: number;
  weakenCount: number;
  defeatCount: number;
  neutralCount: number;
  distinctRunCount: number;
  distinctLedgerCount: number;
  activatedSourceExamples: string[];
  scopeWarnings: string[];
  policyWarnings: string[];
  evidenceEventIds: string[];
  recommendedNextExperiment: string;
}

export interface AssociationEvidenceEvent {
  evidenceEventId: string;
  hypothesisId: string;
  runId: string;
  dbPath: string;
  observedConsequence: string | null;
  consequenceFreshness: AssociationConsequenceFreshness;
  sourceWasActivated: boolean;
  activatedSources: string[];
  rivalExplanations: string[];
  defeatersPresent: string[];
  policyWarnings: string[];
  evidenceIndependence: AssociationEvidenceIndependence;
  evidenceNovelty: AssociationEvidenceNovelty;
  credibilityEffect: AssociationCredibilityEffect;
  polyaPattern: AssociationPolyaPattern | null;
  rationale: string;
  provenanceRefs: string[];
}

export interface AssociationLearningReport {
  learningVersion: typeof ASSOCIATION_LEARNING_VERSION;
  mode: 'learn';
  dryRun: true;
  persisted: false;
  root: string;
  ledgers: number;
  scannedDatabases: string[];
  skippedDatabases: SkippedDatabase[];
  totalEvents: number;
  runCount: number;
  analyzedRunIds: string[];
  hypothesisCount: number;
  evidenceEventCount: number;
  associationHypotheses: AssociationHypothesis[];
  evidenceEvents: AssociationEvidenceEvent[];
  explanationBeliefs: AssociationExplanationBelief[];
  summaryText: string;
  summaryLines: string[];
  limitations: string[];
}

export interface AssociationExplanationBelief {
  hypothesisId: string;
  source: string;
  target: string;
  associationCredibility: AssociationCredibility;
  associationCounters: {
    supportCount: number;
    weakenCount: number;
    defeatCount: number;
    neutralCount: number;
    distinctRunCount: number;
    distinctLedgerCount: number;
    scopeWarnings: string[];
    policyWarnings: string[];
  };
  explanation: ExplanationGraphReport;
}

interface RunSample {
  dbPath: string;
  runId: string;
  ast: RunTelemetryAst;
}

interface SourceActivation {
  source: string;
  resourceRef: string;
  action: NormalizedAction;
  actionIndex: number;
}

interface VerifierObservation {
  command: string;
  action: NormalizedAction;
  actionIndex: number;
}

interface HypothesisAccumulator {
  source: string;
  target: string;
  events: AssociationEvidenceEvent[];
  supportRuns: Set<string>;
  supportLedgers: Set<string>;
  activatedSources: Set<string>;
  scopeWarnings: Set<string>;
  policyWarnings: Set<string>;
}

export function buildAssociationLearningReport(input: { root: string }): AssociationLearningReport {
  const dbPaths = findAgentLearningDatabases(input.root);
  const skippedDatabases: SkippedDatabase[] = [];
  const scannedDatabases: string[] = [];
  const samples: RunSample[] = [];
  let totalEvents = 0;

  for (const dbPath of dbPaths) {
    let db: ReturnType<typeof openReadOnlyLedger> | null = null;
    try {
      db = openReadOnlyLedger(dbPath);
      const kernel: LearningKernel = { db, dbPath };
      if (!hasTable(kernel, 'hook_events')) {
        skippedDatabases.push({ dbPath, reason: 'missing_hook_events_table' });
        continue;
      }

      scannedDatabases.push(dbPath);
      totalEvents += countHookEvents(kernel);
      for (const runId of listTelemetryRunIds(kernel)) {
        samples.push({
          dbPath,
          runId,
          ast: compileTelemetryRunAst(kernel, { runId }),
        });
      }
    } catch (error) {
      skippedDatabases.push({
        dbPath,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      db?.close();
    }
  }

  const discovered = discoverAssociations(samples);
  const explanationBeliefs = buildAssociationExplanationBeliefs(
    discovered.hypotheses,
    discovered.evidenceEvents
  );
  const summaryLines = buildSummaryLines({
    ledgers: scannedDatabases.length,
    runCount: samples.length,
    hypothesisCount: discovered.hypotheses.length,
    evidenceEventCount: discovered.evidenceEvents.length,
    credibleCount: discovered.hypotheses.filter((hypothesis) => hypothesis.credibility === 'credible').length,
    skippedCount: skippedDatabases.length,
  });

  return {
    learningVersion: ASSOCIATION_LEARNING_VERSION,
    mode: 'learn',
    dryRun: true,
    persisted: false,
    root: input.root,
    ledgers: scannedDatabases.length,
    scannedDatabases,
    skippedDatabases,
    totalEvents,
    runCount: samples.length,
    analyzedRunIds: samples.map((sample) => sample.runId).sort(),
    hypothesisCount: discovered.hypotheses.length,
    evidenceEventCount: discovered.evidenceEvents.length,
    associationHypotheses: discovered.hypotheses,
    evidenceEvents: discovered.evidenceEvents,
    explanationBeliefs,
    summaryText: summaryLines.join('\n'),
    summaryLines,
    limitations: limitations(samples, skippedDatabases),
  };
}

function discoverAssociations(samples: RunSample[]): {
  hypotheses: AssociationHypothesis[];
  evidenceEvents: AssociationEvidenceEvent[];
} {
  const byKey = new Map<string, HypothesisAccumulator>();

  for (const sample of samples) {
    const sources = sourceActivations(sample.ast.actions);
    const passedVerifiers = verifierObservations(sample.ast.actions).filter((verifier) => actionSucceeded(verifier.action));

    for (const verifier of passedVerifiers) {
      const priorSources = sources.filter((source) => source.actionIndex < verifier.actionIndex);
      for (const source of uniqueSources(priorSources)) {
        const accumulator = ensureAccumulator(byKey, source.source, verifier.command);
        const existingSupport = accumulator.events.some((event) => {
          return event.runId === sample.runId
            && event.dbPath === sample.dbPath
            && event.credibilityEffect === 'supports';
        });
        if (existingSupport) continue;

        const priorForHypothesis = accumulator.events.filter((event) => event.credibilityEffect === 'supports');
        const event = supportEvidenceEvent({
          sample,
          source,
          verifier,
          priorSupportCount: priorForHypothesis.length,
          priorActivatedSources: accumulator.activatedSources,
        });
        accumulator.events.push(event);
        accumulator.supportRuns.add(runKey(sample));
        accumulator.supportLedgers.add(sample.dbPath);
        accumulator.activatedSources.add(source.resourceRef);
        for (const warning of sourceScopeWarnings(source.source)) accumulator.scopeWarnings.add(warning);
        for (const warning of event.policyWarnings) accumulator.policyWarnings.add(warning);
      }
    }
  }

  for (const accumulator of byKey.values()) {
    for (const sample of samples) {
      const sources = sourceActivations(sample.ast.actions)
        .filter((source) => source.source === accumulator.source);
      if (sources.length === 0) continue;
      const alreadyObserved = accumulator.events.some((event) => {
        return event.runId === sample.runId && event.dbPath === sample.dbPath;
      });
      if (alreadyObserved) continue;

      const firstSource = sources[0];
      const verifiers = verifierObservations(sample.ast.actions)
        .filter((verifier) => verifier.actionIndex > firstSource.actionIndex && verifier.command === accumulator.target);
      const failedVerifier = verifiers.find((verifier) => actionFailed(verifier.action));
      if (failedVerifier) {
        const event = weakeningEvidenceEvent({
          sample,
          source: firstSource,
          target: accumulator.target,
          verifier: failedVerifier,
          reason: 'target verifier fails after source mutation',
        });
        accumulator.events.push(event);
        for (const warning of event.policyWarnings) accumulator.policyWarnings.add(warning);
        continue;
      }

      if (hasStoppedAfterEditWithoutVerification(sample.ast.actions)) {
        const event = weakeningEvidenceEvent({
          sample,
          source: firstSource,
          target: accumulator.target,
          verifier: null,
          reason: 'run stopped after source mutation without later verifier',
        });
        accumulator.events.push(event);
        for (const warning of event.policyWarnings) accumulator.policyWarnings.add(warning);
      }
    }
  }

  const hypotheses = Array.from(byKey.values())
    .map(toHypothesis)
    .sort(compareHypotheses);
  const includedIds = new Set(hypotheses.map((hypothesis) => hypothesis.id));
  const evidenceEvents = Array.from(byKey.values())
    .flatMap((accumulator) => accumulator.events)
    .filter((event) => includedIds.has(event.hypothesisId))
    .sort(compareEvidenceEvents);

  return { hypotheses, evidenceEvents };
}

function buildAssociationExplanationBeliefs(
  hypotheses: AssociationHypothesis[],
  evidenceEvents: AssociationEvidenceEvent[]
): AssociationExplanationBelief[] {
  return hypotheses.map((hypothesis) => {
    const events = evidenceEvents.filter((event) => event.hypothesisId === hypothesis.id);
    return {
      hypothesisId: hypothesis.id,
      source: hypothesis.source,
      target: hypothesis.target,
      associationCredibility: hypothesis.credibility,
      associationCounters: {
        supportCount: hypothesis.supportCount,
        weakenCount: hypothesis.weakenCount,
        defeatCount: hypothesis.defeatCount,
        neutralCount: hypothesis.neutralCount,
        distinctRunCount: hypothesis.distinctRunCount,
        distinctLedgerCount: hypothesis.distinctLedgerCount,
        scopeWarnings: hypothesis.scopeWarnings,
        policyWarnings: hypothesis.policyWarnings,
      },
      explanation: buildExplanationGraphReport({
        hypothesis: {
          id: hypothesis.id,
          label: `${hypothesis.source} ${hypothesis.relation} ${hypothesis.target}`,
          source: hypothesis.source,
          relation: hypothesis.relation,
          target: hypothesis.target,
          scope: hypothesis.scope,
        },
        prior: { notH: 0.75, h: 0.25 },
        factors: associationExplanationFactors(hypothesis, events),
      }),
    };
  });
}

function associationExplanationFactors(
  hypothesis: AssociationHypothesis,
  evidenceEvents: AssociationEvidenceEvent[]
): ExplanationFactorInput[] {
  return [
    scopeQualityFactor(hypothesis),
    distinctRunFactor(hypothesis),
    distinctLedgerFactor(hypothesis),
    ...evidenceEvents.flatMap((event, index) => evidenceEventFactors(event, index)),
  ];
}

function scopeQualityFactor(hypothesis: AssociationHypothesis): ExplanationFactorInput {
  const observedState = hypothesis.scopeWarnings.length === 0 ? 'source_scope' : 'warning_present';
  return {
    factorId: 'scope_quality',
    label: 'hypothesis source scope is durable enough to reuse',
    observedState,
    states: ['source_scope', 'warning_present'],
    matrix: {
      notH: [0.75, 1],
      h: [1, 0.55],
    },
  };
}

function distinctRunFactor(hypothesis: AssociationHypothesis): ExplanationFactorInput {
  const observedState = hypothesis.distinctRunCount >= 2 ? 'varied_runs' : 'single_run';
  return {
    factorId: 'distinct_run_support',
    label: 'support came from more than one telemetry run',
    observedState,
    states: ['single_run', 'varied_runs'],
    matrix: {
      notH: [1, 0.70],
      h: [0.80, 1],
    },
  };
}

function distinctLedgerFactor(hypothesis: AssociationHypothesis): ExplanationFactorInput {
  const observedState = hypothesis.distinctLedgerCount >= 2 ? 'varied_ledgers' : 'single_ledger';
  return {
    factorId: 'distinct_ledger_support',
    label: 'support came from more than one ledger',
    observedState,
    states: ['single_ledger', 'varied_ledgers'],
    matrix: {
      notH: [1, 0.70],
      h: [0.85, 1],
    },
  };
}

function evidenceEventFactors(event: AssociationEvidenceEvent, index: number): ExplanationFactorInput[] {
  const ordinal = String(index + 1).padStart(2, '0');
  return [
    evidenceEffectFactor(event, ordinal),
    evidenceFreshnessFactor(event, ordinal),
    evidenceDefeaterFactor(event, ordinal),
    evidenceRivalFactor(event, ordinal),
  ];
}

function evidenceEffectFactor(event: AssociationEvidenceEvent, ordinal: string): ExplanationFactorInput {
  if (event.credibilityEffect === 'supports') {
    const supportStrength = event.evidenceIndependence === 'independent' ? 0.40 : 0.65;
    return {
      factorId: `evidence_supports_${ordinal}`,
      label: 'evidence event supports the predicted consequence',
      observedState: 'present',
      states: ['absent', 'present'],
      matrix: {
        notH: [1, supportStrength],
        h: [0.40, 1],
      },
    };
  }

  if (event.credibilityEffect === 'weakens') {
    return {
      factorId: `evidence_weakens_${ordinal}`,
      label: 'evidence event weakens the hypothesis',
      observedState: 'present',
      states: ['absent', 'present'],
      matrix: {
        notH: [1, 1],
        h: [1, 0.35],
      },
    };
  }

  if (event.credibilityEffect === 'defeats') {
    return {
      factorId: `evidence_defeats_${ordinal}`,
      label: 'evidence event defeats the hypothesis',
      observedState: 'present',
      states: ['absent', 'present'],
      matrix: {
        notH: [1, 1],
        h: [1, 0.10],
      },
    };
  }

  return {
    factorId: `evidence_neutral_${ordinal}`,
    label: 'evidence event is neutral or incomparable',
    observedState: 'present',
    states: ['absent', 'present'],
    matrix: {
      notH: [1, 1],
      h: [1, 1],
    },
  };
}

function evidenceFreshnessFactor(event: AssociationEvidenceEvent, ordinal: string): ExplanationFactorInput {
  const observedState = event.consequenceFreshness === 'fresh_after_source' ? 'fresh' : 'stale_or_missing';
  return {
    factorId: `evidence_freshness_${ordinal}`,
    label: 'evidence consequence was fresh after source activation',
    observedState,
    states: ['stale_or_missing', 'fresh'],
    matrix: {
      notH: [1, 0.80],
      h: [0.50, 1],
    },
  };
}

function evidenceDefeaterFactor(event: AssociationEvidenceEvent, ordinal: string): ExplanationFactorInput {
  const observedState = event.defeatersPresent.length === 0 ? 'absent' : 'present';
  return {
    factorId: `evidence_defeater_${ordinal}`,
    label: 'known defeaters are absent for this evidence event',
    observedState,
    states: ['absent', 'present'],
    matrix: {
      notH: [0.80, 1],
      h: [1, 0.25],
    },
  };
}

function evidenceRivalFactor(event: AssociationEvidenceEvent, ordinal: string): ExplanationFactorInput {
  const observedState = event.rivalExplanations.length === 0 ? 'absent' : 'present';
  return {
    factorId: `evidence_rival_${ordinal}`,
    label: 'stronger rival explanations are absent for this evidence event',
    observedState,
    states: ['absent', 'present'],
    matrix: {
      notH: [0.85, 1],
      h: [1, 0.70],
    },
  };
}

function supportEvidenceEvent(input: {
  sample: RunSample;
  source: SourceActivation;
  verifier: VerifierObservation;
  priorSupportCount: number;
  priorActivatedSources: Set<string>;
}): AssociationEvidenceEvent {
  const otherSources = uniqueSources(
    sourceActivations(input.sample.ast.actions)
      .filter((source) => source.actionIndex < input.verifier.actionIndex && source.source !== input.source.source)
  );
  const policyWarnings = policyWarningsForRun(input.sample.ast.actions);
  const novelty: AssociationEvidenceNovelty = input.priorActivatedSources.has(input.source.resourceRef)
    ? 'repeated_source_scope'
    : 'new_source_scope';

  return {
    evidenceEventId: evidenceEventId(
      input.source.source,
      input.verifier.command,
      input.sample.runId,
      input.sample.dbPath,
      'supports'
    ),
    hypothesisId: hypothesisId(input.source.source, input.verifier.command),
    runId: input.sample.runId,
    dbPath: input.sample.dbPath,
    observedConsequence: 'fresh passing verifier after source mutation',
    consequenceFreshness: 'fresh_after_source',
    sourceWasActivated: true,
    activatedSources: [input.source.resourceRef],
    rivalExplanations: otherSources.map((source) => `other_source_scope_also_activated:${source.source}`),
    defeatersPresent: [],
    policyWarnings,
    evidenceIndependence: input.priorSupportCount === 0 || novelty === 'new_source_scope'
      ? 'independent'
      : 'partially_redundant',
    evidenceNovelty: novelty,
    credibilityEffect: 'supports',
    polyaPattern: input.priorSupportCount === 0
      ? 'verifying_consequence'
      : 'successive_varied_consequence',
    rationale: 'The source scope was mutated before the named verifier produced fresh passing evidence.',
    provenanceRefs: [
      input.source.action.provenance.evidenceRef,
      input.verifier.action.provenance.evidenceRef,
    ],
  };
}

function weakeningEvidenceEvent(input: {
  sample: RunSample;
  source: SourceActivation;
  target: string;
  verifier: VerifierObservation | null;
  reason: string;
}): AssociationEvidenceEvent {
  const policyWarnings = policyWarningsForRun(input.sample.ast.actions);
  return {
    evidenceEventId: evidenceEventId(
      input.source.source,
      input.target,
      input.sample.runId,
      input.sample.dbPath,
      'weakens'
    ),
    hypothesisId: hypothesisId(input.source.source, input.target),
    runId: input.sample.runId,
    dbPath: input.sample.dbPath,
    observedConsequence: input.verifier ? 'target verifier failed after source mutation' : null,
    consequenceFreshness: input.verifier ? 'fresh_after_source' : 'not_observed',
    sourceWasActivated: true,
    activatedSources: [input.source.resourceRef],
    rivalExplanations: [],
    defeatersPresent: [input.reason],
    policyWarnings,
    evidenceIndependence: 'unknown',
    evidenceNovelty: 'unknown',
    credibilityEffect: 'weakens',
    polyaPattern: input.verifier ? 'conflicting_conjecture_present' : 'possible_ground_defeated',
    rationale: input.reason,
    provenanceRefs: [
      input.source.action.provenance.evidenceRef,
      ...(input.verifier ? [input.verifier.action.provenance.evidenceRef] : []),
    ],
  };
}

function ensureAccumulator(
  byKey: Map<string, HypothesisAccumulator>,
  source: string,
  target: string
): HypothesisAccumulator {
  const key = hypothesisKey(source, target);
  const existing = byKey.get(key);
  if (existing) return existing;

  const created: HypothesisAccumulator = {
    source,
    target,
    events: [],
    supportRuns: new Set(),
    supportLedgers: new Set(),
    activatedSources: new Set(),
    scopeWarnings: new Set(sourceScopeWarnings(source)),
    policyWarnings: new Set(),
  };
  byKey.set(key, created);
  return created;
}

function toHypothesis(accumulator: HypothesisAccumulator): AssociationHypothesis {
  const supportCount = accumulator.events.filter((event) => event.credibilityEffect === 'supports').length;
  const weakenCount = accumulator.events.filter((event) => event.credibilityEffect === 'weakens').length;
  const defeatCount = accumulator.events.filter((event) => event.credibilityEffect === 'defeats').length;
  const neutralCount = accumulator.events.filter((event) => event.credibilityEffect === 'neutral').length;
  const scopeWarnings = Array.from(accumulator.scopeWarnings).sort();
  const credibility = credibilityFor({
    supportCount,
    weakenCount,
    defeatCount,
    distinctRunCount: accumulator.supportRuns.size,
    distinctLedgerCount: accumulator.supportLedgers.size,
    scopeWarnings,
  });

  return {
    id: hypothesisId(accumulator.source, accumulator.target),
    source: accumulator.source,
    relation: 'verified_by',
    target: accumulator.target,
    scope: accumulator.source,
    predictedConsequences: [
      'fresh passing verifier after source mutation',
    ],
    prerequisites: [
      'source scope is activated before the verifier',
      'verifier command runs after the mutation',
      'evidence is fresh relative to the source action',
    ],
    knownDefeaters: [
      'target verifier fails after source mutation',
      'run stops after source mutation without a later verifier',
      'stronger rival source explains the verifier pass',
      'evidence repeats the same run or same source path without novelty',
    ],
    credibility,
    supportCount,
    weakenCount,
    defeatCount,
    neutralCount,
    distinctRunCount: accumulator.supportRuns.size,
    distinctLedgerCount: accumulator.supportLedgers.size,
    activatedSourceExamples: Array.from(accumulator.activatedSources).sort().slice(0, 10),
    scopeWarnings,
    policyWarnings: Array.from(accumulator.policyWarnings).sort(),
    evidenceEventIds: accumulator.events.map((event) => event.evidenceEventId).sort(),
    recommendedNextExperiment: `After the next change under ${accumulator.source}, run ${accumulator.target} and record whether it passes fresh.`,
  };
}

function credibilityFor(input: {
  supportCount: number;
  weakenCount: number;
  defeatCount: number;
  distinctRunCount: number;
  distinctLedgerCount: number;
  scopeWarnings: string[];
}): AssociationCredibility {
  if (input.defeatCount > 0) return 'defeated';
  if (input.weakenCount > input.supportCount) return 'weakened';
  if (
    input.supportCount >= 2
    && input.distinctRunCount >= 2
    && input.distinctLedgerCount >= 2
    && input.weakenCount === 0
    && input.scopeWarnings.length === 0
  ) {
    return 'credible';
  }
  if (input.supportCount > 0 && input.weakenCount === 0) return 'plausible';
  if (input.supportCount > input.weakenCount) return 'plausible';
  if (input.weakenCount > 0) return 'weakened';
  return 'conjectural';
}

function sourceActivations(actions: NormalizedAction[]): SourceActivation[] {
  const activations: SourceActivation[] = [];
  actions.forEach((action, actionIndex) => {
    if (!isEditAction(action)) return;
    for (const resource of action.resources.written) {
      if (resource.type !== 'local_file') continue;
      const ref = normalizeResourceRef(resource, action);
      activations.push({
        source: sourceScopeForPath(ref),
        resourceRef: ref,
        action,
        actionIndex,
      });
    }
  });
  return activations;
}

function verifierObservations(actions: NormalizedAction[]): VerifierObservation[] {
  const observations: VerifierObservation[] = [];
  actions.forEach((action, actionIndex) => {
    if (!isTestAction(action) || !action.command?.argvSummary) return;
    observations.push({
      command: action.command.argvSummary,
      action,
      actionIndex,
    });
  });
  return observations;
}

function uniqueSources(sources: SourceActivation[]): SourceActivation[] {
  const byKey = new Map<string, SourceActivation>();
  for (const source of sources) {
    const key = `${source.source}\0${source.resourceRef}`;
    if (!byKey.has(key)) byKey.set(key, source);
  }
  return Array.from(byKey.values()).sort((left, right) => {
    return left.source.localeCompare(right.source) || left.resourceRef.localeCompare(right.resourceRef);
  });
}

function normalizeResourceRef(resource: ResourceRef, action: NormalizedAction): string {
  const cwd = action.provenance.cwd.replaceAll('\\', '/').replace(/\/+$/, '');
  let ref = resource.ref.replaceAll('\\', '/');
  if (cwd && ref.startsWith(`${cwd}/`)) ref = ref.slice(cwd.length + 1);
  ref = ref.replace(/^\.\//, '');
  ref = ref.replace(/\/+/g, '/');
  return ref;
}

function sourceScopeForPath(path: string): string {
  const clean = path.replace(/^\/+/, '');
  let parts = clean.split('/').filter(Boolean);
  const anchoredParts = anchorProjectPathParts(parts);
  if (anchoredParts.length > 0) parts = anchoredParts;
  if (parts.length === 0) return path;
  if (parts[0] === 'private' && parts[1] === 'tmp') return 'private/tmp/**';
  if (parts[0] === 'tmp') return 'tmp/**';
  if (parts[0] === 'tests' || parts[0] === '__tests__') return `${parts[0]}/**`;
  if (parts[0] === '.agent-learning') return '.agent-learning/**';
  if (parts.length >= 2) return `${parts[0]}/${parts[1]}/**`;
  return parts[0];
}

function anchorProjectPathParts(parts: string[]): string[] {
  const rootMarkers = new Set([
    '__tests__',
    'app',
    'dbt',
    'jobs',
    'lib',
    'models',
    'notebooks',
    'packages',
    'scripts',
    'sql',
    'src',
    'tests',
  ]);
  const markerIndex = parts.findIndex((part) => rootMarkers.has(part));
  return markerIndex === -1 ? parts : parts.slice(markerIndex);
}

function sourceScopeWarnings(source: string): string[] {
  const warnings: string[] = [];
  if (source === 'tests/**' || source === '__tests__/**') warnings.push('source_scope_is_test_tree');
  if (source === 'private/tmp/**' || source === 'tmp/**') warnings.push('source_scope_is_transient');
  if (source === '.agent-learning/**') warnings.push('source_scope_is_telemetry_storage');
  return warnings;
}

function policyWarningsForRun(actions: NormalizedAction[]): string[] {
  const warnings: string[] = [];
  if (actions.some(hasExternalSideEffects)) warnings.push('run_contains_external_side_effects');
  if (hasUnsafeWrite(actions)) warnings.push('run_contains_unsafe_write');
  return warnings;
}

function actionSucceeded(action: NormalizedAction): boolean {
  return action.status === 'succeeded' || action.command?.exitCode === 0;
}

function actionFailed(action: NormalizedAction): boolean {
  return action.status === 'failed' || (
    typeof action.command?.exitCode === 'number' && action.command.exitCode !== 0
  );
}

function hypothesisKey(source: string, target: string): string {
  return `${source}\0${target}`;
}

function runKey(sample: RunSample): string {
  return `${sample.dbPath}\0${sample.runId}`;
}

function hypothesisId(source: string, target: string): string {
  return `hyp-${slug(source)}-${slug(target)}`;
}

function evidenceEventId(source: string, target: string, runId: string, dbPath: string, effect: string): string {
  return `ev-${slug(effect)}-${slug(runId)}-${slug(dbPath)}-${slug(source)}-${slug(target)}`;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'unknown';
}

function compareHypotheses(left: AssociationHypothesis, right: AssociationHypothesis): number {
  return credibilityRank(right.credibility) - credibilityRank(left.credibility)
    || right.supportCount - left.supportCount
    || right.distinctLedgerCount - left.distinctLedgerCount
    || left.scopeWarnings.length - right.scopeWarnings.length
    || left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target);
}

function credibilityRank(value: AssociationCredibility): number {
  if (value === 'credible') return 4;
  if (value === 'plausible') return 3;
  if (value === 'conjectural') return 2;
  if (value === 'weakened') return 1;
  return 0;
}

function compareEvidenceEvents(left: AssociationEvidenceEvent, right: AssociationEvidenceEvent): number {
  return left.hypothesisId.localeCompare(right.hypothesisId)
    || left.runId.localeCompare(right.runId)
    || left.evidenceEventId.localeCompare(right.evidenceEventId);
}

function buildSummaryLines(input: {
  ledgers: number;
  runCount: number;
  hypothesisCount: number;
  evidenceEventCount: number;
  credibleCount: number;
  skippedCount: number;
}): string[] {
  return [
    `Scanned ${input.ledgers} readable ledgers and ${input.runCount} telemetry runs.`,
    `Discovered ${input.hypothesisCount} association hypotheses from ${input.evidenceEventCount} evidence events.`,
    `Credible hypotheses: ${input.credibleCount}.`,
    `Skipped ledgers: ${input.skippedCount}.`,
    'Dry run only: no association hypotheses or evidence events were persisted.',
  ];
}

function limitations(samples: RunSample[], skippedDatabases: SkippedDatabase[]): string[] {
  const values = [
    'association learning is read-only and does not persist hypotheses, evidence events, policies, or context packs',
    'credibility is provisional and must be interpreted with defeaters, rival explanations, chronology, and scope warnings',
    'source scopes are deterministic path generalizations and may need later domain-specific refinement',
    'verifier credibility is separated from policy safety; a useful verifier can still appear in a risky run',
    'explanation belief factor weights are explicit v1 defaults and must be validated against future intervention outcomes',
  ];
  if (samples.length === 0) values.push('no telemetry runs were available for association learning');
  if (skippedDatabases.length > 0) values.push('one or more discovered ledgers could not be scanned');
  return values;
}
