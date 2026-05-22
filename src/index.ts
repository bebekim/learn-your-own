import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  classifyCommand,
  classifyHookEvent,
  phaseForCommand,
  phaseForPathActivation,
  stringPayloadSize,
  summarizeCommand,
} from './hooks/normalizer.ts';
import { drainJsonSpoolPackets, writeJsonSpoolPacket } from './hooks/spool.ts';
import { createKernel } from './ledger.ts';
import type { CreateKernelInput, LearningKernel } from './ledger.ts';

export { closeKernel, createKernel } from './ledger.ts';
export type { CreateKernelInput, LearningKernel } from './ledger.ts';

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

export interface CodexHookInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  model?: string | null;
  turn_id?: string;
  prompt?: string;
  source?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  stop_hook_active?: boolean;
  last_assistant_message?: string | null;
}

export interface CodexHookOptions {
  channel?: string;
  taskShape?: string;
  promptDir?: string;
  normalizeOnStop?: boolean;
  normalizeOnToolUse?: boolean;
  normalizeWorkspaceId?: string;
  normalizeOutcome?: AssociationOutcome;
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

export interface CodexHookOutput {
  continue?: true;
  hookSpecificOutput?: {
    hookEventName: string;
    additionalContext: string;
  };
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

interface CodexHookObservation {
  eventName: string;
  sessionId: string;
  turnId: string | null;
  cwd: string;
  hookEvent: HookEventInput;
  session: RecordSessionStartedInput | null;
  promptBoundary: RecordPromptBoundaryInput | null;
}

interface HookSpoolPacket {
  version: 1;
  kind: 'codex-hook-event';
  recordedAt: string;
  hookEvent: HookEventInput;
  session: RecordSessionStartedInput | null;
  promptBoundary: RecordPromptBoundaryInput | null;
}

const ISO_NOW = () => new Date().toISOString();
const DEFAULT_HOOK_RESPONSE_HASH_LIMIT = 200_000;

export function initLedger(kernel: LearningKernel): LearningKernel {
  kernel.db.exec(`
    create table if not exists runs (
      run_id text primary key,
      task_shape text not null,
      channel text not null,
      status text not null,
      token_cost integer default 0,
      created_at text not null
    );

    create table if not exists gaps (
      gap_id text primary key,
      run_id text not null references runs(run_id),
      kind text not null,
      summary text not null,
      evidence_ref text not null,
      status text not null check (status in ('observed', 'inferred', 'unknown', 'contradicted')),
      created_at text not null
    );

    create table if not exists protocols (
      protocol_id text primary key,
      title text not null,
      scope_kind text not null check (scope_kind in ('worktree', 'repository', 'channel')),
      scope_value text not null,
      action text not null,
      proposed_by text,
      promoted_by text,
      status text not null check (status in ('candidate', 'active', 'demoted')),
      proposed_at text not null,
      promoted_at text
    );

    create table if not exists protocol_evidence (
      protocol_id text not null references protocols(protocol_id),
      gap_id text not null references gaps(gap_id),
      attached_at text not null,
      primary key (protocol_id, gap_id)
    );

    create table if not exists learning_traces (
      trace_id text primary key,
      run_id text,
      kind text not null check (kind in ('behavior', 'protocol_application', 'agent_response', 'tool_use', 'other')),
      summary text not null,
      ref text,
      payload_json text,
      created_at text not null
    );

    create table if not exists preference_pairs (
      preference_id text primary key,
      context_hash text not null,
      chosen_trace_id text not null references learning_traces(trace_id),
      rejected_trace_id text not null references learning_traces(trace_id),
      reason text not null,
      evidence_ref text not null,
      recorded_by text,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      created_at text not null,
      check (chosen_trace_id <> rejected_trace_id)
    );

    create table if not exists protocol_preferences (
      protocol_id text not null references protocols(protocol_id),
      preference_id text not null references preference_pairs(preference_id),
      attached_at text not null,
      primary key (protocol_id, preference_id)
    );

    create table if not exists deliveries (
      delivery_id text primary key,
      protocol_id text not null references protocols(protocol_id),
      run_id text,
      task_shape text not null,
      channel text not null,
      delivered_at text not null
    );

    create table if not exists outcomes (
      outcome_id text primary key,
      delivery_id text not null references deliveries(delivery_id),
      run_id text,
      followed integer not null check (followed in (0, 1)),
      defect_repeated integer not null check (defect_repeated in (0, 1)),
      verified integer not null check (verified in (0, 1)),
      cost_band text not null check (cost_band in ('low', 'medium', 'high')),
      credit_delta integer not null,
      recorded_at text not null
    );

	    create table if not exists hook_events (
	      event_id text primary key,
	      session_id text not null,
      turn_id text,
      event_name text not null,
      cwd text not null,
      model text,
	      payload_json text not null,
	      created_at text not null
	    );

    create table if not exists hook_normalizations (
      event_id text primary key references hook_events(event_id),
      job_id text not null,
      normalized_at text not null
    );

	    create table if not exists agent_sessions (
	      session_id text primary key,
	      workspace_scope text not null default 'local',
	      repo_path text,
	      branch text,
	      platform text not null default 'agent',
	      model text,
	      started_at text not null,
	      ended_at text,
	      updated_at text not null
	    );

    create table if not exists session_prompts (
	      prompt_id text primary key,
	      session_id text not null references agent_sessions(session_id),
	      run_id text,
	      turn_id text,
	      prompt_index integer not null,
	      prompt_role text not null,
	      prompt_kind text not null,
	      prompt_sha256 text,
	      prompt_ref text,
	      prompt_summary text,
	      response_summary text,
	      model text,
	      recorded_at text not null
	    );

    create table if not exists model_calls (
      call_id text primary key,
      session_id text,
      run_id text,
      provider text not null,
      model text not null,
      model_lane text not null,
      prompt_ref text,
      prompt_sha256 text,
      prompt_summary text,
      input_tokens integer,
      output_tokens integer,
      total_tokens integer,
      estimated_cost real,
      latency_ms integer,
      status text not null check (status in ('started', 'completed', 'failed')),
      error_summary text,
      created_at text not null,
      updated_at text not null
    );

	    create table if not exists run_goals (
	      run_id text primary key,
	      goal text not null,
	      success_criteria text,
	      stop_condition text,
	      expected_process text,
	      risk_class text,
	      created_at text not null
	    );

	    create table if not exists run_execution_contexts (
	      run_id text primary key,
	      task_shape text,
	      functional_axis text,
	      domain_axis text,
	      stack text,
	      tools_used text,
	      files_touched text,
	      commands_run text,
	      created_at text not null,
	      updated_at text not null
	    );

	    create table if not exists run_verification_results (
	      run_id text primary key,
	      tests_run text,
	      checks_run text,
	      verification_passed integer check (verification_passed in (0, 1)),
	      review_verdict text,
	      defects text,
	      human_corrections text,
	      missing_ingredients text,
	      guardrail_result text,
	      created_at text not null,
	      updated_at text not null
	    );

    create table if not exists workspaces (
      workspace_id text primary key,
      root_path text not null unique,
      name text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists zones (
      zone_id text primary key,
      workspace_id text not null references workspaces(workspace_id),
      parent_zone_id text references zones(zone_id),
      zone_kind text not null,
      path_glob text,
      name text not null,
      description text,
      created_at text not null,
      updated_at text not null,
      unique (workspace_id, name)
    );

    create table if not exists jobs (
      job_id text primary key,
      workspace_id text not null references workspaces(workspace_id),
      run_id text,
      task_shape text,
      summary text,
      source_ref text,
      status text not null check (status in ('started', 'completed', 'failed', 'cancelled', 'unknown')),
      created_at text not null,
      completed_at text,
      updated_at text not null
    );

    create table if not exists path_activations (
      activation_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      path text not null,
      activation_kind text not null check (
        activation_kind in (
          'file_read',
          'file_written',
          'file_created',
          'file_deleted',
          'file_diffed',
          'directory_listed',
          'unknown'
        )
      ),
      evidence_ref text,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      phase text not null default 'unknown',
      created_at text not null
    );

    create table if not exists command_activations (
      command_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      command_name text not null,
      command_family text,
      working_directory text,
      argv_hash text,
      argv_summary text,
      classification text not null check (
        classification in (
          'test',
          'build',
          'lint',
          'format',
          'deploy',
          'database',
          'cloud',
          'package',
          'git',
          'inspect',
          'local_dev',
          'unknown'
        )
      ),
      evidence_ref text,
      status text not null check (status in ('planned', 'attempted', 'succeeded', 'failed', 'unknown')),
      phase text not null default 'unknown',
      output_size integer not null default 0,
      occurrence_count integer not null default 1,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists deployment_actions (
      deployment_id text primary key,
      job_id text not null references jobs(job_id),
      command_id text not null references command_activations(command_id),
      provider text,
      environment text,
      target text,
      status text not null check (status in ('attempted', 'succeeded', 'failed', 'unknown')),
      evidence_ref text,
      created_at text not null,
      completed_at text
    );

    create table if not exists zone_activations (
      activation_id text primary key,
      job_id text not null references jobs(job_id),
      run_id text,
      zone_id text not null references zones(zone_id),
      activation_kind text not null,
      source_kind text not null check (
        source_kind in ('path', 'command', 'deployment', 'manual', 'inferred')
      ),
      source_id text,
      evidence_ref text,
      strength real not null default 1.0,
      confidence text not null check (confidence in ('low', 'medium', 'high')),
      created_at text not null,
      unique (job_id, zone_id, source_kind, source_id)
    );

    create table if not exists zone_coactivations (
      coactivation_id text primary key,
      job_id text not null references jobs(job_id),
      left_zone_id text not null references zones(zone_id),
      right_zone_id text not null references zones(zone_id),
      reason text,
      strength real not null default 1.0,
      created_at text not null,
      check (left_zone_id <> right_zone_id),
      unique (job_id, left_zone_id, right_zone_id)
    );

    create table if not exists zone_associations (
      association_id text primary key,
      left_zone_id text not null references zones(zone_id),
      right_zone_id text not null references zones(zone_id),
      association_kind text not null,
      weight real not null default 0,
      support_count integer not null default 0,
      positive_outcomes integer not null default 0,
      negative_outcomes integer not null default 0,
      last_observed_at text,
      created_at text not null,
      updated_at text not null,
      check (left_zone_id <> right_zone_id),
      unique (left_zone_id, right_zone_id, association_kind)
    );

    create table if not exists zone_association_observations (
      association_id text not null references zone_associations(association_id),
      job_id text not null references jobs(job_id),
      outcome text not null check (outcome in ('positive', 'negative', 'unknown')),
      observed_at text not null,
      primary key (association_id, job_id)
    );
	  `);
  ensureColumn(kernel, 'path_activations', 'phase', "text not null default 'unknown'");
  ensureColumn(kernel, 'command_activations', 'phase', "text not null default 'unknown'");
  ensureColumn(kernel, 'command_activations', 'output_size', 'integer not null default 0');
  ensureColumn(kernel, 'command_activations', 'occurrence_count', 'integer not null default 1');
  return kernel;
}

export function recordRun(kernel: LearningKernel, input: RecordRunInput): RunRecord {
  requireFields(input, ['runId', 'taskShape', 'channel', 'status']);
  kernel.db.prepare(`
    insert into runs (run_id, task_shape, channel, status, token_cost, created_at)
    values (?, ?, ?, ?, ?, ?)
  `).run(
    input.runId,
    input.taskShape,
    input.channel,
    input.status,
    input.tokenCost ?? 0,
    ISO_NOW()
  );
  return getRun(kernel, input.runId);
}

export function finishRun(kernel: LearningKernel, input: FinishRunInput): RunRecord {
  requireFields(input, ['runId', 'status']);
  ensureRun(kernel, input.runId);
  kernel.db.prepare(`
    update runs
    set status = ?, token_cost = coalesce(?, token_cost)
    where run_id = ?
  `).run(input.status, input.tokenCost ?? null, input.runId);
  return getRun(kernel, input.runId);
}

export function recordGap(kernel: LearningKernel, input: RecordGapInput): GapRecord {
  requireFields(input, ['runId', 'kind', 'summary', 'evidenceRef', 'status']);
  const gapId = input.gapId ?? `gap-${input.runId}-${input.kind}`;
  kernel.db.prepare(`
    insert into gaps (gap_id, run_id, kind, summary, evidence_ref, status, created_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    gapId,
    input.runId,
    input.kind,
    input.summary,
    input.evidenceRef,
    input.status,
    ISO_NOW()
  );
  return getGap(kernel, gapId);
}

export function proposeProtocol(kernel: LearningKernel, input: ProposeProtocolInput): ProtocolRecord {
  requireFields(input, ['protocolId', 'title', 'scopeKind', 'scopeValue', 'action']);
  if (input.action.trim().length < 12) {
    throw new Error('protocol action must be specific enough to execute');
  }
  kernel.db.prepare(`
    insert into protocols (
      protocol_id, title, scope_kind, scope_value, action, proposed_by,
      status, proposed_at
    )
    values (?, ?, ?, ?, ?, ?, 'candidate', ?)
  `).run(
    input.protocolId,
    input.title,
    input.scopeKind,
    input.scopeValue,
    input.action,
    input.proposedBy ?? null,
    ISO_NOW()
  );
  return getProtocol(kernel, input.protocolId);
}

export function attachEvidence(kernel: LearningKernel, { protocolId, gapId }: AttachEvidenceInput): AttachEvidenceInput {
  requireFields({ protocolId, gapId }, ['protocolId', 'gapId']);
  ensureProtocol(kernel, protocolId);
  ensureGap(kernel, gapId);
  kernel.db.prepare(`
    insert or ignore into protocol_evidence (protocol_id, gap_id, attached_at)
    values (?, ?, ?)
  `).run(protocolId, gapId, ISO_NOW());
  return { protocolId, gapId };
}

export function promoteProtocol(kernel: LearningKernel, input: PromoteProtocolInput): ProtocolRecord {
  requireFields(input, ['protocolId']);
  const protocol = ensureProtocol(kernel, input.protocolId);
  if (protocol.status !== 'candidate') {
    throw new Error(`protocol ${input.protocolId} is not a candidate`);
  }

  for (const gapId of input.evidenceIds ?? []) {
    attachEvidence(kernel, { protocolId: input.protocolId, gapId });
  }

  const evidenceRow = kernel.db.prepare(`
    select count(*) as count
    from protocol_evidence pe
    join gaps g on g.gap_id = pe.gap_id
    where pe.protocol_id = ? and g.status = 'observed'
  `).get(input.protocolId) as { count: number };
  const evidenceCount = evidenceRow.count;

  if (evidenceCount < 2) {
    throw new Error(`promote_protocol requires at least 2 evidence items; found ${evidenceCount}`);
  }
  if (!protocol.scopeKind || !protocol.scopeValue) {
    throw new Error('promote_protocol requires explicit scope');
  }
  if (!protocol.action) {
    throw new Error('promote_protocol requires an action');
  }

  kernel.db.prepare(`
    update protocols
    set status = 'active', promoted_by = ?, promoted_at = ?
    where protocol_id = ?
  `).run(input.promotedBy ?? null, ISO_NOW(), input.protocolId);
  return getProtocol(kernel, input.protocolId);
}

export function recordTrace(kernel: LearningKernel, input: RecordTraceInput): TraceRecord {
  requireFields(input, ['kind', 'summary']);
  const traceId = input.traceId ?? `trace-${sha256(JSON.stringify({
    runId: input.runId ?? null,
    kind: input.kind,
    summary: input.summary,
    ref: input.ref ?? null,
    payload: input.payload ?? null,
  })).slice(0, 24)}`;
  kernel.db.prepare(`
    insert into learning_traces (
      trace_id, run_id, kind, summary, ref, payload_json, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    traceId,
    input.runId ?? null,
    input.kind,
    input.summary,
    input.ref ?? null,
    input.payload === undefined ? null : JSON.stringify(input.payload),
    ISO_NOW()
  );
  return getTrace(kernel, traceId);
}

export function recordPreferencePair(kernel: LearningKernel, input: RecordPreferencePairInput): PreferencePairRecord {
  requireFields(input, ['chosenTraceId', 'rejectedTraceId', 'reason', 'evidenceRef']);
  if (input.chosenTraceId === input.rejectedTraceId) {
    throw new Error('preference pair requires distinct chosen and rejected traces');
  }
  if (input.reason.trim().length < 12) {
    throw new Error('preference reason must be specific enough to audit');
  }
  ensureTrace(kernel, input.chosenTraceId);
  ensureTrace(kernel, input.rejectedTraceId);
  const contextHash = input.contextHash ?? sha256(input.context ?? `${input.chosenTraceId}>${input.rejectedTraceId}`);
  const preferenceId = input.preferenceId ?? `pref-${contextHash.slice(0, 16)}-${sha256(`${input.chosenTraceId}:${input.rejectedTraceId}:${input.reason}`).slice(0, 8)}`;
  kernel.db.prepare(`
    insert into preference_pairs (
      preference_id, context_hash, chosen_trace_id, rejected_trace_id,
      reason, evidence_ref, recorded_by, confidence, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    preferenceId,
    contextHash,
    input.chosenTraceId,
    input.rejectedTraceId,
    input.reason,
    input.evidenceRef,
    input.recordedBy ?? null,
    input.confidence ?? 'medium',
    ISO_NOW()
  );
  return getPreferencePair(kernel, preferenceId);
}

export function recordModelCall(kernel: LearningKernel, input: RecordModelCallInput): ModelCallRecord {
  requireFields(input, ['provider', 'model', 'modelLane', 'status']);
  const promptHash = input.promptHash ?? (input.promptText === undefined ? null : sha256(input.promptText));
  const inputTokens = input.inputTokens ?? null;
  const outputTokens = input.outputTokens ?? null;
  const totalTokens = input.totalTokens ?? (
    inputTokens === null || outputTokens === null ? null : inputTokens + outputTokens
  );
  const callId = input.callId ?? `model-call-${sha256(JSON.stringify({
    sessionId: input.sessionId ?? null,
    runId: input.runId ?? null,
    provider: input.provider,
    model: input.model,
    promptHash,
    createdAt: ISO_NOW(),
  })).slice(0, 24)}`;

  kernel.db.prepare(`
    insert into model_calls (
      call_id, session_id, run_id, provider, model, model_lane, prompt_ref,
      prompt_sha256, prompt_summary, input_tokens, output_tokens, total_tokens,
      estimated_cost, latency_ms, status, error_summary, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    callId,
    input.sessionId ?? null,
    input.runId ?? null,
    input.provider,
    input.model,
    input.modelLane,
    input.promptRef ?? null,
    promptHash,
    input.promptSummary ?? null,
    inputTokens,
    outputTokens,
    totalTokens,
    input.estimatedCost ?? null,
    input.latencyMs ?? null,
    input.status,
    input.errorSummary ?? null,
    ISO_NOW(),
    ISO_NOW()
  );

  return getModelCall(kernel, callId);
}

export function recordWorkspace(kernel: LearningKernel, input: WorkspaceRecordInput): WorkspaceRecord {
  requireFields(input, ['rootPath']);
  const rootPath = resolve(input.rootPath);
  const workspaceId = input.workspaceId ?? `workspace-${sha256(rootPath).slice(0, 16)}`;
  const name = input.name ?? basename(rootPath);
  kernel.db.prepare(`
    insert into workspaces (workspace_id, root_path, name, created_at, updated_at)
    values (?, ?, ?, ?, ?)
    on conflict(workspace_id) do update set
      root_path = excluded.root_path,
      name = excluded.name,
      updated_at = excluded.updated_at
  `).run(workspaceId, rootPath, name, ISO_NOW(), ISO_NOW());
  return getWorkspace(kernel, workspaceId);
}

export function recordZone(kernel: LearningKernel, input: RecordZoneInput): ZoneRecord {
  requireFields(input, ['workspaceId', 'zoneKind', 'name']);
  ensureWorkspace(kernel, input.workspaceId);
  if (input.parentZoneId) ensureZone(kernel, input.parentZoneId);
  const zoneId = input.zoneId ?? `zone-${sha256(`${input.workspaceId}:${input.name}`).slice(0, 16)}`;
  kernel.db.prepare(`
    insert into zones (
      zone_id, workspace_id, parent_zone_id, zone_kind, path_glob, name,
      description, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(zone_id) do update set
      parent_zone_id = excluded.parent_zone_id,
      zone_kind = excluded.zone_kind,
      path_glob = excluded.path_glob,
      name = excluded.name,
      description = excluded.description,
      updated_at = excluded.updated_at
  `).run(
    zoneId,
    input.workspaceId,
    input.parentZoneId ?? null,
    input.zoneKind,
    input.pathGlob ?? null,
    input.name,
    input.description ?? null,
    ISO_NOW(),
    ISO_NOW()
  );
  return getZone(kernel, zoneId);
}

export function recordJob(kernel: LearningKernel, input: RecordJobInput): JobRecord {
  requireFields(input, ['jobId', 'workspaceId']);
  ensureWorkspace(kernel, input.workspaceId);
  kernel.db.prepare(`
    insert into jobs (
      job_id, workspace_id, run_id, task_shape, summary, source_ref, status,
      created_at, completed_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, null, ?)
    on conflict(job_id) do update set
      run_id = coalesce(excluded.run_id, jobs.run_id),
      task_shape = coalesce(excluded.task_shape, jobs.task_shape),
      summary = coalesce(excluded.summary, jobs.summary),
      source_ref = coalesce(excluded.source_ref, jobs.source_ref),
      status = excluded.status,
      completed_at = case
        when excluded.status in ('completed', 'failed', 'cancelled') then excluded.updated_at
        else jobs.completed_at
      end,
      updated_at = excluded.updated_at
  `).run(
    input.jobId,
    input.workspaceId,
    input.runId ?? null,
    input.taskShape ?? null,
    input.summary ?? null,
    input.sourceRef ?? null,
    input.status ?? 'started',
    ISO_NOW(),
    ISO_NOW()
  );
  return getJob(kernel, input.jobId);
}

export function finishJob(kernel: LearningKernel, input: FinishJobInput): JobRecord {
  requireFields(input, ['jobId', 'status']);
  ensureJob(kernel, input.jobId);
  kernel.db.prepare(`
    update jobs
    set status = ?,
      completed_at = case when ? in ('completed', 'failed', 'cancelled') then ? else completed_at end,
      updated_at = ?
    where job_id = ?
  `).run(input.status, input.status, ISO_NOW(), ISO_NOW(), input.jobId);
  return getJob(kernel, input.jobId);
}

export function recordPathActivation(kernel: LearningKernel, input: RecordPathActivationInput): PathActivationRecord {
  requireFields(input, ['jobId', 'path', 'activationKind']);
  ensureJob(kernel, input.jobId);
  const activationId = input.activationId ?? `path-act-${sha256(`${input.jobId}:${input.path}:${input.activationKind}:${input.evidenceRef ?? ''}`).slice(0, 20)}`;
  const phase = input.phase ?? phaseForPathActivation(input.activationKind);
  kernel.db.prepare(`
    insert or ignore into path_activations (
      activation_id, job_id, run_id, path, activation_kind, evidence_ref,
      confidence, phase, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activationId,
    input.jobId,
    input.runId ?? null,
    normalizeRelativePath(input.path),
    input.activationKind,
    input.evidenceRef ?? null,
    input.confidence ?? 'medium',
    phase,
    ISO_NOW()
  );
  return getPathActivation(kernel, activationId);
}

export function recordCommandActivation(kernel: LearningKernel, input: RecordCommandActivationInput): CommandActivationRecord {
  requireFields(input, ['jobId', 'commandName']);
  ensureJob(kernel, input.jobId);
  const argvHash = input.argvHash ?? (input.argv ? sha256(input.argv) : null);
  const argvSummary = input.argvSummary ?? (input.argv ? summarizeCommand(input.argv) : null);
  const classification = input.classification ?? classifyCommand(input.commandName, argvSummary ?? input.argv ?? input.commandName);
  const phase = input.phase ?? phaseForCommand(classification, input.commandName, argvSummary ?? input.argv ?? input.commandName);
  const commandId = input.commandId ?? `cmd-act-${sha256(`${input.jobId}:${input.commandName}:${argvHash ?? argvSummary ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert into command_activations (
      command_id, job_id, run_id, command_name, command_family, working_directory,
      argv_hash, argv_summary, classification, evidence_ref, status, phase,
      output_size, occurrence_count, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    on conflict(command_id) do update set
      status = case
        when excluded.status = 'failed' then 'failed'
        when command_activations.status = 'failed' then command_activations.status
        when excluded.status = 'succeeded' then 'succeeded'
        when command_activations.status = 'succeeded' then command_activations.status
        when excluded.status = 'attempted' then 'attempted'
        else excluded.status
      end,
      phase = excluded.phase,
      output_size = max(command_activations.output_size, excluded.output_size),
      occurrence_count = command_activations.occurrence_count + 1,
      updated_at = excluded.updated_at
  `).run(
    commandId,
    input.jobId,
    input.runId ?? null,
    input.commandName,
    input.commandFamily ?? input.commandName,
    input.workingDirectory ?? null,
    argvHash,
    argvSummary,
    classification,
    input.evidenceRef ?? null,
    input.status ?? 'attempted',
    phase,
    input.outputSize ?? 0,
    ISO_NOW(),
    ISO_NOW()
  );
  return getCommandActivation(kernel, commandId);
}

export function recordDeploymentAction(kernel: LearningKernel, input: RecordDeploymentActionInput): DeploymentActionRecord {
  requireFields(input, ['jobId', 'commandId']);
  ensureJob(kernel, input.jobId);
  ensureCommandActivation(kernel, input.commandId);
  const deploymentId = input.deploymentId ?? `deploy-${sha256(`${input.jobId}:${input.commandId}:${input.target ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert into deployment_actions (
      deployment_id, job_id, command_id, provider, environment, target, status,
      evidence_ref, created_at, completed_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(deployment_id) do update set
      status = excluded.status,
      completed_at = excluded.completed_at
  `).run(
    deploymentId,
    input.jobId,
    input.commandId,
    input.provider ?? null,
    input.environment ?? null,
    input.target ?? null,
    input.status ?? 'attempted',
    input.evidenceRef ?? null,
    ISO_NOW(),
    input.status && ['succeeded', 'failed'].includes(input.status) ? ISO_NOW() : null
  );
  return getDeploymentAction(kernel, deploymentId);
}

export function recordZoneActivation(kernel: LearningKernel, input: RecordZoneActivationInput): ZoneActivationRecord {
  requireFields(input, ['jobId', 'zoneId', 'activationKind', 'sourceKind']);
  ensureJob(kernel, input.jobId);
  ensureZone(kernel, input.zoneId);
  const activationId = input.activationId ?? `zone-act-${sha256(`${input.jobId}:${input.zoneId}:${input.sourceKind}:${input.sourceId ?? ''}`).slice(0, 20)}`;
  kernel.db.prepare(`
    insert or ignore into zone_activations (
      activation_id, job_id, run_id, zone_id, activation_kind, source_kind,
      source_id, evidence_ref, strength, confidence, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    activationId,
    input.jobId,
    input.runId ?? null,
    input.zoneId,
    input.activationKind,
    input.sourceKind,
    input.sourceId ?? null,
    input.evidenceRef ?? null,
    input.strength ?? 1,
    input.confidence ?? 'medium',
    ISO_NOW()
  );
  return getZoneActivation(kernel, activationId);
}

export function deriveZoneActivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneActivationRecord[] {
  const job = ensureJob(kernel, jobId);
  const zones = kernel.db.prepare(`
    select
      zone_id as zoneId,
      workspace_id as workspaceId,
      parent_zone_id as parentZoneId,
      zone_kind as zoneKind,
      path_glob as pathGlob,
      name,
      description
    from zones
    where workspace_id = ?
  `).all(job.workspaceId) as ZoneRecord[];
  const created: ZoneActivationRecord[] = [];
  const pathActivations = listPathActivations(kernel, jobId);
  for (const activation of pathActivations) {
    for (const zone of zones) {
      if (zone.pathGlob && pathMatchesGlob(activation.path, zone.pathGlob)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: activation.activationKind,
          sourceKind: 'path',
          sourceId: activation.activationId,
          evidenceRef: activation.evidenceRef,
          strength: activation.activationKind === 'file_written' ? 1.5 : 1,
          confidence: activation.confidence,
        }));
      }
    }
  }
  const commandActivations = listCommandActivations(kernel, jobId);
  for (const activation of commandActivations) {
    for (const zone of zones) {
      if (commandMatchesZone(activation, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: `command_${activation.classification}`,
          sourceKind: 'command',
          sourceId: activation.commandId,
          evidenceRef: activation.evidenceRef,
          strength: activation.classification === 'deploy' ? 2 : 1,
          confidence: 'medium',
        }));
      }
    }
  }
  const deploymentActions = listDeploymentActions(kernel, jobId);
  for (const action of deploymentActions) {
    for (const zone of zones) {
      if (deploymentMatchesZone(action, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          zoneId: zone.zoneId,
          activationKind: 'deployment_action',
          sourceKind: 'deployment',
          sourceId: action.deploymentId,
          evidenceRef: action.evidenceRef,
          strength: 2,
          confidence: 'medium',
        }));
      }
    }
  }
  return created;
}

export function deriveZoneCoactivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneCoactivationRecord[] {
  ensureJob(kernel, jobId);
  const activations = kernel.db.prepare(`
    select zone_id as zoneId, max(strength) as strength
    from zone_activations
    where job_id = ?
    group by zone_id
    order by zone_id asc
  `).all(jobId) as { zoneId: string; strength: number }[];
  const records: ZoneCoactivationRecord[] = [];
  for (let i = 0; i < activations.length; i += 1) {
    for (let j = i + 1; j < activations.length; j += 1) {
      const left = activations[i];
      const right = activations[j];
      const [leftZoneId, rightZoneId] = sortedPair(left.zoneId, right.zoneId);
      const strength = Math.min(Number(left.strength), Number(right.strength));
      const coactivationId = `coact-${sha256(`${jobId}:${leftZoneId}:${rightZoneId}`).slice(0, 20)}`;
      kernel.db.prepare(`
        insert or ignore into zone_coactivations (
          coactivation_id, job_id, left_zone_id, right_zone_id, reason,
          strength, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        coactivationId,
        jobId,
        leftZoneId,
        rightZoneId,
        'zones activated in the same job',
        strength,
        ISO_NOW()
      );
      records.push(getZoneCoactivation(kernel, coactivationId));
    }
  }
  return records;
}

export function updateZoneAssociationsFromJob(
  kernel: LearningKernel,
  { jobId, outcome = 'unknown' }: { jobId: string; outcome?: AssociationOutcome }
): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const coactivations = listZoneCoactivations(kernel, jobId);
  const records: ZoneAssociationRecord[] = [];
  for (const coactivation of coactivations) {
    const associationKind = 'coactivation';
    const associationId = `assoc-${sha256(`${coactivation.leftZoneId}:${coactivation.rightZoneId}:${associationKind}`).slice(0, 20)}`;
    kernel.db.prepare(`
      insert into zone_associations (
        association_id, left_zone_id, right_zone_id, association_kind, weight,
        support_count, positive_outcomes, negative_outcomes, last_observed_at,
        created_at, updated_at
      )
      values (?, ?, ?, ?, 0, 0, 0, 0, null, ?, ?)
      on conflict(left_zone_id, right_zone_id, association_kind) do nothing
    `).run(
      associationId,
      coactivation.leftZoneId,
      coactivation.rightZoneId,
      associationKind,
      ISO_NOW(),
      ISO_NOW()
    );
    const observation = kernel.db.prepare(`
      insert or ignore into zone_association_observations (
        association_id, job_id, outcome, observed_at
      )
      values (?, ?, ?, ?)
    `).run(associationId, jobId, outcome, ISO_NOW());
    if (observation.changes === 0) {
      records.push(getZoneAssociation(kernel, coactivation.leftZoneId, coactivation.rightZoneId, associationKind));
      continue;
    }
    kernel.db.prepare(`
      update zone_associations
      set support_count = support_count + 1,
        positive_outcomes = positive_outcomes + ?,
        negative_outcomes = negative_outcomes + ?,
        weight = support_count + 1 + positive_outcomes + ? - negative_outcomes - ?,
        last_observed_at = ?,
        updated_at = ?
      where association_id = ?
    `).run(
      outcome === 'positive' ? 1 : 0,
      outcome === 'negative' ? 1 : 0,
      outcome === 'positive' ? 1 : 0,
      outcome === 'negative' ? 1 : 0,
      ISO_NOW(),
      ISO_NOW(),
      associationId
    );
    records.push(getZoneAssociation(kernel, coactivation.leftZoneId, coactivation.rightZoneId, associationKind));
  }
  return records;
}

export function getJobActivationReport(kernel: LearningKernel, { jobId }: { jobId: string }): JobActivationReport {
  const job = ensureJob(kernel, jobId);
  const pathActivations = listPathActivations(kernel, jobId);
  const commandActivations = listCommandActivations(kernel, jobId);
  const deploymentActions = listDeploymentActions(kernel, jobId);
  const zoneActivations = listZoneActivations(kernel, jobId);
  const zoneCoactivations = listZoneCoactivations(kernel, jobId);
  const associations = listJobZoneAssociations(kernel, jobId);
  return {
    job,
    summary: summarizeJobActivations({
      pathActivations,
      commandActivations,
      deploymentActions,
      zoneActivations,
      zoneCoactivations,
    }),
    pathActivations,
    commandActivations,
    deploymentActions,
    zoneActivations,
    zoneCoactivations,
    associations,
  };
}

export function getZoneAssociationReport(
  kernel: LearningKernel,
  { workspaceId, zoneId, limit = 20 }: { workspaceId: string; zoneId?: string; limit?: number }
): ZoneAssociationRecord[] {
  ensureWorkspace(kernel, workspaceId);
  const params: (string | number)[] = [workspaceId, workspaceId];
  let zoneFilter = '';
  if (zoneId) {
    ensureZone(kernel, zoneId);
    zoneFilter = 'and (za.left_zone_id = ? or za.right_zone_id = ?)';
    params.push(zoneId, zoneId);
  }
  params.push(limit);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_associations za
    join zones zl on zl.zone_id = za.left_zone_id
    join zones zr on zr.zone_id = za.right_zone_id
    where zl.workspace_id = ? and zr.workspace_id = ?
      ${zoneFilter}
    order by za.weight desc, za.support_count desc, za.updated_at desc
    limit ?
  `).all(...params) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
}

function listJobZoneAssociations(kernel: LearningKernel, jobId: string): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_coactivations zc
    join zone_associations za
      on za.left_zone_id = zc.left_zone_id
      and za.right_zone_id = zc.right_zone_id
      and za.association_kind = 'coactivation'
    where zc.job_id = ?
    order by za.weight desc, za.support_count desc, za.updated_at desc
  `).all(jobId) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
}

function summarizeJobActivations({
  pathActivations,
  commandActivations,
  deploymentActions,
  zoneActivations,
  zoneCoactivations,
}: {
  pathActivations: PathActivationRecord[];
  commandActivations: CommandActivationRecord[];
  deploymentActions: DeploymentActionRecord[];
  zoneActivations: ZoneActivationRecord[];
  zoneCoactivations: ZoneCoactivationRecord[];
}): JobActivationSummary {
  return {
    evidenceRefs: uniqueSorted([
      ...pathActivations.map((activation) => activation.evidenceRef),
      ...commandActivations.map((activation) => activation.evidenceRef),
      ...deploymentActions.map((activation) => activation.evidenceRef),
      ...zoneActivations.map((activation) => activation.evidenceRef),
    ]),
    paths: {
      total: pathActivations.length,
      byKind: countBy(pathActivations, (activation) => activation.activationKind),
      byPhase: countBy(pathActivations, (activation) => activation.phase),
      repeated: repeatedPathActivations(pathActivations),
    },
    commands: {
      total: commandActivations.length,
      byClassification: countBy(commandActivations, (activation) => activation.classification),
      byStatus: countBy(commandActivations, (activation) => activation.status),
      byPhase: countBy(commandActivations, (activation) => activation.phase),
      totalOutputSize: commandActivations.reduce((sum, activation) => sum + activation.outputSize, 0),
      repeated: commandActivations
        .filter((activation) => activation.occurrenceCount > 1)
        .map((activation) => ({
          commandName: activation.commandName,
          argvSummary: activation.argvSummary,
          count: activation.occurrenceCount,
        })),
    },
    deployments: {
      total: deploymentActions.length,
      byProvider: countBy(deploymentActions, (activation) => activation.provider ?? 'unknown'),
      byEnvironment: countBy(deploymentActions, (activation) => activation.environment ?? 'unknown'),
      byStatus: countBy(deploymentActions, (activation) => activation.status),
    },
    zones: {
      total: zoneActivations.length,
      uniqueZones: new Set(zoneActivations.map((activation) => activation.zoneId)).size,
      byZoneId: countBy(zoneActivations, (activation) => activation.zoneId),
      byActivationKind: countBy(zoneActivations, (activation) => activation.activationKind),
      bySourceKind: countBy(zoneActivations, (activation) => activation.sourceKind),
      byConfidence: countBy(zoneActivations, (activation) => activation.confidence),
      strengthByZoneId: sumBy(zoneActivations, (activation) => activation.zoneId, (activation) => activation.strength),
    },
    coactivations: {
      total: zoneCoactivations.length,
    },
  };
}

function countBy<T>(records: T[], keyFn: (record: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sumBy<T>(
  records: T[],
  keyFn: (record: T) => string,
  valueFn: (record: T) => number
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    sums[key] = roundMetric((sums[key] ?? 0) + valueFn(record));
  }
  return sums;
}

function repeatedPathActivations(records: PathActivationRecord[]): { path: string; activationKind: PathActivationKind; count: number }[] {
  const counts = new Map<string, { path: string; activationKind: PathActivationKind; count: number }>();
  for (const record of records) {
    const key = `${record.path}\0${record.activationKind}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { path: record.path, activationKind: record.activationKind, count: 1 });
    }
  }
  return [...counts.values()]
    .filter((record) => record.count > 1)
    .sort((left, right) => left.path.localeCompare(right.path) || left.activationKind.localeCompare(right.activationKind));
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function enrichZoneAssociation(record: ZoneAssociationRecord): ZoneAssociationRecord {
  const unknownOutcomes = Math.max(0, record.unknownOutcomes ?? record.supportCount - record.positiveOutcomes - record.negativeOutcomes);
  const knownOutcomes = record.positiveOutcomes + record.negativeOutcomes;
  const leftActivationCount = record.leftActivationCount ?? 0;
  const rightActivationCount = record.rightActivationCount ?? 0;
  const coactivationSupport = record.coactivationSupport ?? record.supportCount;
  const normalizedDenominator = Math.sqrt(leftActivationCount * rightActivationCount);
  const unionActivationCount = leftActivationCount + rightActivationCount - coactivationSupport;
  return {
    ...record,
    unknownOutcomes,
    knownOutcomes,
    successRate: knownOutcomes > 0 ? roundMetric(record.positiveOutcomes / knownOutcomes) : null,
    riskRate: knownOutcomes > 0 ? roundMetric(record.negativeOutcomes / knownOutcomes) : null,
    leftActivationCount,
    rightActivationCount,
    coactivationSupport,
    normalizedWeight: normalizedDenominator > 0 ? roundMetric(coactivationSupport / normalizedDenominator) : 0,
    jaccardWeight: unionActivationCount > 0 ? roundMetric(coactivationSupport / unionActivationCount) : 0,
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeHooks(kernel: LearningKernel, input: NormalizeHooksInput = {}): NormalizeHooksResult {
  const events = kernel.db.prepare(`
    select
      he.event_id as eventId,
      he.session_id as sessionId,
      he.turn_id as turnId,
      he.event_name as eventName,
      he.cwd,
      he.payload_json as payloadJson
    from hook_events he
    left join hook_normalizations hn on hn.event_id = he.event_id
    where hn.event_id is null
    order by he.created_at asc, he.event_id asc
    limit ?
  `).all(input.limit ?? 1000) as {
    eventId: string;
    sessionId: string;
    turnId: string | null;
    eventName: string;
    cwd: string;
    payloadJson: string;
  }[];

  const jobIds = new Set<string>();
  let pathActivations = 0;
  let commandActivations = 0;
  let deploymentActions = 0;

  for (const event of events) {
    const classified = classifyHookEvent(event);
    const workspace = workspaceForHookEvent(kernel, event.cwd, input.workspaceId);
    const jobId = classified.jobId;
    jobIds.add(jobId);
    recordJob(kernel, {
      jobId,
      workspaceId: workspace.workspaceId,
      runId: event.turnId ?? null,
      taskShape: 'codex-hook-turn',
      summary: `Codex ${event.eventName} in ${workspace.name}`,
      sourceRef: `codex-hook:${event.eventId}`,
      status: event.eventName === 'Stop' ? 'completed' : 'started',
    });

    for (const commandFact of classified.commands) {
      const command = recordCommandActivation(kernel, {
        jobId,
        runId: event.turnId ?? null,
        commandName: commandFact.commandName,
        commandFamily: commandFact.commandFamily,
        workingDirectory: commandFact.workingDirectory,
        argv: commandFact.argv,
        argvSummary: commandFact.argvSummary,
        classification: commandFact.classification,
        evidenceRef: classified.evidenceRef,
        status: commandFact.status,
        phase: commandFact.phase,
        outputSize: commandFact.outputSize,
      });
      commandActivations += 1;
      if (commandFact.deployment) {
        recordDeploymentAction(kernel, {
          jobId,
          commandId: command.commandId,
          provider: commandFact.deployment.provider,
          environment: commandFact.deployment.environment,
          target: commandFact.deployment.target,
          status: commandFact.deployment.status,
          evidenceRef: classified.evidenceRef,
        });
        deploymentActions += 1;
      }
    }

    for (const pathFact of classified.paths) {
      recordPathActivation(kernel, {
        jobId,
        runId: event.turnId ?? null,
        path: pathFact.path,
        activationKind: pathFact.activationKind,
        evidenceRef: classified.evidenceRef,
        confidence: pathFact.confidence,
        phase: pathFact.phase,
      });
      pathActivations += 1;
    }

    kernel.db.prepare(`
      insert or ignore into hook_normalizations (event_id, job_id, normalized_at)
      values (?, ?, ?)
    `).run(event.eventId, jobId, ISO_NOW());
  }

  let zoneActivations = 0;
  let zoneCoactivations = 0;
  let associations = 0;
  for (const jobId of jobIds) {
    zoneActivations += deriveZoneActivationsForJob(kernel, { jobId }).length;
    zoneCoactivations += deriveZoneCoactivationsForJob(kernel, { jobId }).length;
    associations += updateZoneAssociationsFromJob(kernel, {
      jobId,
      outcome: input.outcome ?? 'unknown',
    }).length;
  }

  return {
    processedEvents: events.length,
    jobs: [...jobIds],
    pathActivations,
    commandActivations,
    deploymentActions,
    zoneActivations,
    zoneCoactivations,
    associations,
  };
}

export function promoteProtocolFromPreferences(
  kernel: LearningKernel,
  input: PromoteProtocolFromPreferencesInput
): ProtocolRecord {
  requireFields(input, ['protocolId']);
  const protocol = ensureProtocol(kernel, input.protocolId);
  if (protocol.status !== 'candidate') {
    throw new Error(`protocol ${input.protocolId} is not a candidate`);
  }
  for (const preferenceId of input.preferenceIds ?? []) {
    ensurePreferencePair(kernel, preferenceId);
    kernel.db.prepare(`
      insert or ignore into protocol_preferences (protocol_id, preference_id, attached_at)
      values (?, ?, ?)
    `).run(input.protocolId, preferenceId, ISO_NOW());
  }
  const preferenceRow = kernel.db.prepare(`
    select count(*) as count
    from protocol_preferences pp
    join preference_pairs p on p.preference_id = pp.preference_id
    where pp.protocol_id = ?
      and p.confidence in ('medium', 'high')
  `).get(input.protocolId) as { count: number };
  const minPreferences = input.minPreferences ?? 2;
  if (preferenceRow.count < minPreferences) {
    throw new Error(`promote_protocol_from_preferences requires at least ${minPreferences} preference pairs; found ${preferenceRow.count}`);
  }
  if (!protocol.scopeKind || !protocol.scopeValue) {
    throw new Error('promote_protocol_from_preferences requires explicit scope');
  }
  if (!protocol.action) {
    throw new Error('promote_protocol_from_preferences requires an action');
  }

  kernel.db.prepare(`
    update protocols
    set status = 'active', promoted_by = ?, promoted_at = ?
    where protocol_id = ?
  `).run(input.promotedBy ?? null, ISO_NOW(), input.protocolId);
  return getProtocol(kernel, input.protocolId);
}

export function resolveProtocol(kernel: LearningKernel, input: ResolveProtocolInput): ResolveProtocolResult {
  requireFields(input, ['taskShape', 'channel']);
  const protocols = kernel.db.prepare(`
    select
      protocol_id as protocolId,
      title,
      scope_kind as scopeKind,
      scope_value as scopeValue,
      action,
      status
    from protocols
    where status = 'active'
      and scope_kind = 'channel'
      and scope_value = ?
    order by promoted_at asc, protocol_id asc
    limit 1
  `).all(input.channel) as ProtocolDelivery[];

  let deliveryId: string | null = null;
  for (const protocol of protocols) {
    deliveryId = `delivery-${input.runId ?? 'adhoc'}-${protocol.protocolId}`;
    kernel.db.prepare(`
      insert or ignore into deliveries (
        delivery_id, protocol_id, run_id, task_shape, channel, delivered_at
      )
      values (?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      protocol.protocolId,
      input.runId ?? null,
      input.taskShape,
      input.channel,
      ISO_NOW()
    );
  }

  return { protocols, deliveryId };
}

export function recordOutcome(kernel: LearningKernel, input: RecordOutcomeInput): OutcomeRecord {
  requireFields(input, ['deliveryId', 'followed', 'defectRepeated', 'verified', 'costBand']);
  ensureDelivery(kernel, input.deliveryId);
  const creditDelta = scoreOutcome(input);
  const outcomeId = input.outcomeId ?? `outcome-${input.deliveryId}`;
  kernel.db.prepare(`
    insert into outcomes (
      outcome_id, delivery_id, run_id, followed, defect_repeated, verified,
      cost_band, credit_delta, recorded_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    outcomeId,
    input.deliveryId,
    input.runId ?? null,
    boolInt(input.followed),
    boolInt(input.defectRepeated),
    boolInt(input.verified),
    input.costBand,
    creditDelta,
    ISO_NOW()
  );
  return { outcomeId, deliveryId: input.deliveryId, creditDelta };
}

export function getCredit(kernel: LearningKernel): AdaptiveCredit {
  const row = kernel.db.prepare(`
    select coalesce(sum(credit_delta), 0) as adaptiveCredit
    from outcomes
  `).get() as AdaptiveCredit;
  return { adaptiveCredit: row.adaptiveCredit };
}

export function getPreferenceSummary(kernel: LearningKernel): PreferenceSummary {
  return {
    traces: countRows(kernel, 'learning_traces'),
    preferencePairs: countRows(kernel, 'preference_pairs'),
  };
}

export function getModelCallSummary(kernel: LearningKernel): ModelCallSummary {
  const row = kernel.db.prepare(`
    select
      count(*) as modelCalls,
      coalesce(sum(total_tokens), 0) as totalModelTokens,
      coalesce(sum(estimated_cost), 0) as estimatedModelCost
    from model_calls
  `).get() as ModelCallSummary;
  return {
    modelCalls: row.modelCalls,
    totalModelTokens: row.totalModelTokens,
    estimatedModelCost: row.estimatedModelCost,
  };
}

export function recordSessionStarted(kernel: LearningKernel, input: RecordSessionStartedInput): SessionRecord {
  requireFields(input, ['sessionId']);
  kernel.db.prepare(`
    insert into agent_sessions (
      session_id, workspace_scope, repo_path, branch, platform, model, started_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(session_id) do update set
      workspace_scope = excluded.workspace_scope,
      repo_path = coalesce(excluded.repo_path, agent_sessions.repo_path),
      branch = coalesce(excluded.branch, agent_sessions.branch),
      platform = excluded.platform,
      model = coalesce(excluded.model, agent_sessions.model),
      updated_at = excluded.updated_at
  `).run(
    input.sessionId,
    input.workspaceScope ?? 'local',
    input.repoPath ?? null,
    input.branch ?? null,
    input.platform ?? 'agent',
    input.model ?? null,
    ISO_NOW(),
    ISO_NOW()
  );
  return getSession(kernel, input.sessionId);
}

export function recordPromptBoundary(kernel: LearningKernel, input: RecordPromptBoundaryInput): PromptBoundaryRecord {
  requireFields(input, ['sessionId', 'role', 'kind']);
  ensureSession(kernel, input.sessionId);
  const promptIndex = nextPromptIndex(kernel, input.sessionId);
  const promptId = `${input.sessionId}:prompt:${promptIndex}`;
  const promptSha = input.promptText === undefined ? input.promptHash ?? null : sha256(input.promptText);
  const promptLengthValue = input.promptText === undefined ? input.promptLength : input.promptText.length;
  const promptLength = typeof promptLengthValue === 'number' ? ` length=${promptLengthValue}` : '';
  const promptSummary = input.summary ?? (input.promptText ? summarize(input.promptText) : '');
  kernel.db.prepare(`
    insert into session_prompts (
      prompt_id, session_id, run_id, turn_id, prompt_index, prompt_role,
      prompt_kind, prompt_sha256, prompt_ref, prompt_summary, response_summary,
      model, recorded_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    promptId,
    input.sessionId,
    input.runId ?? null,
    input.turnId ?? null,
    promptIndex,
    input.role,
    input.kind,
    promptSha,
    input.promptRef ?? null,
    `${promptSummary}${promptLength}`.trim(),
    input.responseSummary ?? null,
    input.model ?? null,
    ISO_NOW()
  );
  return {
    promptId,
    sessionId: input.sessionId,
    promptIndex,
    promptRole: input.role,
    promptKind: input.kind,
  };
}

export function getObserverSummary(kernel: LearningKernel): ObserverSummary {
  const sessions = countRows(kernel, 'agent_sessions');
  const promptBoundaries = countRows(kernel, 'session_prompts');
  const hookEvents = countRows(kernel, 'hook_events');
  const modelCallSummary = getModelCallSummary(kernel);
  const runs = countRows(kernel, 'runs');
  const preferenceSummary = getPreferenceSummary(kernel);
  const activeProtocols = kernel.db.prepare(`
    select count(*) as count from protocols where status = 'active'
  `).get() as { count: number };
  return {
    sessions,
    promptBoundaries,
    hookEvents,
    modelCalls: modelCallSummary.modelCalls,
    totalModelTokens: modelCallSummary.totalModelTokens,
    estimatedModelCost: modelCallSummary.estimatedModelCost,
    runs,
    traces: preferenceSummary.traces,
    preferencePairs: preferenceSummary.preferencePairs,
    activeProtocols: activeProtocols.count,
    adaptiveCredit: getCredit(kernel).adaptiveCredit,
  };
}

export function spoolCodexHookEvent(event: CodexHookInput, options: HookSpoolOptions): HookSpoolRecord {
  requireFields(options, ['spoolDir']);
  const observation = codexHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: false,
  });
  const packet: HookSpoolPacket = {
    version: 1,
    kind: 'codex-hook-event',
    recordedAt: ISO_NOW(),
    hookEvent: observation.hookEvent,
    session: observation.session,
    promptBoundary: observation.promptBoundary,
  };
  const written = writeJsonSpoolPacket({
    spoolDir: options.spoolDir,
    packet,
    packetId: observation.hookEvent.eventId,
  });
  return {
    eventId: observation.hookEvent.eventId ?? hookEventId(observation.hookEvent),
    eventName: observation.eventName,
    packetPath: written.packetPath,
  };
}

export function drainHookSpool(kernel: LearningKernel, input: DrainHookSpoolInput): DrainHookSpoolResult {
  requireFields(input, ['spoolDir']);
  let hookEvents = 0;
  let sessions = 0;
  let promptBoundaries = 0;

  const spool = drainJsonSpoolPackets<HookSpoolPacket>({
    spoolDir: input.spoolDir,
    limit: input.limit,
    parsePacket: parseHookSpoolPacket,
    processPacket: (packet) => {
      ingestHookSpoolPacket(kernel, packet);
      hookEvents += 1;
      if (packet.session) sessions += 1;
      if (packet.promptBoundary) promptBoundaries += 1;
    },
  });

  const normalized = input.normalize
    ? normalizeHooks(kernel, {
        workspaceId: input.normalizeWorkspaceId,
        outcome: input.normalizeOutcome ?? 'unknown',
      })
    : null;

  return {
    processedPackets: spool.processedPackets,
    failedPackets: spool.failedPackets,
    requeuedPackets: spool.requeuedPackets,
    hookEvents,
    sessions,
    promptBoundaries,
    normalized,
  };
}

export function recordHookEvent(kernel: LearningKernel, input: HookEventInput): HookEventRecord {
  requireFields(input, ['sessionId', 'eventName', 'cwd', 'payload']);
  const eventId = input.eventId ?? hookEventId(input);
  kernel.db.prepare(`
    insert or replace into hook_events (
      event_id, session_id, turn_id, event_name, cwd, model, payload_json, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    input.sessionId,
    input.turnId ?? null,
    input.eventName,
    input.cwd,
    input.model ?? null,
    JSON.stringify(input.payload),
    ISO_NOW()
  );
  return {
    eventId,
    sessionId: input.sessionId,
    turnId: input.turnId ?? null,
    eventName: input.eventName,
    cwd: input.cwd,
    model: input.model ?? null,
  };
}

export function handleCodexHook(
  kernel: LearningKernel,
  event: CodexHookInput,
  options: CodexHookOptions = {}
): CodexHookOutput {
  const observation = codexHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: true,
  });
  const { eventName, sessionId, turnId } = observation;

  recordHookEvent(kernel, observation.hookEvent);

  if (observation.session) {
    recordSessionStarted(kernel, observation.session);
  }
  if (observation.promptBoundary) {
    recordPromptBoundary(kernel, observation.promptBoundary);
  }

  if (eventName === 'PostToolUse' && options.normalizeOnToolUse !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  if (eventName === 'Stop' && options.normalizeOnStop !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  if (!['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(eventName)) {
    return emptyCodexHookOutput(eventName);
  }

  const channel = options.channel ?? codexChannel(event);
  const taskShape = options.taskShape ?? codexTaskShape(event);
  const overlay = resolveProtocol(kernel, {
    taskShape,
    channel,
    runId: turnId ?? sessionId,
  });

  if (overlay.protocols.length === 0) {
    return emptyCodexHookOutput(eventName);
  }

  return codexHookOutput(eventName, {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: renderProtocolOverlay(overlay),
    },
  });
}

export function runFixtureReplayDemo({ dbPath = ':memory:' }: CreateKernelInput = {}): FixtureReplayDemoResult {
  const kernel = createKernel({ dbPath });
  initLedger(kernel);

  recordRun(kernel, {
    runId: 'run-1',
    taskShape: 'prompt-change',
    channel: 'function.vision.extraction',
    status: 'failed',
    tokenCost: 1200,
  });
  const gap1 = recordGap(kernel, {
    runId: 'run-1',
    kind: 'missing-fixture-replay',
    summary: 'Extraction prompt changed without replaying fixture images.',
    evidenceRef: 'review:run-1',
    status: 'observed',
  });

  const protocol = proposeProtocol(kernel, {
    protocolId: 'fixture_replay_gate',
    title: 'Fixture replay gate',
    scopeKind: 'channel',
    scopeValue: 'function.vision.extraction',
    action: 'Run baseline and post-change fixture replay before claiming extraction prompt success.',
    proposedBy: 'demo',
  });

  let firstPromotionError: string | null = null;
  try {
    promoteProtocol(kernel, { protocolId: protocol.protocolId });
  } catch (error) {
    firstPromotionError = error instanceof Error ? error.message : String(error);
  }

  recordRun(kernel, {
    runId: 'run-2',
    taskShape: 'prompt-change',
    channel: 'function.vision.extraction',
    status: 'failed',
    tokenCost: 900,
  });
  const gap2 = recordGap(kernel, {
    runId: 'run-2',
    kind: 'missing-fixture-replay',
    summary: 'Second extraction prompt edit skipped fixture replay.',
    evidenceRef: 'review:run-2',
    status: 'observed',
  });

  const promoted = promoteProtocol(kernel, {
    protocolId: protocol.protocolId,
    evidenceIds: [gap1.gapId, gap2.gapId],
    promotedBy: 'demo-frontier-review',
  });
  const overlay = resolveProtocol(kernel, {
    taskShape: 'prompt-change',
    channel: 'function.vision.extraction',
    runId: 'run-3',
  });
  if (!overlay.deliveryId) {
    throw new Error('fixture replay demo expected a protocol delivery');
  }
  const outcome = recordOutcome(kernel, {
    deliveryId: overlay.deliveryId,
    runId: 'run-3',
    followed: true,
    defectRepeated: false,
    verified: true,
    costBand: 'low',
  });

  return {
    ok: true,
    firstPromotionError,
    promoted,
    overlay,
    outcome,
    credit: getCredit(kernel),
  };
}

function scoreOutcome(input: RecordOutcomeInput): number {
  let score = 0;
  if (input.verified) score += 10;
  if (input.followed) score += 5;
  if (!input.defectRepeated) score += 5;
  if (!input.followed) score -= 5;
  if (input.defectRepeated) score -= 20;
  if (input.costBand === 'medium') score -= 2;
  if (input.costBand === 'high') score -= 5;
  return score;
}

function getRun(kernel: LearningKernel, runId: string): RunRecord {
  return kernel.db.prepare(`
    select run_id as runId, task_shape as taskShape, channel, status, token_cost as tokenCost
    from runs
    where run_id = ?
  `).get(runId) as RunRecord;
}

function ensureRun(kernel: LearningKernel, runId: string): RunRecord {
  const run = getRun(kernel, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  return run;
}

function getGap(kernel: LearningKernel, gapId: string): GapRecord {
  return kernel.db.prepare(`
    select gap_id as gapId, run_id as runId, kind, summary, evidence_ref as evidenceRef, status
    from gaps
    where gap_id = ?
  `).get(gapId) as GapRecord;
}

function getProtocol(kernel: LearningKernel, protocolId: string): ProtocolRecord {
  return kernel.db.prepare(`
    select
      protocol_id as protocolId,
      title,
      scope_kind as scopeKind,
      scope_value as scopeValue,
      action,
      proposed_by as proposedBy,
      promoted_by as promotedBy,
      status
    from protocols
    where protocol_id = ?
  `).get(protocolId) as ProtocolRecord;
}

function getTrace(kernel: LearningKernel, traceId: string): TraceRecord {
  return kernel.db.prepare(`
    select
      trace_id as traceId,
      run_id as runId,
      kind,
      summary,
      ref
    from learning_traces
    where trace_id = ?
  `).get(traceId) as TraceRecord;
}

function ensureTrace(kernel: LearningKernel, traceId: string): TraceRecord {
  const trace = getTrace(kernel, traceId);
  if (!trace) throw new Error(`unknown trace: ${traceId}`);
  return trace;
}

function getPreferencePair(kernel: LearningKernel, preferenceId: string): PreferencePairRecord {
  return kernel.db.prepare(`
    select
      preference_id as preferenceId,
      context_hash as contextHash,
      chosen_trace_id as chosenTraceId,
      rejected_trace_id as rejectedTraceId,
      reason,
      evidence_ref as evidenceRef,
      recorded_by as recordedBy,
      confidence
    from preference_pairs
    where preference_id = ?
  `).get(preferenceId) as PreferencePairRecord;
}

function ensurePreferencePair(kernel: LearningKernel, preferenceId: string): PreferencePairRecord {
  const preference = getPreferencePair(kernel, preferenceId);
  if (!preference) throw new Error(`unknown preference pair: ${preferenceId}`);
  return preference;
}

function getModelCall(kernel: LearningKernel, callId: string): ModelCallRecord {
  return kernel.db.prepare(`
    select
      call_id as callId,
      session_id as sessionId,
      run_id as runId,
      provider,
      model,
      model_lane as modelLane,
      prompt_ref as promptRef,
      prompt_sha256 as promptHash,
      prompt_summary as promptSummary,
      input_tokens as inputTokens,
      output_tokens as outputTokens,
      total_tokens as totalTokens,
      estimated_cost as estimatedCost,
      latency_ms as latencyMs,
      status,
      error_summary as errorSummary
    from model_calls
    where call_id = ?
  `).get(callId) as ModelCallRecord;
}

function getWorkspace(kernel: LearningKernel, workspaceId: string): WorkspaceRecord {
  return kernel.db.prepare(`
    select workspace_id as workspaceId, root_path as rootPath, name
    from workspaces
    where workspace_id = ?
  `).get(workspaceId) as WorkspaceRecord;
}

function getWorkspaceByRoot(kernel: LearningKernel, rootPath: string): WorkspaceRecord | undefined {
  return kernel.db.prepare(`
    select workspace_id as workspaceId, root_path as rootPath, name
    from workspaces
    where root_path = ?
  `).get(resolve(rootPath)) as WorkspaceRecord | undefined;
}

function ensureWorkspace(kernel: LearningKernel, workspaceId: string): WorkspaceRecord {
  const workspace = getWorkspace(kernel, workspaceId);
  if (!workspace) throw new Error(`unknown workspace: ${workspaceId}`);
  return workspace;
}

function getZone(kernel: LearningKernel, zoneId: string): ZoneRecord {
  return kernel.db.prepare(`
    select
      zone_id as zoneId,
      workspace_id as workspaceId,
      parent_zone_id as parentZoneId,
      zone_kind as zoneKind,
      path_glob as pathGlob,
      name,
      description
    from zones
    where zone_id = ?
  `).get(zoneId) as ZoneRecord;
}

function ensureZone(kernel: LearningKernel, zoneId: string): ZoneRecord {
  const zone = getZone(kernel, zoneId);
  if (!zone) throw new Error(`unknown zone: ${zoneId}`);
  return zone;
}

function getJob(kernel: LearningKernel, jobId: string): JobRecord {
  return kernel.db.prepare(`
    select
      job_id as jobId,
      workspace_id as workspaceId,
      run_id as runId,
      task_shape as taskShape,
      summary,
      source_ref as sourceRef,
      status
    from jobs
    where job_id = ?
  `).get(jobId) as JobRecord;
}

function ensureJob(kernel: LearningKernel, jobId: string): JobRecord {
  const job = getJob(kernel, jobId);
  if (!job) throw new Error(`unknown job: ${jobId}`);
  return job;
}

function getPathActivation(kernel: LearningKernel, activationId: string): PathActivationRecord {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      path,
      activation_kind as activationKind,
      evidence_ref as evidenceRef,
      confidence,
      phase
    from path_activations
    where activation_id = ?
  `).get(activationId) as PathActivationRecord;
}

function listPathActivations(kernel: LearningKernel, jobId: string): PathActivationRecord[] {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      path,
      activation_kind as activationKind,
      evidence_ref as evidenceRef,
      confidence,
      phase
    from path_activations
    where job_id = ?
    order by created_at asc, activation_id asc
  `).all(jobId) as PathActivationRecord[];
}

function getCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
  return kernel.db.prepare(`
    select
      command_id as commandId,
      job_id as jobId,
      run_id as runId,
      command_name as commandName,
      command_family as commandFamily,
      working_directory as workingDirectory,
      argv_hash as argvHash,
      argv_summary as argvSummary,
      classification,
      evidence_ref as evidenceRef,
      status,
      phase,
      output_size as outputSize,
      occurrence_count as occurrenceCount
    from command_activations
    where command_id = ?
  `).get(commandId) as CommandActivationRecord;
}

function ensureCommandActivation(kernel: LearningKernel, commandId: string): CommandActivationRecord {
  const command = getCommandActivation(kernel, commandId);
  if (!command) throw new Error(`unknown command activation: ${commandId}`);
  return command;
}

function listCommandActivations(kernel: LearningKernel, jobId: string): CommandActivationRecord[] {
  return kernel.db.prepare(`
    select
      command_id as commandId,
      job_id as jobId,
      run_id as runId,
      command_name as commandName,
      command_family as commandFamily,
      working_directory as workingDirectory,
      argv_hash as argvHash,
      argv_summary as argvSummary,
      classification,
      evidence_ref as evidenceRef,
      status,
      phase,
      output_size as outputSize,
      occurrence_count as occurrenceCount
    from command_activations
    where job_id = ?
    order by created_at asc, command_id asc
  `).all(jobId) as CommandActivationRecord[];
}

function getDeploymentAction(kernel: LearningKernel, deploymentId: string): DeploymentActionRecord {
  return kernel.db.prepare(`
    select
      deployment_id as deploymentId,
      job_id as jobId,
      command_id as commandId,
      provider,
      environment,
      target,
      status,
      evidence_ref as evidenceRef
    from deployment_actions
    where deployment_id = ?
  `).get(deploymentId) as DeploymentActionRecord;
}

function listDeploymentActions(kernel: LearningKernel, jobId: string): DeploymentActionRecord[] {
  return kernel.db.prepare(`
    select
      deployment_id as deploymentId,
      job_id as jobId,
      command_id as commandId,
      provider,
      environment,
      target,
      status,
      evidence_ref as evidenceRef
    from deployment_actions
    where job_id = ?
    order by created_at asc, deployment_id asc
  `).all(jobId) as DeploymentActionRecord[];
}

function getZoneActivation(kernel: LearningKernel, activationId: string): ZoneActivationRecord {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      zone_id as zoneId,
      activation_kind as activationKind,
      source_kind as sourceKind,
      source_id as sourceId,
      evidence_ref as evidenceRef,
      strength,
      confidence
    from zone_activations
    where activation_id = ?
  `).get(activationId) as ZoneActivationRecord;
}

function listZoneActivations(kernel: LearningKernel, jobId: string): ZoneActivationRecord[] {
  return kernel.db.prepare(`
    select
      activation_id as activationId,
      job_id as jobId,
      run_id as runId,
      zone_id as zoneId,
      activation_kind as activationKind,
      source_kind as sourceKind,
      source_id as sourceId,
      evidence_ref as evidenceRef,
      strength,
      confidence
    from zone_activations
    where job_id = ?
    order by created_at asc, activation_id asc
  `).all(jobId) as ZoneActivationRecord[];
}

function getZoneCoactivation(kernel: LearningKernel, coactivationId: string): ZoneCoactivationRecord {
  return kernel.db.prepare(`
    select
      coactivation_id as coactivationId,
      job_id as jobId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      reason,
      strength
    from zone_coactivations
    where coactivation_id = ?
  `).get(coactivationId) as ZoneCoactivationRecord;
}

function listZoneCoactivations(kernel: LearningKernel, jobId: string): ZoneCoactivationRecord[] {
  return kernel.db.prepare(`
    select
      coactivation_id as coactivationId,
      job_id as jobId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      reason,
      strength
    from zone_coactivations
    where job_id = ?
    order by left_zone_id asc, right_zone_id asc
  `).all(jobId) as ZoneCoactivationRecord[];
}

function getZoneAssociation(
  kernel: LearningKernel,
  leftZoneId: string,
  rightZoneId: string,
  associationKind: string
): ZoneAssociationRecord {
  const row = kernel.db.prepare(`
    select
      association_id as associationId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      association_kind as associationKind,
      weight,
      support_count as supportCount,
      positive_outcomes as positiveOutcomes,
      negative_outcomes as negativeOutcomes,
      support_count - positive_outcomes - negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = zone_associations.association_id
      ) as coactivationSupport
    from zone_associations
    where left_zone_id = ? and right_zone_id = ? and association_kind = ?
  `).get(leftZoneId, rightZoneId, associationKind) as ZoneAssociationRecord;
  return enrichZoneAssociation(row);
}

function getSession(kernel: LearningKernel, sessionId: string): SessionRecord {
  return kernel.db.prepare(`
    select
      session_id as sessionId,
      workspace_scope as workspaceScope,
      repo_path as repoPath,
      branch,
      platform,
      model
    from agent_sessions
    where session_id = ?
  `).get(sessionId) as SessionRecord;
}

function ensureSession(kernel: LearningKernel, sessionId: string): SessionRecord {
  const session = getSession(kernel, sessionId);
  if (session) return session;
  return recordSessionStarted(kernel, { sessionId });
}

function ensureProtocol(kernel: LearningKernel, protocolId: string): ProtocolRecord {
  const protocol = getProtocol(kernel, protocolId);
  if (!protocol) throw new Error(`unknown protocol: ${protocolId}`);
  return protocol;
}

function ensureGap(kernel: LearningKernel, gapId: string): GapRecord {
  const gap = getGap(kernel, gapId);
  if (!gap) throw new Error(`unknown gap: ${gapId}`);
  return gap;
}

function ensureDelivery(kernel: LearningKernel, deliveryId: string): { deliveryId: string } {
  const delivery = kernel.db.prepare(`
    select delivery_id as deliveryId
    from deliveries
    where delivery_id = ?
  `).get(deliveryId) as { deliveryId: string } | undefined;
  if (!delivery) throw new Error(`unknown delivery: ${deliveryId}`);
  return delivery;
}

function nextPromptIndex(kernel: LearningKernel, sessionId: string): number {
  const row = kernel.db.prepare(`
    select count(*) as count
    from session_prompts
    where session_id = ?
  `).get(sessionId) as { count: number };
  return row.count;
}

function normalizeRelativePath(path: string): string {
  return path.replace(/^\.\//, '').replace(/\\/g, '/');
}

function pathMatchesGlob(path: string, glob: string): boolean {
  const normalizedPath = normalizeRelativePath(path);
  const normalizedGlob = normalizeRelativePath(glob);
  if (normalizedGlob === normalizedPath) return true;
  if (normalizedGlob.endsWith('/**')) {
    const prefix = normalizedGlob.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedGlob.endsWith('*')) {
    return normalizedPath.startsWith(normalizedGlob.slice(0, -1));
  }
  return false;
}

function commandMatchesZone(command: CommandActivationRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'external_command' && zone.zoneKind !== 'deployment') return false;
  const haystack = [
    command.commandName,
    command.commandFamily,
    command.classification,
    command.argvSummary,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  const zoneName = zone.name.toLowerCase().replace(/[_-]/g, ' ');
  const commandName = command.commandName.toLowerCase();
  return haystack.includes(zoneName)
    || zoneName.includes(commandName)
    || (command.commandFamily ? zoneName.includes(command.commandFamily.toLowerCase()) : false);
}

function deploymentMatchesZone(action: DeploymentActionRecord, zone: ZoneRecord): boolean {
  if (zone.zoneKind !== 'deployment' && zone.zoneKind !== 'external_command') return false;
  const haystack = [
    action.provider,
    action.environment,
    action.target,
    zone.zoneKind,
    zone.name,
  ].filter(Boolean).join(' ').toLowerCase().replace(/[_-]/g, ' ');
  return haystack.includes(zone.name.toLowerCase().replace(/[_-]/g, ' '))
    || (action.provider ? haystack.includes(action.provider.toLowerCase()) : false);
}

function sortedPair(left: string, right: string): [string, string] {
  return left <= right ? [left, right] : [right, left];
}

function workspaceForHookEvent(kernel: LearningKernel, cwd: string, workspaceId?: string): WorkspaceRecord {
  if (workspaceId) return ensureWorkspace(kernel, workspaceId);
  const existing = getWorkspaceByRoot(kernel, cwd);
  if (existing) return existing;
  return recordWorkspace(kernel, { rootPath: cwd });
}

function countRows(kernel: LearningKernel, tableName: string): number {
  const row = kernel.db.prepare(`select count(*) as count from ${tableName}`).get() as { count: number };
  return row.count;
}

function ensureColumn(kernel: LearningKernel, tableName: string, columnName: string, definition: string): void {
  const columns = kernel.db.prepare(`pragma table_info(${tableName})`).all() as { name: string }[];
  if (columns.some((column) => column.name === columnName)) return;
  kernel.db.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
}

function requireFields(input: object, fields: string[]): void {
  const values = input as Record<string, unknown>;
  for (const field of fields) {
    if (values[field] === undefined || values[field] === null || values[field] === '') {
      throw new Error(`missing required field: ${field}`);
    }
  }
}

function boolInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}

function codexHookObservation(
  event: CodexHookInput,
  options: { promptDir?: string; includeRawPrompt: boolean }
): CodexHookObservation {
  const eventName = event.hook_event_name ?? 'Unknown';
  const sessionId = event.session_id ?? 'unknown-session';
  const cwd = event.cwd ?? process.cwd();
  const turnId = event.turn_id ?? null;
  const hookEvent: HookEventInput = {
    sessionId,
    turnId,
    eventName,
    cwd,
    model: event.model ?? null,
    payload: redactCodexHookEvent(event),
  };
  hookEvent.eventId = hookEventId(hookEvent);

  let session: RecordSessionStartedInput | null = null;
  let promptBoundary: RecordPromptBoundaryInput | null = null;

  if (eventName === 'SessionStart') {
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    };
  } else if (eventName === 'UserPromptSubmit' && typeof event.prompt === 'string' && event.prompt) {
    const promptRef = options.promptDir ? writePromptBlob(options.promptDir, turnId ?? sessionId, 'user', event.prompt) : undefined;
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    };
    promptBoundary = {
      sessionId,
      turnId,
      role: 'user',
      kind: 'user_prompt',
      promptText: options.includeRawPrompt ? event.prompt : undefined,
      promptHash: options.includeRawPrompt ? undefined : sha256(event.prompt),
      promptLength: options.includeRawPrompt ? undefined : event.prompt.length,
      promptRef,
      summary: options.includeRawPrompt ? undefined : summarize(event.prompt),
      model: event.model ?? null,
    };
  } else if (eventName === 'Stop' && typeof event.last_assistant_message === 'string' && event.last_assistant_message) {
    session = {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    };
    promptBoundary = {
      sessionId,
      turnId,
      role: 'assistant',
      kind: 'assistant_response',
      responseSummary: summarize(event.last_assistant_message),
      model: event.model ?? null,
    };
  }

  return {
    eventName,
    sessionId,
    turnId,
    cwd,
    hookEvent,
    session,
    promptBoundary,
  };
}

function ingestHookSpoolPacket(kernel: LearningKernel, packet: HookSpoolPacket): void {
  recordHookEvent(kernel, packet.hookEvent);
  if (packet.session) {
    recordSessionStarted(kernel, packet.session);
  }
  if (packet.promptBoundary) {
    recordPromptBoundary(kernel, packet.promptBoundary);
  }
}

function parseHookSpoolPacket(value: unknown): HookSpoolPacket {
  if (!value || typeof value !== 'object') {
    throw new Error('invalid hook spool packet');
  }
  const packet = value as HookSpoolPacket;
  if (packet.version !== 1 || packet.kind !== 'codex-hook-event') {
    throw new Error('unsupported hook spool packet');
  }
  return packet;
}

function hookEventId(input: HookEventInput): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({
      sessionId: input.sessionId,
      turnId: input.turnId ?? null,
      eventName: input.eventName,
      cwd: input.cwd,
      payload: input.payload,
    }))
    .digest('hex')
    .slice(0, 24);
  return `hook-${digest}`;
}

function redactCodexHookEvent(event: CodexHookInput): Record<string, unknown> {
  const redacted: Record<string, unknown> = { ...event };
  if (typeof event.prompt === 'string') {
    redacted.prompt = {
      sha256: sha256(event.prompt),
      length: event.prompt.length,
    };
  }
  if (typeof event.last_assistant_message === 'string') {
    redacted.last_assistant_message = {
      sha256: sha256(event.last_assistant_message),
      length: event.last_assistant_message.length,
    };
  }
  if (event.tool_response !== undefined) {
    const fingerprint = fingerprintHookValue(event.tool_response);
    redacted.tool_response = {
      sha256: fingerprint.sha256,
      output_size: fingerprint.outputSize,
      truncated: fingerprint.truncated,
      recorded: false,
    };
  }
  return redacted;
}

function codexChannel(event: CodexHookInput): string {
  if (event.hook_event_name === 'UserPromptSubmit') return 'codex.user_prompt';
  if (event.hook_event_name === 'SessionStart') return 'codex.session';
  if (event.tool_name) return `codex.tool.${event.tool_name}`;
  return `codex.${event.hook_event_name ?? 'unknown'}`;
}

function codexTaskShape(event: CodexHookInput): string {
  if (event.hook_event_name === 'SessionStart') return `session-${event.source ?? 'startup'}`;
  if (event.hook_event_name === 'UserPromptSubmit') return 'user-prompt';
  if (event.tool_name) return `tool-${event.tool_name}`;
  return event.hook_event_name ?? 'unknown';
}

function renderProtocolOverlay(overlay: ResolveProtocolResult): string {
  const lines = [
    'Agent learning overlay:',
    ...overlay.protocols.map((protocol) => (
      `- ${protocol.title}: ${protocol.action} [${protocol.protocolId}]`
    )),
  ];
  return lines.join('\n');
}

function summarize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function writePromptBlob(promptDir: string, id: string, role: string, text: string): string {
  mkdirSync(promptDir, { recursive: true });
  const safeId = String(id || sha256(text).slice(0, 16)).replace(/[^A-Za-z0-9_.:-]/g, '_');
  const path = join(promptDir, `${safeId}-${role}.txt`);
  writeFileSync(path, text, 'utf8');
  return path;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hookResponseHashLimit(): number {
  const raw = process.env.LEARNLOOP_HOOK_RESPONSE_HASH_LIMIT;
  if (!raw) return DEFAULT_HOOK_RESPONSE_HASH_LIMIT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_HOOK_RESPONSE_HASH_LIMIT;
}

function fingerprintHookValue(value: unknown): { sha256: string; outputSize: number; truncated: boolean } {
  const outputSize = stringPayloadSize(value);
  const serialized = JSON.stringify(value);
  const limit = hookResponseHashLimit();
  const truncated = serialized.length > limit;
  const hashInput = truncated ? serialized.slice(0, limit) : serialized;
  return {
    sha256: sha256(hashInput),
    outputSize,
    truncated,
  };
}

function emptyCodexHookOutput(eventName: string): CodexHookOutput {
  if (eventName === 'PreToolUse') return {};
  return { continue: true };
}

function codexHookOutput(eventName: string, output: CodexHookOutput): CodexHookOutput {
  if (eventName === 'PreToolUse') return output;
  return { continue: true, ...output };
}
