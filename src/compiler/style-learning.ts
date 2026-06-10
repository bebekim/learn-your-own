import type { LearningKernel } from '../ledger.ts';
import { compileTelemetryRunAst } from './parser.ts';
import {
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isTestAction,
} from './semantics.ts';
import type { RunTelemetryAst } from './syntax.ts';
import {
  buildWorkflowStyleReport,
  type WorkflowStyleClassification,
  type WorkflowStyleReport,
} from './workflow-style.ts';

export const STYLE_LEARNING_VERSION = 'lyo/style-learning/v1';

export type StyleLearningCandidateKind =
  | 'procedure'
  | 'critic'
  | 'verifier'
  | 'context_pack'
  | 'policy'
  | 'instrumentation';

export interface StyleLearningCandidate {
  id: string;
  kind: StyleLearningCandidateKind;
  title: string;
  rationale: string;
  confidence: 'low' | 'medium' | 'high';
  support: number;
  evidenceRunIds: string[];
}

export interface StyleLearningReport {
  learningVersion: typeof STYLE_LEARNING_VERSION;
  mode: 'learn';
  runCount: number;
  analyzedRunIds: string[];
  modelUsage: {
    totalModelCalls: number;
    totalTokens: number;
    estimatedCost: number;
    byModel: Record<string, number>;
    byLane: Record<string, number>;
    runsWithModelCalls: number;
    runsMissingTokenTelemetry: number;
  };
  styleDistribution: {
    promptDriven: number;
    manualOrchestrated: number;
    loopAssisted: number;
    loopDrivenCandidate: number;
    insufficientEvidence: number;
  };
  aggregateMetrics: {
    totalHumanPrompts: number;
    totalActions: number;
    totalEdits: number;
    totalVerifiers: number;
    actionsPerHumanPrompt: number | null;
    verifierDensity: number | null;
    runsWithEdits: number;
    runsWithVerifiedEdits: number;
    editVerificationRate: number | null;
    runsWithDebugging: number;
    runsStoppedAfterEditWithoutVerification: number;
    stoppedAfterEditWithoutVerificationRate: number | null;
    unsafeWriteRuns: number;
    loopArtifactTouchRuns: number;
  };
  learningCandidates: StyleLearningCandidate[];
  limitations: string[];
}

interface ModelUsageRow {
  runId: string | null;
  model: string;
  modelLane: string;
  totalTokens: number | null;
  estimatedCost: number | null;
}

interface RunLearningSample {
  ast: RunTelemetryAst;
  style: WorkflowStyleReport;
  hasEdits: boolean;
  verifiedCompletion: boolean;
  debugging: boolean;
  stoppedAfterEditWithoutVerification: boolean;
  unsafeWrite: boolean;
}

export function buildStyleLearningReport(kernel: LearningKernel): StyleLearningReport {
  const runIds = listTelemetryRunIds(kernel);
  const samples = runIds.map((runId) => {
    const ast = compileTelemetryRunAst(kernel, { runId });
    return {
      ast,
      style: buildWorkflowStyleReport(kernel, ast),
      hasEdits: ast.actions.some(isEditAction),
      verifiedCompletion: hasVerifiedCompletion(ast.actions),
      debugging: hasDebugging(ast.actions),
      stoppedAfterEditWithoutVerification: hasStoppedAfterEditWithoutVerification(ast.actions),
      unsafeWrite: hasUnsafeWrite(ast.actions),
    };
  });
  const modelUsage = buildModelUsage(kernel, runIds);
  const aggregateMetrics = buildAggregateMetrics(samples);
  const styleDistribution = buildStyleDistribution(samples);

  return {
    learningVersion: STYLE_LEARNING_VERSION,
    mode: 'learn',
    runCount: samples.length,
    analyzedRunIds: samples.map((sample) => sample.ast.runId),
    modelUsage,
    styleDistribution,
    aggregateMetrics,
    learningCandidates: learningCandidates(samples, aggregateMetrics, styleDistribution, modelUsage),
    limitations: limitations(samples, modelUsage),
  };
}

function listTelemetryRunIds(kernel: LearningKernel): string[] {
  const rows = kernel.db.prepare(`
    select distinct coalesce(turn_id, session_id) as runId
    from hook_events
    where coalesce(turn_id, session_id) is not null
    order by runId
  `).all() as Array<{ runId: string | null }>;
  return rows
    .map((row) => row.runId)
    .filter((runId): runId is string => typeof runId === 'string' && runId.trim() !== '');
}

function buildModelUsage(
  kernel: LearningKernel,
  runIds: string[]
): StyleLearningReport['modelUsage'] {
  const runIdSet = new Set(runIds);
  const rows = kernel.db.prepare(`
    select run_id as runId, model, model_lane as modelLane,
      total_tokens as totalTokens, estimated_cost as estimatedCost
    from model_calls
  `).all() as unknown as ModelUsageRow[];
  const byModel: Record<string, number> = {};
  const byLane: Record<string, number> = {};
  const runsWithModelCalls = new Set<string>();
  let totalModelCalls = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  let runsMissingTokenTelemetry = 0;

  for (const row of rows) {
    if (row.runId && runIdSet.size > 0 && !runIdSet.has(row.runId)) continue;
    totalModelCalls += 1;
    if (row.runId) runsWithModelCalls.add(row.runId);
    byModel[row.model] = (byModel[row.model] ?? 0) + 1;
    byLane[row.modelLane] = (byLane[row.modelLane] ?? 0) + 1;
    if (typeof row.totalTokens === 'number') totalTokens += row.totalTokens;
    else runsMissingTokenTelemetry += row.runId ? 1 : 0;
    if (typeof row.estimatedCost === 'number') estimatedCost += row.estimatedCost;
  }

  return {
    totalModelCalls,
    totalTokens,
    estimatedCost: round(estimatedCost),
    byModel: sortRecord(byModel),
    byLane: sortRecord(byLane),
    runsWithModelCalls: runsWithModelCalls.size,
    runsMissingTokenTelemetry,
  };
}

function buildStyleDistribution(
  samples: RunLearningSample[]
): StyleLearningReport['styleDistribution'] {
  const distribution = {
    promptDriven: 0,
    manualOrchestrated: 0,
    loopAssisted: 0,
    loopDrivenCandidate: 0,
    insufficientEvidence: 0,
  };

  for (const sample of samples) {
    if (sample.style.classification === 'prompt_driven') distribution.promptDriven += 1;
    else if (sample.style.classification === 'manual_orchestrated') distribution.manualOrchestrated += 1;
    else if (sample.style.classification === 'loop_assisted') distribution.loopAssisted += 1;
    else if (sample.style.classification === 'loop_driven_candidate') distribution.loopDrivenCandidate += 1;
    else distribution.insufficientEvidence += 1;
  }

  return distribution;
}

function buildAggregateMetrics(samples: RunLearningSample[]): StyleLearningReport['aggregateMetrics'] {
  const totalHumanPrompts = sum(samples, (sample) => sample.style.metrics.humanPromptCount);
  const totalActions = sum(samples, (sample) => sample.style.metrics.actionCount);
  const totalEdits = sum(samples, (sample) => sample.style.metrics.mutationActions);
  const totalVerifiers = sum(samples, (sample) => sample.style.metrics.verifierActions);
  const runsWithEdits = samples.filter((sample) => sample.hasEdits).length;
  const runsWithVerifiedEdits = samples.filter((sample) => sample.hasEdits && sample.verifiedCompletion).length;
  const runsStoppedAfterEditWithoutVerification = samples.filter((sample) => {
    return sample.stoppedAfterEditWithoutVerification;
  }).length;

  return {
    totalHumanPrompts,
    totalActions,
    totalEdits,
    totalVerifiers,
    actionsPerHumanPrompt: ratio(totalActions, totalHumanPrompts),
    verifierDensity: ratio(totalVerifiers, totalEdits),
    runsWithEdits,
    runsWithVerifiedEdits,
    editVerificationRate: ratio(runsWithVerifiedEdits, runsWithEdits),
    runsWithDebugging: samples.filter((sample) => sample.debugging).length,
    runsStoppedAfterEditWithoutVerification,
    stoppedAfterEditWithoutVerificationRate: ratio(runsStoppedAfterEditWithoutVerification, runsWithEdits),
    unsafeWriteRuns: samples.filter((sample) => sample.unsafeWrite).length,
    loopArtifactTouchRuns: samples.filter((sample) => sample.style.metrics.loopArtifactTouches > 0).length,
  };
}

function learningCandidates(
  samples: RunLearningSample[],
  metrics: StyleLearningReport['aggregateMetrics'],
  styleDistribution: StyleLearningReport['styleDistribution'],
  modelUsage: StyleLearningReport['modelUsage']
): StyleLearningCandidate[] {
  const candidates: StyleLearningCandidate[] = [];

  if ((metrics.editVerificationRate ?? 0) >= 0.5 && metrics.runsWithVerifiedEdits > 0) {
    candidates.push({
      id: 'preserve-verifier-debug-loop',
      kind: 'procedure',
      title: 'Preserve the edit/verifier/debug loop as a reusable procedure',
      rationale: 'Historical edit runs often reached a successful verifier after local mutations.',
      confidence: metrics.editVerificationRate !== null && metrics.editVerificationRate >= 0.75 ? 'high' : 'medium',
      support: metrics.runsWithVerifiedEdits,
      evidenceRunIds: runIds(samples, (sample) => sample.hasEdits && sample.verifiedCompletion),
    });
  }

  if (metrics.runsStoppedAfterEditWithoutVerification > 0) {
    candidates.push({
      id: 'critic-require-verifier-after-edit',
      kind: 'critic',
      title: 'Warn when a run edits local files without later verification',
      rationale: 'Some runs stopped after local mutation without a later successful verifier.',
      confidence: (metrics.stoppedAfterEditWithoutVerificationRate ?? 0) >= 0.35 ? 'high' : 'medium',
      support: metrics.runsStoppedAfterEditWithoutVerification,
      evidenceRunIds: runIds(samples, (sample) => sample.stoppedAfterEditWithoutVerification),
    });
  }

  const manualStyleRuns = styleDistribution.promptDriven + styleDistribution.manualOrchestrated;
  if (manualStyleRuns > 0) {
    candidates.push({
      id: 'convert-repeated-prompts-to-loop',
      kind: 'procedure',
      title: 'Convert repeated manual orchestration into explicit agent loops',
      rationale: 'Prompt-driven and manually orchestrated runs indicate human steering or continuation that could become explicit loop prompts, scripts, or review gates.',
      confidence: manualStyleRuns >= 3 ? 'high' : 'medium',
      support: manualStyleRuns,
      evidenceRunIds: runIds(samples, (sample) => {
        return sample.style.classification === 'prompt_driven'
          || sample.style.classification === 'manual_orchestrated';
      }),
    });
  }

  if (styleDistribution.loopDrivenCandidate > 0 || styleDistribution.loopAssisted > 0) {
    candidates.push({
      id: 'context-pack-loop-artifacts',
      kind: 'context_pack',
      title: 'Carry loop and verifier habits forward as context',
      rationale: 'Telemetry already shows loop-assisted or loop-driven sessions that future runs can reuse as examples.',
      confidence: styleDistribution.loopDrivenCandidate > 0 ? 'high' : 'medium',
      support: styleDistribution.loopDrivenCandidate + styleDistribution.loopAssisted,
      evidenceRunIds: runIds(samples, (sample) => {
        return sample.style.classification === 'loop_driven_candidate'
          || sample.style.classification === 'loop_assisted';
      }),
    });
  }

  if (modelUsage.totalModelCalls === 0 || modelUsage.runsMissingTokenTelemetry > 0) {
    candidates.push({
      id: 'instrument-model-token-usage',
      kind: 'instrumentation',
      title: 'Improve LLM usage telemetry before optimizing token economics',
      rationale: 'Learning token efficiency requires complete model call and token accounting.',
      confidence: 'high',
      support: modelUsage.runsMissingTokenTelemetry || samples.length,
      evidenceRunIds: samples.map((sample) => sample.ast.runId),
    });
  }

  return candidates;
}

function limitations(
  samples: RunLearningSample[],
  modelUsage: StyleLearningReport['modelUsage']
): string[] {
  const values = [
    'learning report is read-only and does not persist procedures, critics, policies, or context packs',
    'workflow style is inferred from available hook telemetry unless explicit lineage events are present',
    'approval and continuation acceptance are not captured reliably enough to distinguish every manual yes from autonomous loop execution',
  ];

  if (samples.length === 0) values.push('no telemetry runs were available for learning');
  if (modelUsage.totalModelCalls === 0) values.push('no model call telemetry was available');
  if (modelUsage.runsMissingTokenTelemetry > 0) values.push('one or more model calls are missing token counts');

  return values;
}

function runIds(
  samples: RunLearningSample[],
  predicate: (sample: RunLearningSample) => boolean
): string[] {
  return samples
    .filter(predicate)
    .map((sample) => sample.ast.runId)
    .sort();
}

function sum(samples: RunLearningSample[], select: (sample: RunLearningSample) => number): number {
  return samples.reduce((total, sample) => total + select(sample), 0);
}

function ratio(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return round(numerator / denominator);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}
