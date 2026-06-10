export { closeKernel, createKernel } from './ledger.ts';
export type { CreateKernelInput, LearningKernel } from './ledger.ts';
export { initLedger } from './schema.ts';
export {
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  ensureNectrWorkspaceDefaults,
  finishJob,
  getJobActivationReport,
  getZoneAssociationReport,
  recordCommandActivation,
  recordDeploymentAction,
  recordJob,
  recordPathActivation,
  recordWorkspace,
  recordZone,
  recordZoneActivation,
  recommendZoneAssociations,
  updateZoneAssociationsFromJob,
} from './activation.ts';
export {
  attachEvidence,
  deriveVerifierGatePolicyFromTapes,
  finishRun,
  getCredit,
  getModelCallSummary,
  getObserverSummary,
  getPreferenceSummary,
  getExerciseAttempt,
  getExerciseAttempts,
  getExerciseView,
  getRunTapeView,
  promoteProtocol,
  promoteProtocolFromPreferences,
  proposeProtocol,
  recordExerciseAssistantClaim,
  recordExerciseVerifierResult,
  recordExerciseWorkerAction,
  recordGap,
  recordModelCall,
  recordOutcome,
  recordPreferencePair,
  recordPromptBoundary,
  recordRun,
  recordRunGoal,
  recordRunTapeCell,
  recordSessionStarted,
  recordTrace,
  resolveProtocol,
  ensureExerciseAttempt,
  runFixtureReplayDemo,
} from './reducers.ts';
export type {
  ClaudeHookInput,
  ClaudeHookOptions,
  ClaudeHookOutput,
} from './adapters/claude.ts';
export type {
  CodexHookInput,
  CodexHookOptions,
  CodexHookOutput,
} from './adapters/codex.ts';
export type {
  CanonicalHookEventName,
  HookObservation,
  HookRuntime,
  HookSpoolPacket,
} from './hooks/events.ts';
export { recordHookEvent } from './hooks/ingestion.ts';
export { normalizeHooks } from './hooks/normalization-runner.ts';
export {
  drainHookSpool,
  handleClaudeHook,
  handleCodexHook,
  spoolClaudeHookEvent,
  spoolCodexHookEvent,
} from './hooks/runtime.ts';
export { tokenizeTelemetryActions, deriveTelemetryTokens, tokenizeTelemetryRun } from './compiler/tokenizer.ts';
export { parseTelemetryEpisodes, compileTelemetryRunAst } from './compiler/parser.ts';
export { analyzeTelemetrySemantics } from './compiler/analyzer.ts';
export {
  actionToEffect,
  areConflicting,
  areIndependent,
  concatEffects,
  emptyEffect,
  findConflicts,
  foldTrace,
  hasApprovalFriction,
  hasDebugging,
  hasExternalSideEffects,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isExternalAction,
  isInspectAction,
  isTestAction,
} from './compiler/semantics.ts';
export { auditEffectLedgers } from './compiler/effect-audit.ts';
export { buildEffectReport } from './compiler/effect-report.ts';
export { planSemanticLowering } from './compiler/lowering.ts';
export { buildWorkflowStyleReport } from './compiler/workflow-style.ts';
export { buildStyleLearningReport } from './compiler/style-learning.ts';
export {
  buildCandidateAtBatReport,
  parseCandidateAtBatTaskContext,
} from './compiler/candidate-at-bat.ts';
export { buildCyberneticExperimentReport } from './compiler/cybernetic-experiment.ts';
export type * from './compiler/syntax.ts';
export type * from './compiler/semantics.ts';
export type * from './compiler/workflow-style.ts';
export type * from './compiler/style-learning.ts';
export type * from './compiler/candidate-at-bat.ts';
export type * from './compiler/cybernetic-experiment.ts';
export type * from './types.ts';
