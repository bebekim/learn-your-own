import type { LearningKernel } from '../ledger.ts';
import { buildEffectReport } from './effect-report.ts';
import {
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  isEditAction,
  isInspectAction,
  isTestAction,
} from './semantics.ts';
import type { NormalizedAction, RunTelemetryAst } from './syntax.ts';
import {
  buildWorkflowStyleReport,
  type WorkflowStyleClassification,
} from './workflow-style.ts';
import {
  actionFailed,
  actionSucceeded,
  evaluateVerifierSpecs,
  hasRegressionEvidence,
  hasVerifierPassAfterVerifierFailure,
} from './candidate-at-bat/verifiers.ts';
import {
  classifyClaimEvidenceAlignment,
  classifyFailureRecovery,
  classifyOutcome,
  classifyRiskControl,
} from './candidate-at-bat/scoring.ts';

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

export function buildCandidateAtBatReport(
  kernel: LearningKernel,
  ast: RunTelemetryAst,
  taskContext: CandidateAtBatTaskContext
): CandidateAtBatReport {
  const effectReport = buildEffectReport(ast);
  const workflowStyle = buildWorkflowStyleReport(kernel, ast);
  const actions = ast.actions;
  const toolActions = actions.filter((action) => action.eventKind !== 'boundary');
  const editActions = actions.filter(isEditAction);
  const verifierEvaluation = evaluateVerifierSpecs(actions, taskContext.verifiers ?? []);
  const verifierActions = verifierEvaluation.matchedActions;
  const verifierPasses = verifierActions.filter(actionSucceeded);
  const verifierFailures = verifierActions.filter(actionFailed);
  const verifiedProgress = verifierEvaluation.shipReadiness;
  const stoppedAfterEditWithoutVerification = hasStoppedAfterEditWithoutVerification(actions);
  const debugging = hasDebugging(actions);
  const unsafeWrite = hasUnsafeWrite(actions);
  const inspectBeforeEdit = hasInspectBeforeFirstEdit(actions);
  const finalClaim = extractFinalClaim(kernel, ast);
  const cleanStopWithJustification = hasCleanStopWithJustification({
    finalClaim,
    editActions,
    unsafeWrite,
  });
  const failureRecovery = classifyFailureRecovery({
    debugging,
    verifierFailures: verifierFailures.length,
    verifierPassesAfterFailure: hasVerifierPassAfterVerifierFailure(actions),
  });
  const riskControl = classifyRiskControl(actions, unsafeWrite);
  const outcome = classifyOutcome({
    verifiedProgress,
    stoppedAfterEditWithoutVerification,
    missingRequiredVerification: verifierEvaluation.missingRequiredVerifiers.length > 0 && editActions.length > 0,
    cleanStopWithJustification,
    regressionEvidence: hasRegressionEvidence(taskContext, actions, verifierEvaluation),
  });
  const commandCountsByKind = effectReport.counts;

  return {
    reportVersion: CANDIDATE_AT_BAT_REPORT_VERSION,
    mode: 'evaluate',
    runId: ast.runId,
    sessionId: actions[0]?.provenance.sessionId ?? null,
    taskId: taskContext.taskId,
    taskContext,
    outcome,
    shipReadiness: verifierEvaluation.shipReadiness,
    verifierQuality: verifierEvaluation.verifierQuality,
    matchedVerifiers: verifierEvaluation.matchedVerifiers,
    missingRequiredVerifiers: verifierEvaluation.missingRequiredVerifiers,
    finalClaim,
    scorecard: {
      verifiedProgress,
      stoppedAfterEditWithoutVerification,
      inspectBeforeEdit,
      cleanStopWithJustification,
      failureRecovery,
      riskControl,
      claimEvidenceAlignment: classifyClaimEvidenceAlignment({
        verifiedProgress,
        stoppedAfterEditWithoutVerification,
        missingRequiredVerification: verifierEvaluation.missingRequiredVerifiers.length > 0,
        regression: outcome === 'regression',
        finalClaim,
      }),
    },
    conversion: {
      turns: workflowStyle.metrics.humanPromptCount,
      toolCalls: toolActions.length,
      edits: editActions.length,
      verifierRuns: verifierActions.length,
      verifierPasses: verifierPasses.length,
      verifierFailures: verifierFailures.length,
    },
    timing: timingMetrics(actions),
    resourceChurn: {
      writeCountsByResource: writeCountsByResource(editActions),
      commandCountsByKind,
      resourceTouchCounts: resourceTouchCounts(actions),
      repeatedEditHotspots: repeatedEditHotspots(editActions),
    },
    workflowStyle: {
      classification: workflowStyle.classification,
      confidence: workflowStyle.confidence,
      lineageMode: workflowStyle.lineageMode,
    },
    techniqueSignature: techniqueSignatures({
      workflowClassification: workflowStyle.classification,
      inspectBeforeEdit,
      verifiedProgress,
      debugging,
      unsafeWrite,
      verifierRuns: verifierActions.length,
      edits: editActions.length,
      commandCountsByKind,
    }),
    evidenceRefs: evidenceRefs(actions),
    limitations: limitations({
      taskContext,
      actions,
      finalClaim,
      workflowMissingSignals: workflowStyle.missingSignals,
    }),
  };
}

export function parseCandidateAtBatTaskContext(value: unknown): CandidateAtBatTaskContext {
  if (!value || typeof value !== 'object') {
    throw new Error('candidate at-bat task context must be an object');
  }

  const input = value as Record<string, unknown>;
  const baseline = input.baseline;
  if (!baseline || typeof baseline !== 'object') {
    throw new Error('candidate at-bat task context missing baseline object');
  }

  return {
    taskId: requiredString(input, 'taskId'),
    language: optionalString(input, 'language'),
    taskComplexity: requiredNumber(input, 'taskComplexity'),
    expectedPattern: requiredString(input, 'expectedPattern'),
    successCriteria: requiredStringArray(input, 'successCriteria'),
    allowedTools: optionalStringArray(input, 'allowedTools'),
    verifiers: optionalVerifierSpecs(input, 'verifiers'),
    baseline: {
      existingTestsPass: optionalBoolean((baseline as Record<string, unknown>).existingTestsPass),
      buildSucceeds: optionalBoolean((baseline as Record<string, unknown>).buildSucceeds),
      knownIssues: optionalStringArray(baseline as Record<string, unknown>, 'knownIssues'),
    },
  };
}

function hasInspectBeforeFirstEdit(actions: NormalizedAction[]): boolean {
  const firstEditIndex = actions.findIndex(isEditAction);
  if (firstEditIndex === -1) return false;
  return actions.slice(0, firstEditIndex).some(isInspectAction);
}

function extractFinalClaim(kernel: LearningKernel, ast: RunTelemetryAst): CandidateAtBatFinalClaim {
  const stopRows = kernel.db.prepare(`
    select event_id as eventId, payload_json as payloadJson, created_at as createdAt
    from hook_events
    where turn_id = ?
      and (event_name = 'Stop' or json_extract(payload_json, '$.hook_event_name') = 'Stop')
    order by created_at, event_id
  `).all(ast.runId) as Array<{ eventId: string; payloadJson: string; createdAt: string }>;
  const evidenceRefs = stopRows.map((row) => `hook:${row.eventId}`);
  const rawMessages = stopRows
    .map((row) => finalMessageFromPayload(row.payloadJson))
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '');
  const promptRows = kernel.db.prepare(`
    select response_summary as responseSummary
    from session_prompts
    where (run_id = ? or turn_id = ?)
      and prompt_role = 'assistant'
      and prompt_kind = 'assistant_response'
      and response_summary is not null
    order by recorded_at, prompt_index
  `).all(ast.runId, ast.runId) as Array<{ responseSummary: string | null }>;
  const summarizedMessages = promptRows
    .map((row) => row.responseSummary)
    .filter((message): message is string => typeof message === 'string' && message.trim() !== '');
  const summary = truncateSummary(rawMessages.at(-1) ?? summarizedMessages.at(-1) ?? null);
  const text = summary?.toLowerCase() ?? '';
  const mentionsVerifier = /\b(test|tests|tested|testing|pytest|rspec|mvn|gradle|ctest|cargo test|go test|xcodebuild|typecheck|build|verifier|verified|passed|green)\b/i.test(text);
  const mentionsBlocker = /\b(blocked|blocker|cannot|can't|unable|unsafe|underspecified|missing|permission|requires|required|not enough|not possible|needs?|need)\b/i.test(text);
  const claimsDone = /\b(done|completed|complete|fixed|implemented|finished|ready|works|resolved|shipped)\b/i.test(text);
  const asksForFollowup = /\b(next step|please|could you|would you|let me know|follow up)\b/i.test(text);

  let posture: CandidateAtBatFinalClaimPosture = 'unknown';
  if (summary) {
    if (mentionsBlocker && !claimsDone) posture = 'blocked';
    else if (mentionsVerifier && claimsDone) posture = 'cites_evidence';
    else if (claimsDone) posture = 'claims_done';
    else if (asksForFollowup) posture = 'asks_for_followup';
  }

  return {
    posture,
    mentionsVerifier,
    mentionsBlocker,
    summary,
    evidenceRefs,
  };
}

function finalMessageFromPayload(payloadJson: string): string | null {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    return typeof payload.last_assistant_message === 'string' ? payload.last_assistant_message : null;
  } catch {
    return null;
  }
}

function truncateSummary(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed;
}

function hasCleanStopWithJustification(input: {
  finalClaim: CandidateAtBatFinalClaim;
  editActions: NormalizedAction[];
  unsafeWrite: boolean;
}): boolean {
  return input.finalClaim.posture === 'blocked'
    && input.finalClaim.mentionsBlocker
    && input.editActions.length === 0
    && !input.unsafeWrite;
}

function timingMetrics(actions: NormalizedAction[]): CandidateAtBatReport['timing'] {
  const firstTime = actionTime(actions[0]);
  const lastTime = actionTime(actions[actions.length - 1]);
  const firstInspectTime = actionTime(actions.find(isInspectAction));
  const firstEditTime = actionTime(actions.find(isEditAction));
  const firstVerifierTime = actionTime(actions.find(isTestAction));

  return {
    timeToFirstInspectMs: diffMs(firstTime, firstInspectTime),
    timeToFirstEditMs: diffMs(firstTime, firstEditTime),
    timeToFirstVerifierMs: diffMs(firstTime, firstVerifierTime),
    meanEditToVerifierDelayMs: meanEditToVerifierDelayMs(actions),
    failureRecoveryLatencyMs: failureRecoveryLatencyMs(actions),
    totalSessionDurationMs: diffMs(firstTime, lastTime),
  };
}

function meanEditToVerifierDelayMs(actions: NormalizedAction[]): number | null {
  const delays: number[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!isEditAction(action)) continue;
    const editTime = actionTime(action);
    const verifierTime = actionTime(actions.slice(index + 1).find(isTestAction));
    const delay = diffMs(editTime, verifierTime);
    if (delay !== null) delays.push(delay);
  }
  if (delays.length === 0) return null;
  return Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length);
}

function failureRecoveryLatencyMs(actions: NormalizedAction[]): number | null {
  const failedVerifierIndex = actions.findIndex((action) => isTestAction(action) && actionFailed(action));
  if (failedVerifierIndex === -1) return null;
  const failureTime = actionTime(actions[failedVerifierIndex]);
  const recoveryTime = actionTime(
    actions.slice(failedVerifierIndex + 1).find((action) => {
      return (isInspectAction(action) || isEditAction(action) || isTestAction(action) && actionSucceeded(action));
    })
  );
  return diffMs(failureTime, recoveryTime);
}

function writeCountsByResource(actions: NormalizedAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) {
    for (const resource of action.resources.written) {
      const key = resource.ref;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return sortRecord(counts);
}

function resourceTouchCounts(actions: NormalizedAction[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const action of actions) {
    for (const resource of [...action.resources.read, ...action.resources.written]) {
      const key = resource.ref;
      counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return sortRecord(counts);
}

function repeatedEditHotspots(actions: NormalizedAction[]): string[] {
  return Object.entries(writeCountsByResource(actions))
    .filter(([, count]) => count > 1)
    .map(([resource]) => resource);
}

function techniqueSignatures(input: {
  workflowClassification: WorkflowStyleClassification;
  inspectBeforeEdit: boolean;
  verifiedProgress: boolean;
  debugging: boolean;
  unsafeWrite: boolean;
  verifierRuns: number;
  edits: number;
  commandCountsByKind: CandidateAtBatReport['resourceChurn']['commandCountsByKind'];
}): CandidateAtBatTechniqueSignature[] {
  const signatures: CandidateAtBatTechniqueSignature[] = [];
  if (input.verifierRuns > 0 && input.verifiedProgress) signatures.push('verifier-first');
  if (input.inspectBeforeEdit && input.commandCountsByKind.inspect > input.edits) signatures.push('explorer');
  if (input.debugging) signatures.push('debugger');
  if (input.unsafeWrite) signatures.push('risky-shipper');
  if (input.workflowClassification === 'prompt_driven') signatures.push('prompt-heavy-generator');
  if (input.workflowClassification === 'manual_orchestrated') signatures.push('manual-orchestrated');
  if (input.workflowClassification === 'loop_assisted') signatures.push('loop-assisted');
  if (input.workflowClassification === 'loop_driven_candidate') signatures.push('loop-driven-candidate');
  return signatures;
}

function evidenceRefs(actions: NormalizedAction[]): string[] {
  return Array.from(new Set(actions.map((action) => action.provenance.evidenceRef)));
}

function limitations(input: {
  taskContext: CandidateAtBatTaskContext;
  actions: NormalizedAction[];
  finalClaim: CandidateAtBatFinalClaim;
  workflowMissingSignals: string[];
}): string[] {
  const values = [
    'token counts are unavailable in hook-only telemetry',
    'final assistant claim text is not semantically judged in v1',
    'free-text success criteria are not semantically matched without explicit verifier mapping',
    'subprocess lineage is limited to available hook/tool identifiers',
    ...input.workflowMissingSignals.map((signal) => `workflow signal unavailable: ${signal}`),
  ];

  if (input.taskContext.baseline.existingTestsPass === null || input.taskContext.baseline.existingTestsPass === undefined) {
    values.push('baseline existingTestsPass was not provided');
  }
  if (input.taskContext.baseline.buildSucceeds === null || input.taskContext.baseline.buildSucceeds === undefined) {
    values.push('baseline buildSucceeds was not provided');
  }
  if (input.actions.some((action) => actionTime(action) === null)) {
    values.push('one or more actions have invalid timestamps');
  }
  if (!input.finalClaim.summary) {
    values.push('final assistant claim text is unavailable or redacted');
  }

  return Array.from(new Set(values));
}

function actionTime(action: NormalizedAction | undefined): number | null {
  if (!action) return null;
  const time = Date.parse(action.provenance.createdAt);
  return Number.isFinite(time) ? time : null;
}

function diffMs(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.max(0, right - left);
}

function requiredString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`candidate at-bat task context missing ${key}`);
  }
  return value;
}

function requiredNumber(input: Record<string, unknown>, key: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`candidate at-bat task context missing numeric ${key}`);
  }
  return value;
}

function optionalString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`candidate at-bat task context invalid string ${key}`);
  }
  return value;
}

function requiredStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`candidate at-bat task context missing string array ${key}`);
  }
  return [...value] as string[];
}

function optionalStringArray(input: Record<string, unknown>, key: string): string[] {
  const value = input[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`candidate at-bat task context invalid string array ${key}`);
  }
  return [...value] as string[];
}

function optionalVerifierSpecs(
  input: Record<string, unknown>,
  key: string
): CandidateAtBatVerifierSpec[] {
  const value = input[key];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`candidate at-bat task context invalid verifier array ${key}`);
  }

  return value.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`candidate at-bat task context invalid verifier at index ${index}`);
    }
    const verifier = item as Record<string, unknown>;
    return {
      id: requiredString(verifier, 'id'),
      commandPattern: requiredString(verifier, 'commandPattern'),
      kind: verifierKind(verifier.kind, index),
      required: requiredBoolean(verifier, 'required'),
      matchMode: optionalMatchMode(verifier.matchMode, index),
    };
  });
}

function verifierKind(value: unknown, index: number): CandidateAtBatVerifierKind {
  const allowed: CandidateAtBatVerifierKind[] = [
    'targeted',
    'broad',
    'static',
    'build',
    'smoke',
    'unknown',
  ];
  if (typeof value === 'string' && allowed.includes(value as CandidateAtBatVerifierKind)) {
    return value as CandidateAtBatVerifierKind;
  }
  throw new Error(`candidate at-bat task context invalid verifier kind at index ${index}`);
}

function optionalMatchMode(value: unknown, index: number): CandidateAtBatVerifierMatchMode | undefined {
  if (value === undefined || value === null) return undefined;
  const allowed: CandidateAtBatVerifierMatchMode[] = ['contains', 'exact', 'regex'];
  if (typeof value === 'string' && allowed.includes(value as CandidateAtBatVerifierMatchMode)) {
    return value as CandidateAtBatVerifierMatchMode;
  }
  throw new Error(`candidate at-bat task context invalid verifier matchMode at index ${index}`);
}

function requiredBoolean(input: Record<string, unknown>, key: string): boolean {
  const value = input[key];
  if (typeof value !== 'boolean') {
    throw new Error(`candidate at-bat task context missing boolean ${key}`);
  }
  return value;
}

function optionalBoolean(value: unknown): boolean | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    throw new Error('candidate at-bat task context baseline fields must be booleans');
  }
  return value;
}

function sortRecord(input: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(input).sort(([left], [right]) => left.localeCompare(right)));
}
