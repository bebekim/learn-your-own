/**
 * Live shadowing (Spec 14 §2): on an executed failure, queue one job asking every shadowing
 * hypothesis's question about it. The hook never waits and nothing reaches the agent.
 */

import { DatabaseSync } from 'node:sqlite';
import { hashValue } from '../contract/refs.ts';
import { safeToolStatusSignals } from '../hooks/adapters/runtime.ts';
import { failureSignals } from '../hooks/failure-signals.ts';
import { enqueueDecisionJob } from '../decisions/queue.ts';
import type { DecisionConfig } from '../decisions/providers.ts';
import { decisionQueueDir, ensureDecisionWorker, FAILURE_INPUT_FORMAT, liveFailureState } from '../interface/finding-decision-triggers.ts';
import { listHypotheses } from './store.ts';

/** A failure the command itself produced: not declined, rejected, interrupted or merely attempted. */
export function isExecutedFailureEvent(event: Record<string, any>) {
  if (!['PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name) || event.is_interrupt === true || !event.tool_use_id) return false;
  const status = safeToolStatusSignals(event.tool_response);
  const failed = event.hook_event_name === 'PostToolUseFailure' || (typeof status.exit_code === 'number' && status.exit_code !== 0);
  if (!failed) return false;
  const text = typeof event.error === 'string' ? event.error : typeof event.error?.message === 'string' ? event.error.message : null;
  if (text === null) return true;
  const kind = failureSignals(text).failure_kind;
  return kind === 'exit_nonzero' || kind === 'unknown';
}

export function shadowHypotheses(runtime: string, event: Record<string, any>, storePath: string | null,
  decisions: { config: DecisionConfig | null; env?: NodeJS.ProcessEnv }) {
  if (!storePath || !decisions.config || !event.session_id || !event.cwd || event.tool_name !== 'Bash') return { queued: false };
  if (!isExecutedFailureEvent(event)) return { queued: false };
  const db = new DatabaseSync(storePath, { readOnly: true });
  let ids: string[];
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'learning_trace'").get()) return { queued: false };
    const limit = decisions.config.generator?.maxShadowing ?? 5;
    ids = listHypotheses(db).filter(h => h.status === 'shadowing').slice(0, limit).map(h => h.id);
  } finally { db.close(); }
  const state = ids.length ? liveFailureState(event) : null;
  if (!ids.length || !state) return { queued: false };
  const trigger = { eventName: String(event.hook_event_name), toolUseId: String(event.tool_use_id),
    inputHash: hashValue(event.tool_input), responseHash: hashValue(event.tool_response ?? event.error ?? null) };
  const result = enqueueDecisionJob(decisionQueueDir(storePath), { kind: 'shadow', hypothesisIds: ids,
    jobId: hashValue(['shadow', runtime, event.session_id, event.tool_use_id]), sessionId: String(event.session_id), runtime,
    cwd: String(event.cwd), model: typeof event.model === 'string' ? event.model : null, createdAt: new Date().toISOString(),
    trialHashes: [], trigger, state, inputFormat: FAILURE_INPUT_FORMAT }, decisions.config.worker.maxQueued);
  if (result === 'queued') ensureDecisionWorker(storePath, decisions.env);
  return { queued: result === 'queued' };
}
