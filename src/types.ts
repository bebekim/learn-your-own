export type GapStatus = 'observed' | 'inferred' | 'unknown' | 'contradicted';
export type ScopeKind = 'worktree' | 'repository' | 'channel';
export type ProtocolStatus = 'candidate' | 'active' | 'demoted';
export type CostBand = 'low' | 'medium' | 'high';
export type TraceKind = 'behavior' | 'protocol_application' | 'agent_response' | 'tool_use' | 'other';
export type PreferenceConfidence = 'low' | 'medium' | 'high';
export type ModelCallStatus = 'started' | 'completed' | 'failed';
export type JobStatus = 'started' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type PathActivationKind = 'file_read' | 'file_written' | 'file_created' | 'file_deleted' | 'file_diffed' | 'directory_listed' | 'unknown';
export type CommandClassification = 'test' | 'build' | 'lint' | 'format' | 'deploy' | 'database' | 'cloud' | 'package' | 'git' | 'inspect' | 'local_dev' | 'unknown';
export type CommandStatus = 'planned' | 'attempted' | 'succeeded' | 'failed' | 'unknown';
export type BehaviorPhase = 'explore' | 'fix' | 'validate' | 'unknown';
export type ActivationConfidence = 'low' | 'medium' | 'high';
export type ZoneActivationSourceKind = 'path' | 'command' | 'deployment' | 'manual' | 'inferred';
export type AssociationOutcome = 'positive' | 'negative' | 'unknown';

export interface RunRecord {
  runId: string;
  taskShape: string;
  channel: string;
  status: string;
  tokenCost: number;
}

export interface GapRecord {
  gapId: string;
  runId: string;
  kind: string;
  summary: string;
  evidenceRef: string;
  status: GapStatus;
}

export interface ProtocolRecord {
  protocolId: string;
  title: string;
  scopeKind: ScopeKind;
  scopeValue: string;
  action: string;
  proposedBy: string | null;
  promotedBy: string | null;
  status: ProtocolStatus;
}

export interface ProtocolDelivery {
  protocolId: string;
  title: string;
  scopeKind: ScopeKind;
  scopeValue: string;
  action: string;
  status: 'active';
}

export interface RecordRunInput {
  runId: string;
  taskShape: string;
  channel: string;
  status: string;
  tokenCost?: number;
}

export interface FinishRunInput {
  runId: string;
  status: string;
  tokenCost?: number;
}

export interface RecordGapInput {
  gapId?: string;
  runId: string;
  kind: string;
  summary: string;
  evidenceRef: string;
  status: GapStatus;
}

export interface ProposeProtocolInput {
  protocolId: string;
  title: string;
  scopeKind: ScopeKind;
  scopeValue: string;
  action: string;
  proposedBy?: string;
}

export interface AttachEvidenceInput {
  protocolId: string;
  gapId: string;
}

export interface PromoteProtocolInput {
  protocolId: string;
  evidenceIds?: string[];
  promotedBy?: string;
}

export interface PromoteProtocolFromPreferencesInput {
  protocolId: string;
  preferenceIds?: string[];
  promotedBy?: string;
  minPreferences?: number;
}

export interface ResolveProtocolInput {
  taskShape: string;
  channel: string;
  runId?: string;
}

export interface ResolveProtocolResult {
  protocols: ProtocolDelivery[];
  deliveryId: string | null;
}

export interface RecordOutcomeInput {
  outcomeId?: string;
  deliveryId: string;
  runId?: string;
  followed: boolean;
  defectRepeated: boolean;
  verified: boolean;
  costBand: CostBand;
}

export interface OutcomeRecord {
  outcomeId: string;
  deliveryId: string;
  creditDelta: number;
}

export interface AdaptiveCredit {
  adaptiveCredit: number;
}

export interface RecordTraceInput {
  traceId?: string;
  runId?: string | null;
  kind: TraceKind;
  summary: string;
  ref?: string | null;
  payload?: unknown;
}

export interface TraceRecord {
  traceId: string;
  runId: string | null;
  kind: TraceKind;
  summary: string;
  ref: string | null;
}

export interface RecordPreferencePairInput {
  preferenceId?: string;
  context?: string;
  contextHash?: string;
  chosenTraceId: string;
  rejectedTraceId: string;
  reason: string;
  evidenceRef: string;
  recordedBy?: string | null;
  confidence?: PreferenceConfidence;
}

export interface PreferencePairRecord {
  preferenceId: string;
  contextHash: string;
  chosenTraceId: string;
  rejectedTraceId: string;
  reason: string;
  evidenceRef: string;
  recordedBy: string | null;
  confidence: PreferenceConfidence;
}

export interface PreferenceSummary {
  traces: number;
  preferencePairs: number;
}

export interface RecordModelCallInput {
  callId?: string;
  sessionId?: string | null;
  runId?: string | null;
  provider: string;
  model: string;
  modelLane: string;
  promptRef?: string | null;
  promptText?: string;
  promptHash?: string | null;
  promptSummary?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  estimatedCost?: number | null;
  latencyMs?: number | null;
  status: ModelCallStatus;
  errorSummary?: string | null;
}

export interface ModelCallRecord {
  callId: string;
  sessionId: string | null;
  runId: string | null;
  provider: string;
  model: string;
  modelLane: string;
  promptRef: string | null;
  promptHash: string | null;
  promptSummary: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  status: ModelCallStatus;
  errorSummary: string | null;
}

export interface ModelCallSummary {
  modelCalls: number;
  totalModelTokens: number;
  estimatedModelCost: number;
}

export interface HookEventInput {
  eventId?: string;
  sessionId: string;
  turnId?: string | null;
  eventName: string;
  cwd: string;
  model?: string | null;
  payload: unknown;
}

export interface HookEventRecord {
  eventId: string;
  sessionId: string;
  turnId: string | null;
  eventName: string;
  cwd: string;
  model: string | null;
}

export interface HookSpoolOptions {
  spoolDir: string;
  promptDir?: string;
}

export interface HookSpoolRecord {
  eventId: string;
  eventName: string;
  packetPath: string;
}

export interface FixtureReplayDemoResult {
  ok: true;
  firstPromotionError: string | null;
  promoted: ProtocolRecord;
  overlay: ResolveProtocolResult;
  outcome: OutcomeRecord;
  credit: AdaptiveCredit;
}

export interface RecordSessionStartedInput {
  sessionId: string;
  workspaceScope?: string;
  repoPath?: string;
  branch?: string;
  platform?: string;
  model?: string | null;
}

export interface SessionRecord {
  sessionId: string;
  workspaceScope: string;
  repoPath: string | null;
  branch: string | null;
  platform: string;
  model: string | null;
}

export interface RecordPromptBoundaryInput {
  sessionId: string;
  runId?: string | null;
  turnId?: string | null;
  role: string;
  kind: string;
  promptText?: string;
  promptHash?: string | null;
  promptLength?: number | null;
  promptRef?: string;
  summary?: string;
  responseSummary?: string;
  model?: string | null;
}

export interface PromptBoundaryRecord {
  promptId: string;
  sessionId: string;
  promptIndex: number;
  promptRole: string;
  promptKind: string;
}

export interface ObserverSummary {
  sessions: number;
  promptBoundaries: number;
  hookEvents: number;
  modelCalls: number;
  totalModelTokens: number;
  estimatedModelCost: number;
  runs: number;
  traces: number;
  preferencePairs: number;
  activeProtocols: number;
  adaptiveCredit: number;
}

export interface WorkspaceRecordInput {
  workspaceId?: string;
  rootPath: string;
  name?: string;
}

export interface WorkspaceRecord {
  workspaceId: string;
  rootPath: string;
  name: string;
}

export interface RecordZoneInput {
  zoneId?: string;
  workspaceId: string;
  parentZoneId?: string | null;
  zoneKind: string;
  pathGlob?: string | null;
  name: string;
  description?: string | null;
}

export interface ZoneRecord {
  zoneId: string;
  workspaceId: string;
  parentZoneId: string | null;
  zoneKind: string;
  pathGlob: string | null;
  name: string;
  description: string | null;
}

export interface RecordJobInput {
  jobId: string;
  workspaceId: string;
  runId?: string | null;
  taskShape?: string | null;
  summary?: string | null;
  sourceRef?: string | null;
  status?: JobStatus;
}

export interface FinishJobInput {
  jobId: string;
  status: JobStatus;
}

export interface JobRecord {
  jobId: string;
  workspaceId: string;
  runId: string | null;
  taskShape: string | null;
  summary: string | null;
  sourceRef: string | null;
  status: JobStatus;
}

export interface RecordPathActivationInput {
  activationId?: string;
  jobId: string;
  runId?: string | null;
  path: string;
  activationKind: PathActivationKind;
  evidenceRef?: string | null;
  confidence?: ActivationConfidence;
  phase?: BehaviorPhase;
}

export interface PathActivationRecord {
  activationId: string;
  jobId: string;
  runId: string | null;
  path: string;
  activationKind: PathActivationKind;
  evidenceRef: string | null;
  confidence: ActivationConfidence;
  phase: BehaviorPhase;
}

export interface RecordCommandActivationInput {
  commandId?: string;
  jobId: string;
  runId?: string | null;
  commandName: string;
  commandFamily?: string | null;
  workingDirectory?: string | null;
  argv?: string | null;
  argvHash?: string | null;
  argvSummary?: string | null;
  classification?: CommandClassification;
  evidenceRef?: string | null;
  status?: CommandStatus;
  phase?: BehaviorPhase;
  outputSize?: number;
}

export interface CommandActivationRecord {
  commandId: string;
  jobId: string;
  runId: string | null;
  commandName: string;
  commandFamily: string | null;
  workingDirectory: string | null;
  argvHash: string | null;
  argvSummary: string | null;
  classification: CommandClassification;
  evidenceRef: string | null;
  status: CommandStatus;
  phase: BehaviorPhase;
  outputSize: number;
  occurrenceCount: number;
}

export interface RecordDeploymentActionInput {
  deploymentId?: string;
  jobId: string;
  commandId: string;
  provider?: string | null;
  environment?: string | null;
  target?: string | null;
  status?: 'attempted' | 'succeeded' | 'failed' | 'unknown';
  evidenceRef?: string | null;
}

export interface DeploymentActionRecord {
  deploymentId: string;
  jobId: string;
  commandId: string;
  provider: string | null;
  environment: string | null;
  target: string | null;
  status: 'attempted' | 'succeeded' | 'failed' | 'unknown';
  evidenceRef: string | null;
}

export interface RecordZoneActivationInput {
  activationId?: string;
  jobId: string;
  runId?: string | null;
  zoneId: string;
  activationKind: string;
  sourceKind: ZoneActivationSourceKind;
  sourceId?: string | null;
  evidenceRef?: string | null;
  strength?: number;
  confidence?: ActivationConfidence;
}

export interface ZoneActivationRecord {
  activationId: string;
  jobId: string;
  runId: string | null;
  zoneId: string;
  activationKind: string;
  sourceKind: ZoneActivationSourceKind;
  sourceId: string | null;
  evidenceRef: string | null;
  strength: number;
  confidence: ActivationConfidence;
}

export interface ZoneCoactivationRecord {
  coactivationId: string;
  jobId: string;
  leftZoneId: string;
  rightZoneId: string;
  reason: string | null;
  strength: number;
}

export interface ZoneAssociationRecord {
  associationId: string;
  leftZoneId: string;
  rightZoneId: string;
  associationKind: string;
  weight: number;
  supportCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  unknownOutcomes: number;
  knownOutcomes: number;
  successRate: number | null;
  riskRate: number | null;
  leftActivationCount: number;
  rightActivationCount: number;
  coactivationSupport: number;
  normalizedWeight: number;
  jaccardWeight: number;
}

export interface JobActivationSummary {
  evidenceRefs: string[];
  paths: {
    total: number;
    byKind: Record<string, number>;
    byPhase: Record<string, number>;
    repeated: { path: string; activationKind: PathActivationKind; count: number }[];
  };
  commands: {
    total: number;
    byClassification: Record<string, number>;
    byStatus: Record<string, number>;
    byPhase: Record<string, number>;
    totalOutputSize: number;
    repeated: { commandName: string; argvSummary: string | null; count: number }[];
  };
  deployments: {
    total: number;
    byProvider: Record<string, number>;
    byEnvironment: Record<string, number>;
    byStatus: Record<string, number>;
  };
  zones: {
    total: number;
    uniqueZones: number;
    byZoneId: Record<string, number>;
    byActivationKind: Record<string, number>;
    bySourceKind: Record<string, number>;
    byConfidence: Record<string, number>;
    strengthByZoneId: Record<string, number>;
  };
  coactivations: {
    total: number;
  };
}

export interface JobActivationReport {
  job: JobRecord;
  summary: JobActivationSummary;
  pathActivations: PathActivationRecord[];
  commandActivations: CommandActivationRecord[];
  deploymentActions: DeploymentActionRecord[];
  zoneActivations: ZoneActivationRecord[];
  zoneCoactivations: ZoneCoactivationRecord[];
  associations: ZoneAssociationRecord[];
}

export interface NormalizeHooksInput {
  workspaceId?: string;
  outcome?: AssociationOutcome;
  limit?: number;
}

export interface NormalizeHooksResult {
  processedEvents: number;
  jobs: string[];
  pathActivations: number;
  commandActivations: number;
  deploymentActions: number;
  zoneActivations: number;
  zoneCoactivations: number;
  associations: number;
}

export interface DrainHookSpoolInput {
  spoolDir: string;
  limit?: number;
  normalize?: boolean;
  normalizeWorkspaceId?: string;
  normalizeOutcome?: AssociationOutcome;
}

export interface DrainHookSpoolResult {
  processedPackets: number;
  failedPackets: number;
  requeuedPackets: number;
  hookEvents: number;
  sessions: number;
  promptBoundaries: number;
  normalized: NormalizeHooksResult | null;
}
