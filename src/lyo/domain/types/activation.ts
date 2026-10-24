export type JobStatus = 'started' | 'completed' | 'failed' | 'cancelled' | 'unknown';
export type PathActivationKind = 'file_read' | 'file_written' | 'file_created' | 'file_deleted' | 'file_diffed' | 'directory_listed' | 'unknown';
export type CommandClassification = 'test' | 'build' | 'lint' | 'format' | 'deploy' | 'database' | 'cloud' | 'package' | 'git' | 'inspect' | 'local_dev' | 'unknown';
export type CommandStatus = 'planned' | 'attempted' | 'succeeded' | 'failed' | 'unknown';
export type BehaviorPhase = 'explore' | 'fix' | 'validate' | 'unknown';
export type ActivationConfidence = 'low' | 'medium' | 'high';
export type ZoneActivationSourceKind = 'path' | 'command' | 'deployment' | 'manual' | 'inferred';
export type AssociationOutcome = 'positive' | 'negative' | 'unknown';

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

export interface EnsureNectrWorkspaceDefaultsInput {
  rootPath: string;
  workspaceId?: string;
  name?: string;
}

export interface EnsureNectrWorkspaceDefaultsResult {
  workspace: WorkspaceRecord;
  zones: ZoneRecord[];
}

export interface RecommendZoneAssociationsInput {
  workspaceId: string;
  seedZoneIds?: string[];
  limit?: number;
  includeNonPositive?: boolean;
}

export interface ZoneAssociationRecommendation {
  targetZoneId: string;
  targetZoneName: string;
  sourceZoneIds: string[];
  score: number;
  supportCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  unknownOutcomes: number;
  successRate: number | null;
  riskRate: number | null;
  localEvidence: boolean;
  evidenceJobIds: string[];
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
