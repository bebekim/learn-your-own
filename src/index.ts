import { createHash } from 'node:crypto';
import {
  claudeHookObservation,
  emptyClaudeHookOutput,
} from './adapters/claude.ts';
import type {
  ClaudeHookInput,
  ClaudeHookOptions,
  ClaudeHookOutput,
} from './adapters/claude.ts';
import {
  codexChannel,
  codexHookObservation,
  codexHookOutput,
  codexTaskShape,
  emptyCodexHookOutput,
  renderProtocolOverlay,
} from './adapters/codex.ts';
import type {
  CodexHookInput,
  CodexHookOptions,
  CodexHookOutput,
} from './adapters/codex.ts';
import {
  drainHookSpoolPackets,
  normalizedHookSpoolResult,
  recordHookEvent,
  spoolHookObservation,
} from './hooks/ingestion.ts';
import type { HookSpoolPacket } from './hooks/events.ts';
import {
  normalizeHooks,
} from './hooks/normalization-runner.ts';
import { createKernel } from './ledger.ts';
import type { CreateKernelInput, LearningKernel } from './ledger.ts';
import { initLedger } from './schema.ts';
import type {
  AdaptiveCredit,
  AttachEvidenceInput,
  DrainHookSpoolInput,
  DrainHookSpoolResult,
  FinishRunInput,
  FixtureReplayDemoResult,
  GapRecord,
  HookSpoolOptions,
  HookSpoolRecord,
  ModelCallRecord,
  ModelCallSummary,
  ObserverSummary,
  OutcomeRecord,
  PreferencePairRecord,
  PreferenceSummary,
  ProposeProtocolInput,
  PromoteProtocolFromPreferencesInput,
  PromoteProtocolInput,
  PromptBoundaryRecord,
  ProtocolDelivery,
  ProtocolRecord,
  RecordGapInput,
  RecordModelCallInput,
  RecordOutcomeInput,
  RecordPreferencePairInput,
  RecordPromptBoundaryInput,
  RecordRunInput,
  RecordSessionStartedInput,
  RecordTraceInput,
  ResolveProtocolInput,
  ResolveProtocolResult,
  RunRecord,
  SessionRecord,
  TraceRecord,
} from './types.ts';

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
export type * from './types.ts';

const ISO_NOW = () => new Date().toISOString();

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
  const observation = codexHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: false,
  });
  return spoolHookObservation(observation, options);
}

export function spoolClaudeHookEvent(event: ClaudeHookInput, options: HookSpoolOptions): HookSpoolRecord {
  const observation = claudeHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: false,
  });
  return spoolHookObservation(observation, options);
}

export function drainHookSpool(kernel: LearningKernel, input: DrainHookSpoolInput): DrainHookSpoolResult {
  const drained = drainHookSpoolPackets(input, (packet) => {
    ingestHookSpoolPacket(kernel, packet);
  });

  const normalized = input.normalize
    ? normalizeHooks(kernel, {
        workspaceId: input.normalizeWorkspaceId,
        outcome: input.normalizeOutcome ?? 'unknown',
      })
    : null;

  return normalizedHookSpoolResult(drained, normalized);
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
  const eventName = observation.runtimeEventName;
  const { sessionId, turnId } = observation;

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

export function handleClaudeHook(
  kernel: LearningKernel,
  event: ClaudeHookInput,
  options: ClaudeHookOptions = {}
): ClaudeHookOutput {
  const observation = claudeHookObservation(event, {
    promptDir: options.promptDir,
    includeRawPrompt: true,
  });
  const eventName = observation.runtimeEventName;

  recordHookEvent(kernel, observation.hookEvent);

  if (observation.session) {
    recordSessionStarted(kernel, observation.session);
  }
  if (observation.promptBoundary) {
    recordPromptBoundary(kernel, observation.promptBoundary);
  }

  if ((eventName === 'PostToolUse' || eventName === 'PostToolUseFailure') && options.normalizeOnToolUse !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  if ((eventName === 'Stop' || eventName === 'SessionEnd') && options.normalizeOnStop !== false) {
    normalizeHooks(kernel, {
      workspaceId: options.normalizeWorkspaceId,
      outcome: options.normalizeOutcome ?? 'unknown',
    });
  }

  return emptyClaudeHookOutput();
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

function ingestHookSpoolPacket(kernel: LearningKernel, packet: HookSpoolPacket): void {
  recordHookEvent(kernel, packet.hookEvent);
  if (packet.session) {
    recordSessionStarted(kernel, packet.session);
  }
  if (packet.promptBoundary) {
    recordPromptBoundary(kernel, packet.promptBoundary);
  }
}

function summarize(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
