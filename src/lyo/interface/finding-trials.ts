import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { safeToolStatusSignals } from '../hooks/adapters/runtime.ts';
import { DENIAL_KINDS, NOT_EXECUTED_KINDS, failureSignals } from '../hooks/failure-signals.ts';
import type { DecisionConfig } from '../decisions/providers.ts';
import { calibrationMismatch, decisionTriggerSchema, enqueueOutcomeJob, enqueueTriggerJob, ensureDecisionWorker, liveFailureState,
  recordOutcomeDecision, sessionTriggerDecisions, type DecisionTrigger } from './finding-decision-triggers.ts';
import { findingActionBoundary, findingOutcomePending } from '../storage/finding-evidence.ts';
import { findingOpportunity } from './session-finding-evidence.ts';

/** Events whose hook output reaches the model as context, so advice can be delivered there. */
const DELIVERY_EVENTS = new Set(['PostToolUse', 'PostToolUseFailure', 'UserPromptSubmit']);
import { LessonStore } from '../storage/lesson-store.ts';
import { findingState } from './session-findings.ts';
import { inputSchema, registerFindingOpportunity } from './session-finding-evidence.ts';
import { semanticReviewSchema, reviewFindingSemantics } from './session-finding-semantics.ts';
import { assignFindingOpportunity, emitFindingOpportunity } from './finding-opportunities.ts';
import { findingFiles } from '../storage/finding-files.ts';
import { closeFindingTrialWindow, reconcileFindingTrial } from './finding-trial-policy.ts';
import { repositoryKey } from '../repository.ts';
import { findingSessionModel } from './session-finding-capture.ts';

const text = z.string().trim().min(1).max(2000);
const measurementSchema = z.object({ claim: inputSchema.shape.claim, checks: inputSchema.shape.checks,
  sourceFiles: inputSchema.shape.sourceFiles, verifierFiles: inputSchema.shape.verifierFiles,
  evaluator: inputSchema.shape.evaluator, timeoutSeconds: inputSchema.shape.timeoutSeconds,
  capture: z.object({ toolName: text, next: z.literal(true), measures: z.literal('action').optional() }).strict() }).strict();
const trialSchema = z.object({ id: text, findingId: text, findingVersion: text, roots: z.array(text).min(1), model: text,
  runtime: z.enum(['codex', 'claude']).optional(),
  supersedes: text.optional(),
  // Absent method means Hoeffding, so registered definitions keep their hashed semantics.
  evaluation: z.object({ sampleSize: z.number().int().min(2).max(10000), minimumEffect: z.number().min(0).lt(1),
    alpha: z.number().gt(0).max(0.1), assumptions: text,
    method: z.enum(['hoeffding', 'exact-binomial', 'stratified-exact']).optional() })
    .strict().refine(plan => plan.method !== 'exact-binomial' || plan.sampleSize <= 1000,
      'exact-binomial trials allow at most 1000 assignments')
    .refine(plan => plan.method !== 'stratified-exact' || (plan.minimumEffect === 0 && plan.sampleSize <= 1000),
      'stratified-exact tests no effect: it requires minimumEffect 0 and at most 1000 assignments').optional(),
  // Absent enrollment means one session per repository or directory.
  enrollment: z.object({ unit: z.literal('session'), maxPerRepository: z.number().int().min(2).max(100) }).strict().optional(),
  // An exact trigger matches one byte-identical input. A decision trigger (Spec 12) asks a
  // calibrated typed decision in the background; no hand-written pattern describes the situation.
  trigger: z.union([
    z.object({ toolName: text, toolInput: z.union([z.record(z.string(), z.unknown()), text]), result: z.literal('failure') }).strict(),
    decisionTriggerSchema,
  ]),
  measurement: measurementSchema,
  review: semanticReviewSchema.omit({ id: true, opportunityId: true, supersedes: true, verdict: true }),
}).strict().refine(input => !input.evaluation || input.runtime, 'comparative trials require a declared runtime')
  // Same-repository sessions are alike, so only the repository-stratified test may pool them.
  .refine(input => !input.enrollment || input.evaluation?.method === 'stratified-exact',
    'session enrollment requires evaluation.method stratified-exact')
  .refine(input => input.evaluation?.method !== 'stratified-exact' || input.enrollment,
    'stratified-exact needs session enrollment; one session per repository leaves no within-repository comparison');
type Trial = z.infer<typeof trialSchema>;

export function findingTrials(db: DatabaseSync) {
  return db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-trial@1' ORDER BY rowid`)
    .all().map(row => {
      const receipt = JSON.parse(String(row.payload_json));
      if (receipt.hash !== hashValue(receipt.content)) throw new Error('invalid finding trial integrity');
      return { ...trialSchema.parse(receipt.content.input), hash: String(receipt.hash), verifierFiles: receipt.content.verifierFiles };
    });
}

export function registerFindingTrial(store: LessonStore, value: unknown) {
  const input = trialSchema.parse(value);
  input.roots = [...new Set(input.roots.map(root => realpathSync(root)))];
  const definitions = findingTrials(store.db);
  const predecessor = definitions.find(trial => trial.id === input.supersedes);
  if (input.supersedes && (!predecessor || predecessor.id === input.id || predecessor.findingId !== input.findingId
    || definitions.some(trial => trial.id !== input.id && trial.supersedes === input.supersedes)))
    throw new Error('supersedes must name an unreplaced trial of this finding');
  if (definitions.some(trial => trial.id !== input.id && trial.id !== input.supersedes && trial.findingId === input.findingId
    && trial.model === input.model && (!trial.runtime || !input.runtime || trial.runtime === input.runtime)
    && !definitions.some(replacement => replacement.supersedes === trial.id)))
    throw new Error('another trial owns this finding/model/runtime; declare supersedes to replace it');
  const state = findingState(store.db, input.findingId);
  if (state.version !== input.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity))
    throw new Error('trial requires the current unsuspended finding version');
  if (input.measurement.claim.action !== state.finding.intervention || input.review.claimKind !== input.measurement.claim.kind)
    throw new Error('trial must preserve the finding action and declared claim kind');
  if (!input.measurement.verifierFiles.every(isAbsolute)) throw new Error('reusable trial verifiers require absolute paths');
  const verifierFiles = findingFiles(input.measurement.verifierFiles);
  if (verifierFiles.some(file => file.content === null)) throw new Error('trial verifier is missing');
  for (const basis of [input.review.applicability, input.review.adherence, input.review.prediction]) {
    if (!basis.verifierPaths.every(path => verifierFiles.some(file => file.path === path)))
      throw new Error('trial semantic review must cite retained verifiers');
  }
  const content = { input, verifierFiles }, receipt = { source: 'session-finding-trial@1', content, hash: hashValue(content) };
  const previous = store.getTrace(`finding-trial:${input.id}`);
  if (previous && hashValue(JSON.parse(previous.payload_json!)) !== hashValue(receipt)) throw new Error('trial definitions are immutable; use a new trial id');
  if (!previous) store.recordTrace({ trace_id: `finding-trial:${input.id}`, kind: 'behavior',
    summary: 'Reviewed prospective trial definition; usefulness remains unvalidated.', payload: receipt });
  if (predecessor) reconcileFindingTrial(store, predecessor);
  return receipt;
}

function exactTriggerMatches(trigger: Trial['trigger'], event: Record<string, any>) {
  return 'toolInput' in trigger && event.tool_name === trigger.toolName && hashValue(event.tool_input) === hashValue(trigger.toolInput);
}

const isDecisionTrial = (trial: Trial): trial is Trial & { trigger: DecisionTrigger } => 'decision' in trial.trigger;

/** A declined or never-executed call is not an observed failure of the command. */
function executedFailure(error: unknown) {
  if (error === undefined || error === null) return true;
  const text = typeof error === 'string' ? error : typeof (error as any)?.message === 'string' ? (error as any).message : null;
  if (text === null) return true;
  const { failure_kind: kind } = failureSignals(text);
  return !DENIAL_KINDS.has(kind) && !NOT_EXECUTED_KINDS.has(kind) && kind !== 'interrupted';
}

/**
 * Spec 13: when the captured action of an action-measured opportunity failed, its outcome is the
 * trial's own calibrated question, decided in the background. Without a question or provider the
 * outcome is recorded as unknown at once, so measurement never waits forever.
 */
function requestOutcomeDecision(store: LessonStore, storePath: string, trial: Trial & { hash: string }, id: string,
  runtime: string, event: Record<string, any>, decisions: { config: DecisionConfig | null; env?: NodeJS.ProcessEnv }) {
  const registered = findingOpportunity(store.db, id), capture = registered.content.input.capture;
  if (!findingOutcomePending(store.db, id, capture)) return;
  const after = findingActionBoundary(store.db, id, 'after');
  if (!after || after.toolUseId !== event.tool_use_id) return; // only the live event that carries the failure text
  const state = liveFailureState(event);
  const reason = !isDecisionTrial(trial) ? 'trial has no decision question'
    : calibrationMismatch(trial.trigger, decisions.config) ?? (state ? null : 'no command text to decide');
  if (reason) {
    recordOutcomeDecision(store, { opportunityId: id, sessionId: registered.content.sessionId, trialHash: trial.hash,
      verdict: 'unknown', level: null, reason, provider: null, answeredModel: null, requestHash: null, latencyMs: null });
    return;
  }
  const queued = enqueueOutcomeJob(storePath, decisions.config!, runtime, event, id, trial.hash, state!);
  if (queued.result === 'dropped') recordOutcomeDecision(store, { opportunityId: id, sessionId: registered.content.sessionId,
    trialHash: trial.hash, verdict: 'unknown', level: null, reason: 'decision queue full', provider: null, answeredModel: null, requestHash: null, latencyMs: null });
  else ensureDecisionWorker(storePath, decisions.env);
}

function contains(root: string, cwd: string) {
  const path = relative(root, cwd);
  return path !== '..' && !path.startsWith('../') && !isAbsolute(path);
}

function observeModel(store: LessonStore, runtime: string, event: Record<string, any>) {
  const previous = findingSessionModel(store.db, runtime, event.session_id);
  if (typeof event.model !== 'string' || !event.model.trim() || previous?.model === event.model) return previous;
  const content = { source: 'session-finding-model@1', runtime, sessionId: event.session_id, model: event.model, eventName: event.hook_event_name };
  const id = `finding-model:${hashValue([content, previous?.id ?? null])}`;
  store.recordTrace({ trace_id: id, run_id: event.session_id, kind: 'behavior', summary: 'Observed host session model.',
    payload: { ...content, hash: hashValue(content) } });
  return { id, model: event.model as string };
}

function registerOrdinaryOpportunity(store: LessonStore, trial: Trial & { hash: string }, runtime: 'codex' | 'claude', event: Record<string, any>, id: string,
  landed?: { trigger: { eventName: string; toolUseId: string; inputHash: string; responseHash: string }; decisionRef: string }) {
  const cwd = realpathSync(event.cwd), state = findingState(store.db, trial.findingId);
  const context = { repository: cwd, activity: state.finding.activity, match: 'activity' as const };
  registerFindingOpportunity(store, { ...trial.measurement, id, findingId: trial.findingId,
    taskId: `session:${event.session_id}`, cwd,
    sourceFiles: trial.measurement.sourceFiles.map(path => resolve(cwd, path)),
    capture: { ...trial.measurement.capture, runtime },
    prospective: { sessionId: event.session_id, trialId: trial.id, model: event.model,
      findingVersion: trial.findingVersion, context, automatic: { trialHash: trial.hash, unit: repositoryKey(cwd) ?? cwd, modelRef: event.modelRef,
        trigger: landed?.trigger ?? { eventName: event.hook_event_name, toolUseId: event.tool_use_id,
          inputHash: hashValue(event.tool_input), responseHash: hashValue(event.tool_response ?? event.error ?? null) },
        ...(landed ? { decisionRef: landed.decisionRef } : {}) } } });
  reviewFindingSemantics(store, { ...trial.review, id: `trial-review:${id}`, opportunityId: id, verdict: 'accepted' });
}

/**
 * Runs on live, raw hook events; spool replay cannot discover prospective opportunities.
 * Kimi stays excluded: its wire logs show UserPromptSubmit hook output reaching the model,
 * but no PostToolUseFailure context has been observed reaching it. Enrolling Kimi before that
 * is verified could silently turn the advice arm into a no-advice arm. Kimi events also report
 * the tool call as `tool_call_id` and the model only at session start.
 */
export function ordinaryFindingTrialFeedback(runtime: 'codex' | 'claude', event: Record<string, any>, storePath: string | null,
  random = Math.random, decisions: { config: DecisionConfig | null; env?: NodeJS.ProcessEnv } = { config: null }): { managed: boolean; additionalContext?: string } {
  if (!storePath || !event.session_id || !event.cwd || event.client_type === 'kimi_code_cli') return { managed: false };
  const db = new DatabaseSync(storePath, { readOnly: true });
  let definitions: ReturnType<typeof findingTrials>;
  try { definitions = findingTrials(db); } finally { db.close(); }
  if (!definitions.length) return { managed: false };
  const store = new LessonStore(storePath);
  try {
    const cwd = realpathSync(event.cwd);
    const model = observeModel(store, runtime, event);
    event = { ...event, model: model?.model, modelRef: model?.id };
    const opportunities = definitions.map(trial => ({ trial, id: hashValue([trial.hash, runtime, event.session_id]) }));
    for (const { trial, id } of opportunities) {
      if (store.getTrace(`finding-opportunity:${id}`)) {
        requestOutcomeDecision(store, storePath, trial, id, runtime, event, decisions);
        closeFindingTrialWindow(store, id, event.hook_event_name);
        reconcileFindingTrial(store, trial);
        return { managed: true };
      }
    }
    const eligible = (trial: (typeof definitions)[number]) => {
      if (trial.runtime && trial.runtime !== runtime) return false;
      if (definitions.some(replacement => replacement.supersedes === trial.id)) return false;
      if (!trial.roots.some(root => contains(root, cwd)) || event.model !== trial.model) return false;
      const state = findingState(store.db, trial.findingId);
      if (state.version !== trial.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity)) return false;
      return hashValue(findingFiles(trial.measurement.verifierFiles)) === hashValue(trial.verifierFiles);
    };
    const enroll = (trial: (typeof definitions)[number], id: string, landed?: Parameters<typeof registerOrdinaryOpportunity>[5]) => {
      registerOrdinaryOpportunity(store, trial, runtime, event, id, landed);
      const policy = reconcileFindingTrial(store, trial);
      assignFindingOpportunity(store, id, random, policy.id);
      let additionalContext = '';
      emitFindingOpportunity(store, id, text => { additionalContext += text; });
      return { managed: true, ...(additionalContext ? { additionalContext } : {}) };
    };

    // Spec 12 §3: a background decision that has landed enrolls at this later event. Both arms
    // are registered here, so outcomes in each are measured from the same delivery point.
    if (DELIVERY_EVENTS.has(event.hook_event_name)) {
      for (const decision of sessionTriggerDecisions(store.db, event.session_id)) {
        if (decision.verdict !== 'yes' || decision.runtime !== runtime) continue;
        const entry = opportunities.find(({ trial }) => trial.hash === decision.trialHash);
        if (!entry || !isDecisionTrial(entry.trial) || !eligible(entry.trial)) continue;
        if (calibrationMismatch(entry.trial.trigger, decisions.config)) continue;
        return enroll(entry.trial, entry.id, { trigger: decision.trigger, decisionRef: decision.id });
      }
    }

    const executedFailureEvent = ['PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name)
      && event.is_interrupt !== true && Boolean(event.tool_use_id) && executedFailure(event.error)
      && ((s => typeof s.exit_code === 'number' && s.exit_code !== 0)(safeToolStatusSignals(event.tool_response))
        || event.hook_event_name === 'PostToolUseFailure');
    if (!executedFailureEvent) return { managed: false };

    // Decision triggers: enqueue and return at once; the worker decides in the background.
    const queued = definitions.filter(trial => isDecisionTrial(trial) && event.tool_name === trial.trigger.toolName && eligible(trial)
      && !calibrationMismatch(trial.trigger as DecisionTrigger, decisions.config));
    const state = queued.length ? liveFailureState(event) : null;
    if (queued.length && state && decisions.config) {
      enqueueTriggerJob(storePath, decisions.config, runtime, event, queued.map(trial => trial.hash), state);
      ensureDecisionWorker(storePath, decisions.env);
    }

    for (const { trial, id } of opportunities) {
      if (isDecisionTrial(trial) || !eligible(trial) || !exactTriggerMatches(trial.trigger, event)) continue;
      return enroll(trial, id);
    }
    return { managed: false };
  } finally { store.close(); }
}
