import type { AssociationOutcome } from './activation.ts';

export interface HookEventInput {
  eventId?: string;
  sessionId: string;
  turnId?: string | null;
  eventName: string;
  cwd: string;
  model?: string | null;
  lyoVersion?: string | null;
  payload: unknown;
}

export interface HookEventRecord {
  eventId: string;
  sessionId: string;
  turnId: string | null;
  eventName: string;
  cwd: string;
  model: string | null;
  lyoVersion: string | null;
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

export interface RecordSessionEndedInput {
  sessionId: string;
  endedAt?: string;
}

export interface SessionEndRecord extends SessionRecord {
  endedAt: string | null;
}

export type PromptKind =
  | 'direction_setting'
  | 'debugging_request'
  | 'question'
  | 'correction'
  | 'refactoring_request'
  | 'task_instruction'
  | 'follow_up'
  | 'user_prompt'
  | 'assistant_response';

export interface RecordPromptBoundaryInput {
  sessionId: string;
  runId?: string | null;
  turnId?: string | null;
  role: string;
  kind: PromptKind;
  promptText?: string;
  promptHash?: string | null;
  promptLength?: number | null;
  promptRef?: string;
  summary?: string;
  responseSummary?: string;
  model?: string | null;
}

export interface TurnUserPrompt {
  promptId: string;
  promptIndex: number;
  promptKind: PromptKind;
  promptSummary: string | null;
}

export type PromptKindEvidenceMethod =
  | 'positional'
  | 'heuristic'
  | 'contextual'
  | 'correction_signal'
  | 'outcome';

export interface RecordPromptKindEvidenceInput {
  promptId: string;
  kind: PromptKind;
  logLr: number;
  method: PromptKindEvidenceMethod;
  evidenceRef?: string | null;
}

export interface PromptKindEvidenceRecord {
  evidenceId: string;
  promptId: string;
  kind: PromptKind;
  logLr: number;
  method: PromptKindEvidenceMethod;
}

export interface PromptKindBelief {
  kind: PromptKind;
  logOdds: number;
}

export interface PromptKindRecomputeResult {
  promptId: string;
  previousKind: PromptKind;
  currentKind: PromptKind;
  changed: boolean;
}

export interface PromptBoundaryRecord {
  promptId: string;
  sessionId: string;
  promptIndex: number;
  promptRole: string;
  promptKind: PromptKind;
  turnUserPrompts?: TurnUserPrompt[];
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
  exerciseAttempts: number;
  exerciseEvents: number;
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
