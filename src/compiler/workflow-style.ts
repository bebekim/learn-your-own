import type { LearningKernel } from '../ledger.ts';
import {
  hasStoppedAfterEditWithoutVerification,
  isEditAction,
  isTestAction,
} from './semantics.ts';
import type { NormalizedAction, ResourceRef, RunTelemetryAst } from './syntax.ts';

export const WORKFLOW_STYLE_VERSION = 'lyo/workflow-style/v1';

export type WorkflowStyleClassification =
  | 'prompt_driven'
  | 'manual_orchestrated'
  | 'loop_assisted'
  | 'loop_driven_candidate'
  | 'insufficient_evidence';

export interface WorkflowStyleReport {
  styleVersion: typeof WORKFLOW_STYLE_VERSION;
  runId: string;
  classification: WorkflowStyleClassification;
  confidence: 'low' | 'medium' | 'high';
  lineageMode: 'inferred_only' | 'explicit';
  scores: {
    promptDriven: number;
    manualOrchestration: number;
    loopDriven: number;
    verifierDiscipline: number;
    workflowInfrastructure: number;
  };
  metrics: {
    humanPromptCount: number;
    actionCount: number;
    actionsPerHumanPrompt: number | null;
    maxActionsBetweenPrompts: number;
    verifierActions: number;
    mutationActions: number;
    verifierDensity: number | null;
    loopArtifactTouches: number;
    specOrDocsTouches: number;
    testOrValidatorTouches: number;
    modelCallCount: number;
  };
  evidence: string[];
  missingSignals: string[];
}

interface CountRow {
  count: number;
}

export function buildWorkflowStyleReport(
  kernel: LearningKernel,
  ast: RunTelemetryAst
): WorkflowStyleReport {
  const humanPromptCount = countHumanPrompts(kernel, ast.runId);
  const modelCallCount = countModelCalls(kernel, ast.runId);
  const nonBoundaryActions = ast.actions.filter((action) => action.eventKind !== 'boundary');
  const actionCount = nonBoundaryActions.length;
  const verifierActions = ast.actions.filter(isTestAction).length;
  const mutationActions = ast.actions.filter(isEditAction).length;
  const actionsPerHumanPrompt = humanPromptCount > 0
    ? round(actionCount / humanPromptCount)
    : null;
  const maxActionsBetweenPrompts = maxActionsBetweenPromptBoundaries(ast.actions);
  const verifierDensity = mutationActions > 0
    ? round(verifierActions / mutationActions)
    : null;
  const touchedRefs = touchedResourceRefs(ast.actions);
  const loopArtifactTouches = touchedRefs.filter(isLoopArtifactRef).length;
  const specOrDocsTouches = touchedRefs.filter(isSpecOrDocsRef).length;
  const testOrValidatorTouches = touchedRefs.filter(isTestOrValidatorRef).length;
  const stoppedAfterEditWithoutVerification = hasStoppedAfterEditWithoutVerification(ast.actions);

  const scores = {
    promptDriven: promptDrivenScore({
      humanPromptCount,
      actionCount,
      actionsPerHumanPrompt,
      maxActionsBetweenPrompts,
      stoppedAfterEditWithoutVerification,
    }),
    manualOrchestration: manualOrchestrationScore({
      humanPromptCount,
      actionCount,
      actionsPerHumanPrompt,
      maxActionsBetweenPrompts,
      verifierActions,
      mutationActions,
      loopArtifactTouches,
      modelCallCount,
    }),
    loopDriven: loopDrivenScore({
      humanPromptCount,
      actionCount,
      actionsPerHumanPrompt,
      maxActionsBetweenPrompts,
      verifierActions,
      mutationActions,
      loopArtifactTouches,
      modelCallCount,
    }),
    verifierDiscipline: verifierDisciplineScore({
      verifierActions,
      mutationActions,
      verifierDensity,
      stoppedAfterEditWithoutVerification,
      testOrValidatorTouches,
    }),
    workflowInfrastructure: workflowInfrastructureScore({
      loopArtifactTouches,
      specOrDocsTouches,
      testOrValidatorTouches,
      modelCallCount,
    }),
  };

  const classification = classifyWorkflowStyle({
    actionCount,
    humanPromptCount,
    loopDriven: scores.loopDriven,
    manualOrchestration: scores.manualOrchestration,
    promptDriven: scores.promptDriven,
    workflowInfrastructure: scores.workflowInfrastructure,
    modelCallCount,
  });

  return {
    styleVersion: WORKFLOW_STYLE_VERSION,
    runId: ast.runId,
    classification,
    confidence: confidenceForClassification(classification, actionCount, humanPromptCount, scores),
    lineageMode: 'inferred_only',
    scores,
    metrics: {
      humanPromptCount,
      actionCount,
      actionsPerHumanPrompt,
      maxActionsBetweenPrompts,
      verifierActions,
      mutationActions,
      verifierDensity,
      loopArtifactTouches,
      specOrDocsTouches,
      testOrValidatorTouches,
      modelCallCount,
    },
    evidence: styleEvidence({
      classification,
      humanPromptCount,
      actionCount,
      actionsPerHumanPrompt,
      maxActionsBetweenPrompts,
      verifierActions,
      mutationActions,
      verifierDensity,
      loopArtifactTouches,
      specOrDocsTouches,
      testOrValidatorTouches,
      modelCallCount,
      stoppedAfterEditWithoutVerification,
    }),
    missingSignals: [
      'explicit task selection event',
      'loop prompt emission event',
      'child agent invocation lineage',
      'reviewer agent invocation lineage',
      'explicit approval or continuation decision event',
      'human review receipt',
    ],
  };
}

function countHumanPrompts(kernel: LearningKernel, runId: string): number {
  const row = kernel.db.prepare(`
    select count(*) as count
    from session_prompts
    where run_id = ?
      and prompt_role in ('user', 'human')
  `).get(runId) as CountRow | undefined;
  if (row && typeof row.count === 'number' && row.count > 0) return row.count;

  const eventRow = kernel.db.prepare(`
    select count(*) as count
    from hook_events
    where turn_id = ?
      and event_name = 'UserPromptSubmit'
  `).get(runId) as CountRow | undefined;
  return eventRow?.count ?? 0;
}

function countModelCalls(kernel: LearningKernel, runId: string): number {
  const row = kernel.db.prepare(`
    select count(*) as count
    from model_calls
    where run_id = ?
  `).get(runId) as CountRow | undefined;
  return row?.count ?? 0;
}

function maxActionsBetweenPromptBoundaries(actions: NormalizedAction[]): number {
  let current = 0;
  let max = 0;
  let sawPrompt = false;

  for (const action of actions) {
    if (isPromptBoundary(action)) {
      max = Math.max(max, current);
      current = 0;
      sawPrompt = true;
      continue;
    }

    if (action.eventKind !== 'boundary') current += 1;
  }

  max = Math.max(max, current);
  return sawPrompt ? max : actions.filter((action) => action.eventKind !== 'boundary').length;
}

function isPromptBoundary(action: NormalizedAction): boolean {
  return action.eventKind === 'boundary'
    && action.provenance.eventName === 'UserPromptSubmit';
}

function touchedResourceRefs(actions: NormalizedAction[]): string[] {
  const refs = actions.flatMap((action) => [
    ...action.resources.read,
    ...action.resources.written,
  ]).map(resourceLabel);
  return Array.from(new Set(refs)).sort();
}

function resourceLabel(resource: ResourceRef): string {
  return `${resource.type}:${resource.ref}`;
}

function isLoopArtifactRef(value: string): boolean {
  const ref = value.toLowerCase();
  return /(^|[/:])(agents\.md|agent_loop\.md)$/.test(ref)
    || ref.includes('/.codex/')
    || ref.includes('/.claude/')
    || ref.includes('/prompts/')
    || ref.includes('/spec/')
    || ref.includes('/issues/')
    || /(^|[/:])scripts\/[^/]*(agent|loop)[^/]*$/.test(ref);
}

function isSpecOrDocsRef(value: string): boolean {
  const ref = value.toLowerCase();
  return ref.includes('/docs/')
    || ref.includes('/spec/')
    || ref.includes('/issues/')
    || /(^|[/:])(readme|changelog|agents|agent_loop)(\.[a-z0-9]+)?$/.test(ref)
    || /\.md$/.test(ref);
}

function isTestOrValidatorRef(value: string): boolean {
  const ref = value.toLowerCase();
  return ref.includes('/test/')
    || ref.includes('/tests/')
    || ref.includes('/spec/')
    || /\.(test|spec)\.[a-z0-9]+$/.test(ref);
}

function promptDrivenScore(input: {
  humanPromptCount: number;
  actionCount: number;
  actionsPerHumanPrompt: number | null;
  maxActionsBetweenPrompts: number;
  stoppedAfterEditWithoutVerification: boolean;
}): number {
  if (input.actionCount === 0) return 0;

  let score = 0;
  if (input.humanPromptCount >= 3) score += 0.35;
  if (input.actionsPerHumanPrompt !== null && input.actionsPerHumanPrompt <= 3) score += 0.35;
  if (input.maxActionsBetweenPrompts <= 3) score += 0.15;
  if (input.stoppedAfterEditWithoutVerification) score += 0.15;
  return round(clamp(score));
}

function loopDrivenScore(input: {
  humanPromptCount: number;
  actionCount: number;
  actionsPerHumanPrompt: number | null;
  maxActionsBetweenPrompts: number;
  verifierActions: number;
  mutationActions: number;
  loopArtifactTouches: number;
  modelCallCount: number;
}): number {
  if (input.actionCount < 4) return 0;

  let score = 0;
  if (input.loopArtifactTouches > 0) score += 0.35;
  if (input.modelCallCount > input.humanPromptCount && input.modelCallCount > 1) score += 0.2;
  if (input.verifierActions > 0 && input.mutationActions > 0) score += 0.2;
  if (input.actionsPerHumanPrompt === null || input.actionsPerHumanPrompt >= 6) score += 0.15;
  if (input.maxActionsBetweenPrompts >= 6) score += 0.1;
  return round(clamp(score));
}

function manualOrchestrationScore(input: {
  humanPromptCount: number;
  actionCount: number;
  actionsPerHumanPrompt: number | null;
  maxActionsBetweenPrompts: number;
  verifierActions: number;
  mutationActions: number;
  loopArtifactTouches: number;
  modelCallCount: number;
}): number {
  if (input.actionCount < 3 || input.humanPromptCount === 0) return 0;

  let score = 0;
  if (input.actionsPerHumanPrompt !== null && input.actionsPerHumanPrompt >= 3) score += 0.3;
  if (input.maxActionsBetweenPrompts >= 3) score += 0.25;
  if (input.verifierActions > 0 || input.mutationActions > 0) score += 0.2;
  if (input.loopArtifactTouches === 0) {
    score += 0.15;
    if (input.modelCallCount <= input.humanPromptCount) score += 0.1;
  }
  return round(clamp(score));
}

function verifierDisciplineScore(input: {
  verifierActions: number;
  mutationActions: number;
  verifierDensity: number | null;
  stoppedAfterEditWithoutVerification: boolean;
  testOrValidatorTouches: number;
}): number {
  let score = 0;
  if (input.mutationActions === 0 && input.verifierActions > 0) score += 0.25;
  if (input.verifierDensity !== null && input.verifierDensity >= 1) score += 0.55;
  if (input.verifierDensity !== null && input.verifierDensity > 0 && input.verifierDensity < 1) score += 0.3;
  if (input.testOrValidatorTouches > 0) score += 0.2;
  if (input.stoppedAfterEditWithoutVerification) score -= 0.25;
  return round(clamp(score));
}

function workflowInfrastructureScore(input: {
  loopArtifactTouches: number;
  specOrDocsTouches: number;
  testOrValidatorTouches: number;
  modelCallCount: number;
}): number {
  let score = 0;
  if (input.loopArtifactTouches > 0) score += 0.4;
  if (input.specOrDocsTouches > 0) score += 0.25;
  if (input.testOrValidatorTouches > 0) score += 0.25;
  if (input.modelCallCount > 1) score += 0.1;
  return round(clamp(score));
}

function classifyWorkflowStyle(input: {
  actionCount: number;
  humanPromptCount: number;
  loopDriven: number;
  manualOrchestration: number;
  promptDriven: number;
  workflowInfrastructure: number;
  modelCallCount: number;
}): WorkflowStyleClassification {
  if (input.actionCount < 3 && input.humanPromptCount === 0) return 'insufficient_evidence';
  const hasExplicitLoopEvidence = input.workflowInfrastructure >= 0.4
    || (input.modelCallCount > input.humanPromptCount && input.modelCallCount > 1);
  if (
    hasExplicitLoopEvidence
    && input.loopDriven >= 0.65
    && input.loopDriven > input.promptDriven
    && input.loopDriven >= input.manualOrchestration
  ) return 'loop_driven_candidate';
  if (input.loopDriven >= 0.35 && input.workflowInfrastructure >= 0.25) return 'loop_assisted';
  if (
    input.promptDriven >= 0.55
    && input.promptDriven >= input.loopDriven
    && input.promptDriven >= input.manualOrchestration
  ) return 'prompt_driven';
  if (input.manualOrchestration >= 0.45) return 'manual_orchestrated';
  if (input.actionCount < 3) return 'insufficient_evidence';
  return input.humanPromptCount > 0 ? 'manual_orchestrated' : 'insufficient_evidence';
}

function confidenceForClassification(
  classification: WorkflowStyleClassification,
  actionCount: number,
  humanPromptCount: number,
  scores: WorkflowStyleReport['scores']
): 'low' | 'medium' | 'high' {
  if (classification === 'insufficient_evidence') return 'low';
  if (classification === 'manual_orchestrated') {
    return actionCount >= 6 && humanPromptCount > 0 ? 'high' : 'medium';
  }
  if (actionCount >= 6 && humanPromptCount > 0 && Math.abs(scores.loopDriven - scores.promptDriven) >= 0.25) {
    return 'high';
  }
  return 'medium';
}

function styleEvidence(input: {
  classification: WorkflowStyleClassification;
  humanPromptCount: number;
  actionCount: number;
  actionsPerHumanPrompt: number | null;
  maxActionsBetweenPrompts: number;
  verifierActions: number;
  mutationActions: number;
  verifierDensity: number | null;
  loopArtifactTouches: number;
  specOrDocsTouches: number;
  testOrValidatorTouches: number;
  modelCallCount: number;
  stoppedAfterEditWithoutVerification: boolean;
}): string[] {
  const lines = [
    `classification=${input.classification}`,
    `humanPromptCount=${input.humanPromptCount}`,
    `actionCount=${input.actionCount}`,
    `actionsPerHumanPrompt=${input.actionsPerHumanPrompt ?? 'n/a'}`,
    `maxActionsBetweenPrompts=${input.maxActionsBetweenPrompts}`,
    `verifierActions=${input.verifierActions}`,
    `mutationActions=${input.mutationActions}`,
    `verifierDensity=${input.verifierDensity ?? 'n/a'}`,
  ];

  if (input.loopArtifactTouches > 0) lines.push(`loopArtifactTouches=${input.loopArtifactTouches}`);
  if (input.specOrDocsTouches > 0) lines.push(`specOrDocsTouches=${input.specOrDocsTouches}`);
  if (input.testOrValidatorTouches > 0) lines.push(`testOrValidatorTouches=${input.testOrValidatorTouches}`);
  if (input.modelCallCount > 0) lines.push(`modelCallCount=${input.modelCallCount}`);
  if (input.stoppedAfterEditWithoutVerification) lines.push('stoppedAfterEditWithoutVerification=true');
  lines.push('lineage=inferred_only');
  return lines;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
