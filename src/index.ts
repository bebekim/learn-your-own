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
export { parseTelemetryEpisodes } from './compiler/parser.ts';
export { compileTelemetryRun, compileTelemetryRunAst } from './compiler/frontend.ts';
export type { CompiledTelemetryRun } from './compiler/frontend.ts';
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
export { buildAssociationLearningReport } from './compiler/association-learning.ts';
export {
  buildExplanationGraphReport,
  computeObservedFactorMessage,
  computeRivalOutcomeMessage,
  normalizeBinaryBelief,
} from './compiler/explanation-graph.ts';
export {
  buildCandidateAtBatReport,
  parseCandidateAtBatTaskContext,
} from './compiler/candidate-at-bat.ts';
export { buildCyberneticExperimentReport } from './compiler/cybernetic-experiment.ts';
export {
  compilePromptArtifact,
  compileSeparatedCodeAndTestPromptArtifacts,
} from './compiler/prompt-artifacts.ts';
export {
  checkBlindness,
  CODE_VERSION,
  hashFile,
  hashValue,
  LYO_UPDATE_VERSION,
  PLAN_VERSION,
  SPEC_VERSION,
  TEST_VERSION,
  TRACE_VERSION,
  VERIFIER_REPORT_VERSION,
  validateCodeManifest,
  validateLyoUpdate,
  validatePlan,
  validateSpec,
  validateTestManifest,
  validateTrace,
  validateVerifierReport,
} from './contract/index.ts';
export type {
  ArtifactRef,
  BlindnessResult,
  CodeManifest,
  LyoUpdate,
  Plan,
  PlanStage,
  Spec,
  TestManifest,
  Trace,
  ValidationIssue,
  ValidationResult,
  VerifierReport,
} from './contract/index.ts';
export {
  collectFiles,
  filterDeclaredWrites,
  materializeSandbox,
  parseFileBlocks,
} from './runner/files.ts';
export type { FileBlock } from './runner/files.ts';
export { createOpenRouterExecutor } from './runner/executors/openrouter.ts';
export type {
  OpenRouterChatFn,
  OpenRouterChatMessage,
  OpenRouterExecutorOptions,
} from './runner/executors/openrouter.ts';
export { createKimiCliExecutor } from './runner/executors/kimi-cli.ts';
export type { KimiCliExecutorOptions, SpawnKimiFn } from './runner/executors/kimi-cli.ts';
export type {
  StageExecutionInput,
  StageExecutionResult,
  StageExecutor,
} from './runner/executors/stage-executor.ts';
export { parseTapOutput, runVerifier } from './runner/verifier.ts';
export type { RunTestsFn, VerifierRun } from './runner/verifier.ts';
export { runPipeline } from './runner/run-pipeline.ts';
export type { ExecutorFactory, RunPipelineInput, RunPipelineResult } from './runner/run-pipeline.ts';
export {
  corpusReport,
  syncCorpusOnce,
} from './corpus/sync.ts';
export { importGitHistory } from './corpus/git-import.ts';
export {
  DEFAULT_POLICY,
  DEFAULT_POLICY_ID,
  POLICY_REGISTRY,
  THOMPSON_BETA_POLICY,
  policyId,
  resolvePolicy,
  sampleGamma,
} from './lyo/selection-policies.ts';
export {
  INVERSION_MAP,
  executorFamily,
  invertedReflectorModel,
} from './lyo/model-inversion.ts';
export {
  FAILURE_CLASSES,
  classifyValidationFailure,
  normalizeCue,
} from './lyo/failure-classifier.ts';
export {
  DEFAULT_REFLECTOR,
  EXPLANATION_MAX_LENGTH,
  REFLECTOR_REGISTRY,
  TEMPLATE_REFLECTOR,
  buildGuidanceText,
  formatValidationFeedback,
  isValidReflection,
  reflectorId,
  resolveReflector,
} from './lyo/reflector-policies.ts';
export {
  DEFAULT_MODEL,
  OPENROUTER_URL,
  buildPrompt,
  createElaboratorReflector,
  parseReflectionJson,
} from './lyo/elaborator-reflector.ts';
export { LessonStore } from './lyo/lesson-store.ts';
export { LearnedRuleStore } from './lyo/learned-rules.ts';
export {
  emitSessionLessons,
  renderSessionLessons,
  resolveSessionLessonStorePath,
} from './lyo/session-hook.ts';
export type {
  ScoredSelection,
  SelectionCandidate,
  SelectionPolicy,
  SelectionPolicyRef,
} from './lyo/selection-policies.ts';
export type {
  ApplyVerifierRulesInput,
  CreateVerifierRuleInput,
  LearnedRuleApplicationRow,
  LearnedRuleDeltaRow,
  LearnedRuleOutcome,
  LearnedRuleRow,
  LearnedRuleStatus,
  VerifierGate,
} from './lyo/learned-rules.ts';
export type { SessionHookPayload } from './lyo/session-hook.ts';
export type { FailureClassification } from './lyo/failure-classifier.ts';
export type {
  Reflection,
  ReflectionInput,
  Reflector,
  ReflectorContext,
  ReflectorRef,
  ValidationMessage,
} from './lyo/reflector-policies.ts';
export type {
  BuildPromptInput,
  ChatFn,
  ChatMessage,
  ElaboratorReflectorOptions,
} from './lyo/elaborator-reflector.ts';
export type {
  ApplicationRow,
  CreateLessonInput,
  DecisionCandidate,
  DecisionRow,
  DeltaRow,
  LessonRow,
  LibraryRow,
  PairStatsRow,
  PreferencePairRow,
  RecordApplicationInput,
  RecordDecisionInput,
  RecordPreferencePairInput,
  RecordTraceInput,
  ReplayState,
  SelectLessonsInput,
  SelectWithDecisionInput,
  SelectWithDecisionResult,
  SelectedLesson,
  TraceRow,
} from './lyo/lesson-store.ts';
export type * from './compiler/syntax.ts';
export type * from './compiler/semantics.ts';
export type * from './compiler/workflow-style.ts';
export type * from './compiler/style-learning.ts';
export type * from './compiler/association-learning.ts';
export type * from './compiler/explanation-graph.ts';
export type * from './compiler/candidate-at-bat.ts';
export type * from './compiler/cybernetic-experiment.ts';
export type * from './compiler/prompt-artifacts.ts';
export type * from './corpus/sync.ts';
export type * from './corpus/git-import.ts';
export type * from './types.ts';
