import type { LearningKernel } from '../ledger.ts';
import {
  optionalRow,
  requiredRow,
} from '../db/rows.ts';
import type {
  FinishRunInput,
  GapRecord,
  ModelCallRecord,
  ModelCallSummary,
  PreferencePairRecord,
  PreferenceSummary,
  RecordGapInput,
  RecordModelCallInput,
  RecordPreferencePairInput,
  RecordRunGoalInput,
  RecordRunInput,
  RecordTraceInput,
  RunGoalRecord,
  RunRecord,
  TraceRecord,
} from '../types/core.ts';
import {
  countRows,
  ISO_NOW,
  requireFields,
  sha256,
} from './shared.ts';

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
  return ensureRun(kernel, input.runId);
}

export function finishRun(kernel: LearningKernel, input: FinishRunInput): RunRecord {
  requireFields(input, ['runId', 'status']);
  ensureRun(kernel, input.runId);
  kernel.db.prepare(`
    update runs
    set status = ?, token_cost = coalesce(?, token_cost)
    where run_id = ?
  `).run(input.status, input.tokenCost ?? null, input.runId);
  return ensureRun(kernel, input.runId);
}

export function recordRunGoal(kernel: LearningKernel, input: RecordRunGoalInput): RunGoalRecord {
  requireFields(input, ['runId', 'goal']);
  kernel.db.prepare(`
    insert into run_goals (
      run_id, goal, success_criteria, stop_condition, expected_process, risk_class, created_at
    )
    values (?, ?, ?, ?, ?, ?, ?)
    on conflict(run_id) do update set
      goal = excluded.goal,
      success_criteria = excluded.success_criteria,
      stop_condition = excluded.stop_condition,
      expected_process = excluded.expected_process,
      risk_class = excluded.risk_class
  `).run(
    input.runId,
    input.goal,
    input.successCriteria ?? null,
    input.stopCondition ?? null,
    input.expectedProcess ?? null,
    input.riskClass ?? null,
    ISO_NOW()
  );
  return ensureRunGoal(kernel, input.runId);
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
  return ensureGap(kernel, gapId);
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
  return ensureTrace(kernel, traceId);
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
  return ensurePreferencePair(kernel, preferenceId);
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

export function getPreferenceSummary(kernel: LearningKernel): PreferenceSummary {
  return {
    traces: countRows(kernel, 'learning_traces'),
    preferencePairs: countRows(kernel, 'preference_pairs'),
  };
}

export function getModelCallSummary(kernel: LearningKernel): ModelCallSummary {
  const row = requiredRow<ModelCallSummary>(kernel.db.prepare(`
    select
      count(*) as modelCalls,
      coalesce(sum(total_tokens), 0) as totalModelTokens,
      coalesce(sum(estimated_cost), 0) as estimatedModelCost
    from model_calls
  `).get(), 'model call summary query returned no row');
  return {
    modelCalls: row.modelCalls,
    totalModelTokens: row.totalModelTokens,
    estimatedModelCost: row.estimatedModelCost,
  };
}

export function getRun(kernel: LearningKernel, runId: string): RunRecord | undefined {
  return optionalRow<RunRecord>(kernel.db.prepare(`
    select run_id as runId, task_shape as taskShape, channel, status, token_cost as tokenCost
    from runs
    where run_id = ?
  `).get(runId));
}

export function ensureRun(kernel: LearningKernel, runId: string): RunRecord {
  const run = getRun(kernel, runId);
  if (!run) throw new Error(`unknown run: ${runId}`);
  return run;
}

export function getRunGoal(kernel: LearningKernel, runId: string): RunGoalRecord | undefined {
  return optionalRow<RunGoalRecord>(kernel.db.prepare(`
    select
      run_id as runId,
      goal,
      success_criteria as successCriteria,
      stop_condition as stopCondition,
      expected_process as expectedProcess,
      risk_class as riskClass
    from run_goals
    where run_id = ?
  `).get(runId));
}

export function ensureRunGoal(kernel: LearningKernel, runId: string): RunGoalRecord {
  const goal = getRunGoal(kernel, runId);
  if (!goal) throw new Error('unknown run goal: ' + runId);
  return goal;
}

export function getGap(kernel: LearningKernel, gapId: string): GapRecord | undefined {
  return optionalRow<GapRecord>(kernel.db.prepare(`
    select gap_id as gapId, run_id as runId, kind, summary, evidence_ref as evidenceRef, status
    from gaps
    where gap_id = ?
  `).get(gapId));
}

export function ensureGap(kernel: LearningKernel, gapId: string): GapRecord {
  const gap = getGap(kernel, gapId);
  if (!gap) throw new Error(`unknown gap: ${gapId}`);
  return gap;
}

export function getTrace(kernel: LearningKernel, traceId: string): TraceRecord | undefined {
  return optionalRow<TraceRecord>(kernel.db.prepare(`
    select
      trace_id as traceId,
      run_id as runId,
      kind,
      summary,
      ref
    from learning_traces
    where trace_id = ?
  `).get(traceId));
}

export function ensureTrace(kernel: LearningKernel, traceId: string): TraceRecord {
  const trace = getTrace(kernel, traceId);
  if (!trace) throw new Error(`unknown trace: ${traceId}`);
  return trace;
}

export function getPreferencePair(kernel: LearningKernel, preferenceId: string): PreferencePairRecord | undefined {
  return optionalRow<PreferencePairRecord>(kernel.db.prepare(`
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
  `).get(preferenceId));
}

export function ensurePreferencePair(kernel: LearningKernel, preferenceId: string): PreferencePairRecord {
  const preference = getPreferencePair(kernel, preferenceId);
  if (!preference) throw new Error(`unknown preference pair: ${preferenceId}`);
  return preference;
}

export function getModelCall(kernel: LearningKernel, callId: string): ModelCallRecord {
  return requiredRow<ModelCallRecord>(kernel.db.prepare(`
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
  `).get(callId), `unknown model call: ${callId}`);
}
