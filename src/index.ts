export { closeKernel, createKernel } from './ledger.ts';
export type { CreateKernelInput, LearningKernel } from './ledger.ts';
export { initLedger } from './schema.ts';
export {
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
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
  updateZoneAssociationsFromJob,
} from './activation.ts';
export {
  attachEvidence,
  finishRun,
  getCredit,
  getModelCallSummary,
  getObserverSummary,
  getPreferenceSummary,
  promoteProtocol,
  promoteProtocolFromPreferences,
  proposeProtocol,
  recordGap,
  recordModelCall,
  recordOutcome,
  recordPreferencePair,
  recordPromptBoundary,
  recordRun,
  recordSessionStarted,
  recordTrace,
  resolveProtocol,
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
export type * from './types.ts';
