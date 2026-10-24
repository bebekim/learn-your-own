export { closeKernel, createKernel } from './lyo/storage/ledger.ts';
export type { CreateKernelInput, LearningKernel } from './lyo/storage/ledger.ts';
export { initLedger } from './lyo/storage/ledger-schema.ts';
export { FeedbackController } from './lyo/control/feedback-controller.ts';
export type {
  ControlSpecification, ControlRequest, ControlDecision, ControlFeedback, ActionEstimate,
} from './lyo/control/feedback-controller.ts';
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
} from './lyo/activation.ts';
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
  recordSessionEnded,
  recordSessionStarted,
  recordTrace,
  resolveProtocol,
  resolveTurnUserPrompts,
  getPromptKindBeliefs,
  recordPromptKindEvidence,
  recomputePromptKind,
  backfillPromptKindEvidence,
  ensureExerciseAttempt,
  runFixtureReplayDemo,
} from './lyo/storage/reducers.ts';
export type {
  ClaudeHookInput,
  ClaudeHookOptions,
  ClaudeHookOutput,
} from './lyo/hooks/adapters/claude.ts';
export type {
  CodexHookInput,
  CodexHookOptions,
  CodexHookOutput,
} from './lyo/hooks/adapters/codex.ts';
export { translateGeminiEvent } from './lyo/hooks/adapters/gemini.ts';
export type { GeminiHookEvent } from './lyo/hooks/adapters/gemini.ts';
export { translateAgyEvent } from './lyo/hooks/adapters/antigravity.ts';
export type { AgyHookEvent } from './lyo/hooks/adapters/antigravity.ts';
export { translateDcodeEvent } from './lyo/hooks/adapters/deepagents.ts';
export type { DcodeHookEvent } from './lyo/hooks/adapters/deepagents.ts';
export type {
  CanonicalHookEventName,
  HookObservation,
  HookRuntime,
  HookSpoolPacket,
} from './lyo/hooks/events.ts';
export { recordHookEvent } from './lyo/hooks/ingestion.ts';
export { normalizeHooks } from './lyo/hooks/normalization-runner.ts';
export { buildPromptKindReport } from './lyo/measurement/prompt-kind.ts';
export type { PromptKindReport } from './lyo/measurement/prompt-kind.ts';
export { buildPromptEpisodes } from './lyo/measurement/episodes.ts';
export type { PromptEpisode, PromptEpisodeMember } from './lyo/measurement/episodes.ts';
export {
  drainHookSpool,
  handleClaudeHook,
  handleCodexHook,
  spoolClaudeHookEvent,
  spoolCodexHookEvent,
} from './lyo/hooks/runtime.ts';
export { tokenizeTelemetryActions, deriveTelemetryTokens, tokenizeTelemetryRun } from './lyo/compiler/tokenizer.ts';
export { parseTelemetryEpisodes } from './lyo/compiler/parser.ts';
export { compileTelemetryRun, compileTelemetryRunAst } from './lyo/compiler/frontend.ts';
export type { CompiledTelemetryRun } from './lyo/compiler/frontend.ts';
export { analyzeTelemetrySemantics } from './lyo/compiler/analyzer.ts';
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
} from './lyo/compiler/semantics.ts';
export { auditEffectLedgers } from './lyo/compiler/effect-audit.ts';
export { buildEffectReport } from './lyo/compiler/effect-report.ts';
export { planSemanticLowering } from './lyo/compiler/lowering.ts';
export { buildWorkflowStyleReport } from './lyo/compiler/workflow-style.ts';
export {
  buildCandidateAtBatReport,
  parseCandidateAtBatTaskContext,
} from './lyo/compiler/candidate-at-bat.ts';
export {
  compilePromptArtifact,
  compileSeparatedCodeAndTestPromptArtifacts,
} from './lyo/compiler/prompt-artifacts.ts';
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
  validateSpecProposal,
  validateTestManifest,
  validateTrace,
  validateVerifierReport,
} from './lyo/contract/index.ts';
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
} from './lyo/contract/index.ts';
export {
  collectFiles,
  DEFAULT_BLOCK_FORMAT_RULES,
  filterDeclaredWrites,
  loadBlockFormats,
  materializeSandbox,
  parseFileBlocks,
} from './lyo/runner/files.ts';
export type { BlockFormatKind, BlockFormatRule, BlockFormatsArtifact, FileBlock } from './lyo/runner/files.ts';
export { createOpenRouterExecutor } from './lyo/runner/executors/openrouter.ts';
export type {
  OpenRouterChatFn,
  OpenRouterChatMessage,
  OpenRouterExecutorOptions,
} from './lyo/runner/executors/openrouter.ts';
export { createKimiCliExecutor } from './lyo/runner/executors/kimi-cli.ts';
export type { KimiCliExecutorOptions, SpawnKimiFn } from './lyo/runner/executors/kimi-cli.ts';
export { createUpstageExecutor, UPSTAGE_URL } from './lyo/runner/executors/upstage.ts';
export type { UpstageExecutorOptions } from './lyo/runner/executors/upstage.ts';
export { createOpenAiCompatibleExecutor } from './lyo/runner/executors/openai-compatible.ts';
export type {
  StageExecutionInput,
  StageExecutionResult,
  StageExecutor,
} from './lyo/runner/executors/stage-executor.ts';
export { parseTapOutput, runVerifier } from './lyo/runner/verifier.ts';
export type { RunTestsFn, VerifierRun } from './lyo/runner/verifier.ts';
export { applyRun } from './lyo/runner/apply.ts';
export { compileSpecMarkdown } from './lyo/runner/spec-compiler.ts';
export { runPipeline } from './lyo/runner/run-pipeline.ts';
export type { ExecutorFactory, RunPipelineInput, RunPipelineResult } from './lyo/runner/run-pipeline.ts';
export { compareRuns } from './lyo/runner/compare-runs.ts';
export type { RunComparison } from './lyo/runner/compare-runs.ts';
export { computeMergeDecision } from './lyo/runner/merge-confidence.ts';
export type { MergeDecision, MergeSignals } from './lyo/runner/merge-confidence.ts';
export {
  corpusReport,
  syncCorpusOnce,
} from './lyo/corpus/sync.ts';
export { importGitHistory } from './lyo/corpus/git-import.ts';
export {
  DEFAULT_POLICY,
  DEFAULT_POLICY_ID,
  POLICY_REGISTRY,
  THOMPSON_BETA_POLICY,
  policyId,
  resolvePolicy,
  sampleGamma,
} from './lyo/selection/selection-policies.ts';
export {
  INVERSION_MAP,
  executorFamily,
  invertedReflectorModel,
} from './lyo/reflection/model-inversion.ts';
export {
  FAILURE_CLASSES,
  classifyValidationFailure,
  normalizeCue,
} from './lyo/selection/failure-classifier.ts';
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
} from './lyo/reflection/reflector-policies.ts';
export {
  DEFAULT_MODEL,
  OPENROUTER_URL,
  buildPrompt,
  createElaboratorReflector,
  parseReflectionJson,
} from './lyo/reflection/elaborator-reflector.ts';
export { classifyMechanically } from './lyo/judge/mechanical-judge.ts';
export { LessonStore } from './lyo/storage/lesson-store.ts';
export {
  accumulateEvidence,
  evidenceThreshold,
  logEvidenceRatio,
} from './lyo/judge/evidence.ts';
export {
  installPromotedLessons,
  isDemoted,
  lessonsForRole,
  loadLessons,
  recordLessonOutcome,
  renderLessonsBlock,
  renderPatchBlock,
  selectLessons,
} from './lyo/storage/lesson-library.ts';
export type { Lesson, LessonVehicle } from './lyo/storage/lesson-library.ts';
export {
  loadCalibrationCases,
  runJudgeCalibration,
} from './lyo/judge/judge-calibration.ts';
export type {
  CalibrationCase,
  CalibrationCaseResult,
  CalibrationResult,
} from './lyo/judge/judge-calibration.ts';
export {
  buildJudgePrompt,
  consumeTraces,
  extractDisagreements,
  loadRunEvidence,
  parseJudgeResponse,
} from './lyo/judge/trace-consumer.ts';
export { createDefaultJudge } from './lyo/judge/openrouter.ts';
export type {
  AnalyzedDisagreement,
  ConsumeTraceInput,
  DisagreementInput,
  JudgeClassification,
  JudgeFn,
  Judgment,
  RunAnalysis,
  RunEvidence,
  TraceConsumption,
} from './lyo/judge/trace-consumer.ts';
export { LearnedRuleStore } from './lyo/storage/learned-rules.ts';
export {
  emitSessionLessons,
  renderSessionLessons,
  resolveSessionLessonStorePath,
} from './lyo/selection/session-hook.ts';
export type {
  ScoredSelection,
  SelectionCandidate,
  SelectionPolicy,
  SelectionPolicyRef,
} from './lyo/selection/selection-policies.ts';
export type {
  ApplyVerifierRulesInput,
  CreateVerifierRuleInput,
  LearnedRuleApplicationRow,
  LearnedRuleDeltaRow,
  LearnedRuleOutcome,
  LearnedRuleRow,
  LearnedRuleStatus,
  VerifierGate,
} from './lyo/storage/learned-rules.ts';
export type { SessionHookPayload } from './lyo/selection/session-hook.ts';
export type { FailureClassification } from './lyo/selection/failure-classifier.ts';
export type {
  Reflection,
  ReflectionInput,
  Reflector,
  ReflectorContext,
  ReflectorRef,
  ValidationMessage,
} from './lyo/reflection/reflector-policies.ts';
export type {
  BuildPromptInput,
  ChatFn,
  ChatMessage,
  ElaboratorReflectorOptions,
} from './lyo/reflection/elaborator-reflector.ts';
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
} from './lyo/storage/lesson-store.ts';
export { collectGitCorpusPool } from './lyo/corpus/pool.ts';
export { analyzePythonLayer2Delta } from './lyo/corpus/git-layer2.ts';
export type * from './lyo/compiler/syntax.ts';
export type * from './lyo/compiler/semantics.ts';
export type * from './lyo/compiler/workflow-style.ts';
export type * from './lyo/compiler/candidate-at-bat.ts';
export type * from './lyo/compiler/prompt-artifacts.ts';
export type * from './lyo/corpus/sync.ts';
export type * from './lyo/corpus/git-import.ts';
export type * from './lyo/corpus/pool.ts';
export type * from './lyo/corpus/git-layer2.ts';
