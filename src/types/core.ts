export type GapStatus = 'observed' | 'inferred' | 'unknown' | 'contradicted';
export type ScopeKind = 'worktree' | 'repository' | 'channel';
export type ProtocolStatus = 'candidate' | 'active' | 'demoted';
export type CostBand = 'low' | 'medium' | 'high';
export type TraceKind = 'behavior' | 'protocol_application' | 'agent_response' | 'tool_use' | 'other';
export type PreferenceConfidence = 'low' | 'medium' | 'high';
export type ModelCallStatus = 'started' | 'completed' | 'failed';

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

export interface FixtureReplayDemoResult {
  ok: true;
  firstPromotionError: string | null;
  promoted: ProtocolRecord;
  overlay: ResolveProtocolResult;
  outcome: OutcomeRecord;
  credit: AdaptiveCredit;
}
