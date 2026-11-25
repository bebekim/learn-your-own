/**
 * Decision-triggered trials (Spec 12). A failure is recognised by a calibrated typed
 * decision asked in the background, never by a hand-written pattern. The hook only
 * enqueues; enrollment happens at a later hook event once the decision has landed.
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { hookValueText } from '../hooks/test-summary.ts';
import { enqueueDecisionJob, lockHolder } from '../decisions/queue.ts';
import type { DecisionConfig } from '../decisions/providers.ts';
import { configuredDecisionModel } from '../decisions/providers.ts';
import type { LessonStore } from '../storage/lesson-store.ts';

const text = z.string().trim().min(1).max(2000);

/** The calibrated input rendering. Changing it invalidates every calibration that names it. */
export const FAILURE_INPUT_FORMAT = 'command-output@1';

export const decisionTriggerSchema = z.object({
  toolName: text,
  result: z.literal('failure'),
  decision: z.object({
    question: z.object({ type: z.literal('score'), instructions: text, criteria: z.array(text).min(2).max(10) }).strict(),
    // Thresholds on the expected level, 1..n.
    band: z.object({ no: z.number(), yes: z.number() }).strict().refine(band => band.no < band.yes, 'band requires no < yes'),
    calibration: z.object({
      provider: z.enum(['mlxcel', 'openrouter', 'jev']), model: text,
      positives: z.number().int().min(20), negatives: z.number().int().min(20),
      inputFormat: z.literal(FAILURE_INPUT_FORMAT), testHash: text,
      heldOut: z.object({ caught: z.number().int().min(0), positives: z.number().int().min(1),
        falseAlarms: z.number().int().min(0), negatives: z.number().int().min(1), undecided: z.number().int().min(0) }).strict(),
      evidence: text,
    }).strict(),
  }).strict(),
}).strict();
export type DecisionTrigger = z.infer<typeof decisionTriggerSchema>;

/** The failure as calibration saw it: the command, then the tail of what it printed. */
export function renderFailureState(command: string, output: string): string {
  return `Command:\n${command.slice(0, 900)}\n\nOutput (tail):\n${output.slice(-700)}`;
}

export function liveFailureState(event: Record<string, any>): string | null {
  const command = typeof event.tool_input === 'string' ? event.tool_input : event.tool_input?.command;
  if (typeof command !== 'string' || !command) return null;
  const error = event.error, response = event.tool_response;
  const output = typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message
    : response !== undefined ? hookValueText(response) : '';
  return renderFailureState(command, output ?? '');
}

export function expectedLevelVerdict(level: number | null, band: { no: number; yes: number }): 'yes' | 'no' | 'between' | 'unknown' {
  if (level === null || !Number.isFinite(level)) return 'unknown';
  return level >= band.yes ? 'yes' : level <= band.no ? 'no' : 'between';
}

export type TriggerDecisionVerdict = 'yes' | 'no' | 'between' | 'unknown' | 'expired' | 'skipped';

export interface TriggerDecisionContent {
  source: 'finding-trigger-decision@1';
  jobId: string; sessionId: string; runtime: string; cwd: string; model: string | null; trialHash: string;
  trigger: { eventName: string; toolUseId: string; inputHash: string; responseHash: string };
  verdict: TriggerDecisionVerdict; level: number | null; reason: string | null;
  provider: string | null; answeredModel: string | null; requestHash: string | null; latencyMs: number | null;
}

export function triggerDecisionId(jobId: string, trialHash: string) { return `finding-trigger-decision:${jobId}:${trialHash}`; }

export function recordTriggerDecision(store: LessonStore, content: Omit<TriggerDecisionContent, 'source'>) {
  const full: TriggerDecisionContent = { source: 'finding-trigger-decision@1', ...content };
  const id = triggerDecisionId(content.jobId, content.trialHash);
  if (store.getTrace(id)) return id;
  store.recordTrace({ trace_id: id, run_id: content.sessionId, kind: 'behavior',
    summary: `Background trigger decision: ${content.verdict}. Eligibility only; not outcome evidence.`,
    payload: { ...full, hash: hashValue(full) } });
  return id;
}

export function sessionTriggerDecisions(db: DatabaseSync, sessionId: string): Array<TriggerDecisionContent & { id: string }> {
  return db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'finding-trigger-decision@1' ORDER BY rowid`)
    .all(sessionId).map(row => ({ id: String(row.trace_id), ...JSON.parse(String(row.payload_json)) }));
}

export function decisionQueueDir(storePath: string) { return join(dirname(storePath), 'decision-queue'); }

/** Null when the calibration is valid for this configuration, else the reason it cannot enroll. */
export function calibrationMismatch(trigger: DecisionTrigger, config: DecisionConfig | null): string | null {
  if (!config) return 'no decision provider configured';
  const configured = configuredDecisionModel(config), cal = trigger.decision.calibration;
  if (cal.provider !== configured.provider || cal.model !== configured.model)
    return `calibrated on ${cal.provider}/${cal.model}, configured ${configured.provider}/${configured.model}`;
  return null;
}

export function enqueueTriggerJob(storePath: string, config: DecisionConfig, runtime: string, event: Record<string, any>,
  trialHashes: string[], state: string) {
  const trigger = { eventName: String(event.hook_event_name), toolUseId: String(event.tool_use_id),
    inputHash: hashValue(event.tool_input), responseHash: hashValue(event.tool_response ?? event.error ?? null) };
  const jobId = hashValue([runtime, event.session_id, event.tool_use_id]);
  const result = enqueueDecisionJob(decisionQueueDir(storePath), { jobId, sessionId: String(event.session_id), runtime,
    cwd: String(event.cwd), model: typeof event.model === 'string' ? event.model : null, createdAt: new Date().toISOString(),
    trialHashes, trigger, state, inputFormat: FAILURE_INPUT_FORMAT }, config.worker.maxQueued);
  return { jobId, trigger, result };
}

/** Starts the worker detached unless one holds the lock. Never waits for it. `LYO_DECISION_WORKER=0` disables. */
export function ensureDecisionWorker(storePath: string, env: NodeJS.ProcessEnv = process.env) {
  if (env.LYO_DECISION_WORKER === '0') return false;
  const queue = decisionQueueDir(storePath);
  if (lockHolder(queue)) return false;
  // The packaged build ships .js; source checkouts run .ts. Follow whichever this module is.
  const self = fileURLToPath(import.meta.url), cli = join(dirname(self), '..', '..', `cli${self.endsWith('.ts') ? '.ts' : '.js'}`);
  const child = spawn(process.execPath, [cli, 'decisions', 'worker', '--store', storePath, '--queue', queue],
    { detached: true, stdio: 'ignore', env });
  child.unref();
  return true;
}

// ---- Spec 13: outcome decisions for action-measured opportunities ----

export interface OutcomeDecisionContent {
  source: 'finding-outcome-decision@1';
  opportunityId: string; sessionId: string; trialHash: string;
  verdict: TriggerDecisionVerdict; level: number | null; reason: string | null;
  provider: string | null; answeredModel: string | null; requestHash: string | null; latencyMs: number | null;
}

export const outcomeDecisionId = (opportunityId: string) => `finding-outcome-decision:${opportunityId}`;

/** The first decision for an opportunity stands; a later one is ignored. */
export function recordOutcomeDecision(store: LessonStore, content: Omit<OutcomeDecisionContent, 'source'>) {
  const full: OutcomeDecisionContent = { source: 'finding-outcome-decision@1', ...content };
  const id = outcomeDecisionId(content.opportunityId);
  if (store.getTrace(id)) return id;
  store.recordTrace({ trace_id: id, run_id: content.sessionId, kind: 'behavior',
    summary: `Background outcome decision: ${content.verdict}. Measurement input; not a benefit claim.`,
    payload: { ...full, hash: hashValue(full) } });
  return id;
}

export function enqueueOutcomeJob(storePath: string, config: DecisionConfig, runtime: string, event: Record<string, any>,
  opportunityId: string, trialHash: string, state: string) {
  const trigger = { eventName: String(event.hook_event_name), toolUseId: String(event.tool_use_id),
    inputHash: hashValue(event.tool_input), responseHash: hashValue(event.tool_response ?? event.error ?? null) };
  const jobId = hashValue(['outcome', opportunityId]);
  const result = enqueueDecisionJob(decisionQueueDir(storePath), { kind: 'outcome', opportunityId, jobId,
    sessionId: String(event.session_id), runtime, cwd: String(event.cwd), model: typeof event.model === 'string' ? event.model : null,
    createdAt: new Date().toISOString(), trialHashes: [trialHash], trigger, state, inputFormat: FAILURE_INPUT_FORMAT }, config.worker.maxQueued);
  return { jobId, result };
}
