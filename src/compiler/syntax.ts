import type { CommandClassification, CommandStatus } from '../types/activation.ts';

export type TokenKind =
  | 'PROMPT'
  | 'INSPECT'
  | 'EDIT'
  | 'TEST'
  | 'BUILD'
  | 'GIT'
  | 'EXTERNAL'
  | 'STOP';

export interface TokenProvenance {
  eventId: string;
  eventName?: string;
  evidenceRef: string;
  sessionId: string;
  runId: string | null;
  cwd: string;
  createdAt: string;
  ordinal: number;
  toolUseId?: string | null;
}

export interface TelemetryToken {
  kind: TokenKind;
  provenance: TokenProvenance;
  command?: {
    name: string;
    argvSummary: string;
    status: CommandStatus;
    exitCode?: number | null;
    outputSize?: number;
  };
  paths?: string[];
}

export type EventKind =
  | 'boundary'
  | 'tool_use'
  | 'approval'
  | 'delegation'
  | 'model_call';

export type OperationKind =
  | 'boundary'
  | 'observe'
  | 'mutate_local'
  | 'mutate_external'
  | 'verify'
  | 'build'
  | 'version_control'
  | 'wait'
  | 'approve'
  | 'delegate'
  | 'model_call'
  | 'unknown';

export type IntentKind =
  | 'inspect'
  | 'implement'
  | 'verify'
  | 'build'
  | 'deploy'
  | 'version'
  | 'wait'
  | 'delegate'
  | 'unknown';

export type ResourceType =
  | 'local_file'
  | 'local_repo'
  | 'external_resource'
  | 'local_cache';

export interface ResourceRef {
  type: ResourceType;
  ref: string;
}

export type RiskClass =
  | 'none'
  | 'low'
  | 'destructive'
  | 'external_write'
  | 'credential_sensitive'
  | 'deploy'
  | 'unknown';

export type ActionStatus =
  | 'planned'
  | 'attempted'
  | 'allowed'
  | 'denied'
  | 'succeeded'
  | 'failed'
  | 'unknown';

export type FacetKind =
  | 'git'
  | 'test'
  | 'lint'
  | 'network'
  | 'cloud'
  | 'deploy'
  | 'database'
  | 'package'
  | 'destructive'
  | 'credential_sensitive'
  | 'read_only'
  | 'write'
  | 'healthcheck'
  | 'local'
  | 'external';

export interface CommandSummary {
  name: string;
  argvSummary: string;
  exitCode?: number | null;
  outputSize?: number;
}

export interface NormalizedAction {
  actionId: string;
  provenance: TokenProvenance;
  eventKind: EventKind;
  operation: OperationKind;
  intent: IntentKind;
  resources: {
    read: ResourceRef[];
    written: ResourceRef[];
  };
  risk: RiskClass;
  status: ActionStatus;
  facets: FacetKind[];
  confidence: 'low' | 'medium' | 'high';
  inference?: {
    rule: string;
    rationale?: string;
  };
  command?: CommandSummary;
}

export type EpisodePhase =
  | 'orientation'
  | 'implementation'
  | 'debugging'
  | 'failed_verification'
  | 'passed_verification'
  | 'unverified_claim_candidate'
  | 'unknown';

export interface RunEpisode {
  episodeId: string;
  runId: string;
  phase: EpisodePhase;
  startedAfter: string; // eventId of preceding boundary or start
  endedAt: string;      // eventId of token ending the episode
  commands: string[];   // summaries of commands run in this episode
  paths: string[];      // unique files touched
  tokenIds: string[];   // list of token eventIds grouped into this episode
}

export interface RunTelemetryAst {
  runId: string;
  actions: NormalizedAction[];
  tokens: TelemetryToken[];
  episodes: RunEpisode[];
}
