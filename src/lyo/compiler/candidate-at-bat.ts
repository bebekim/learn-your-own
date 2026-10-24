import type { LearningKernel } from '../storage/ledger.ts';
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
import { buildWorkflowStyleReport, type WorkflowStyleClassification } from './workflow-style.ts';
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
import { extractFinalClaim } from './candidate-at-bat/final-claim.ts';
import {
  actionTime,
  timingMetrics,
} from './candidate-at-bat/timing.ts';
import {
  repeatedEditHotspots,
  resourceTouchCounts,
  writeCountsByResource,
} from './candidate-at-bat/resource-churn.ts';
export { parseCandidateAtBatTaskContext } from './candidate-at-bat/task-context.ts';

import { CANDIDATE_AT_BAT_REPORT_VERSION } from './candidate-at-bat/report-types.ts';
import type {
  CandidateAtBatOutcome,
  CandidateAtBatTechniqueSignature,
  CandidateAtBatVerifierKind,
  CandidateAtBatVerifierMatchMode,
  CandidateAtBatVerifierQuality,
  CandidateAtBatFinalClaimPosture,
  CandidateAtBatVerifierSpec,
  CandidateAtBatMatchedVerifier,
  CandidateAtBatFinalClaim,
  CandidateAtBatTaskContext,
  CandidateAtBatReport,
} from './candidate-at-bat/report-types.ts';
export { CANDIDATE_AT_BAT_REPORT_VERSION };
export type {
  CandidateAtBatOutcome,
  CandidateAtBatTechniqueSignature,
  CandidateAtBatVerifierKind,
  CandidateAtBatVerifierMatchMode,
  CandidateAtBatVerifierQuality,
  CandidateAtBatFinalClaimPosture,
  CandidateAtBatVerifierSpec,
  CandidateAtBatMatchedVerifier,
  CandidateAtBatFinalClaim,
  CandidateAtBatTaskContext,
  CandidateAtBatReport,
};

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
  const riskControl = classifyRiskControl(actions, unsafeWrite, taskContext.allowedTools);
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
      verifierBeforeEdit: actions.findIndex(isTestAction) !== -1 &&
        (actions.findIndex(isEditAction) === -1 || actions.findIndex(isTestAction) < actions.findIndex(isEditAction)),
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

function hasInspectBeforeFirstEdit(actions: NormalizedAction[]): boolean {
  const firstEditIndex = actions.findIndex(isEditAction);
  if (firstEditIndex === -1) return false;
  return actions.slice(0, firstEditIndex).some(isInspectAction);
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

function techniqueSignatures(input: {
  workflowClassification: WorkflowStyleClassification;
  inspectBeforeEdit: boolean;
  verifiedProgress: boolean;
  debugging: boolean;
  unsafeWrite: boolean;
  verifierRuns: number;
  verifierBeforeEdit: boolean;
  edits: number;
  commandCountsByKind: CandidateAtBatReport['resourceChurn']['commandCountsByKind'];
}): CandidateAtBatTechniqueSignature[] {
  const signatures: CandidateAtBatTechniqueSignature[] = [];
  if (input.verifierBeforeEdit && input.verifiedProgress) signatures.push('verifier-first');
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
