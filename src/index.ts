import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export type GapStatus = 'observed' | 'inferred' | 'unknown' | 'contradicted';
export type ScopeKind = 'worktree' | 'repository' | 'channel';
export type ProtocolStatus = 'candidate' | 'active' | 'demoted';
export type CostBand = 'low' | 'medium' | 'high';
export type TraceKind = 'behavior' | 'protocol_application' | 'agent_response' | 'tool_use' | 'other';
export type PreferenceConfidence = 'low' | 'medium' | 'high';
export type ModelCallStatus = 'started' | 'completed' | 'failed';

export interface LearningKernel {
  db: DatabaseSync;
  dbPath: string;
}

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

export interface CreateKernelInput {
  dbPath?: string;
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

const ISO_NOW = () => new Date().toISOString();

export function createKernel({ dbPath = '.agent-learning/learning.sqlite' }: CreateKernelInput = {}): LearningKernel {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON');
  return { db, dbPath };
}

export function closeKernel(kernel: LearningKernel): void {
  kernel.db.close();
}

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
	  `);
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
  const promptSha = input.promptText === undefined ? null : sha256(input.promptText);
  const promptLength = input.promptText === undefined ? '' : ` length=${input.promptText.length}`;
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
  const eventName = event.hook_event_name ?? 'Unknown';
  const sessionId = event.session_id ?? 'unknown-session';
  const cwd = event.cwd ?? process.cwd();
  const turnId = event.turn_id ?? null;

  recordHookEvent(kernel, {
    sessionId,
    turnId,
    eventName,
    cwd,
    model: event.model ?? null,
    payload: redactCodexHookEvent(event),
  });

  if (eventName === 'SessionStart') {
    recordSessionStarted(kernel, {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    });
  } else if (eventName === 'UserPromptSubmit' && typeof event.prompt === 'string' && event.prompt) {
    const promptRef = options.promptDir ? writePromptBlob(options.promptDir, turnId ?? sessionId, 'user', event.prompt) : undefined;
    recordSessionStarted(kernel, {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    });
    recordPromptBoundary(kernel, {
      sessionId,
      turnId,
      role: 'user',
      kind: 'user_prompt',
      promptText: event.prompt,
      promptRef,
      model: event.model ?? null,
    });
  } else if (eventName === 'Stop' && typeof event.last_assistant_message === 'string' && event.last_assistant_message) {
    recordSessionStarted(kernel, {
      sessionId,
      workspaceScope: 'local',
      repoPath: cwd,
      platform: 'codex',
      model: event.model ?? null,
    });
    recordPromptBoundary(kernel, {
      sessionId,
      turnId,
      role: 'assistant',
      kind: 'assistant_response',
      responseSummary: summarize(event.last_assistant_message),
      model: event.model ?? null,
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

function countRows(kernel: LearningKernel, tableName: string): number {
  const row = kernel.db.prepare(`select count(*) as count from ${tableName}`).get() as { count: number };
  return row.count;
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
    redacted.tool_response = {
      sha256: sha256(JSON.stringify(event.tool_response)),
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

function emptyCodexHookOutput(eventName: string): CodexHookOutput {
  if (eventName === 'PreToolUse') return {};
  return { continue: true };
}

function codexHookOutput(eventName: string, output: CodexHookOutput): CodexHookOutput {
  if (eventName === 'PreToolUse') return output;
  return { continue: true, ...output };
}
