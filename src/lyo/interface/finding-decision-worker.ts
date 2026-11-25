/**
 * The single background decision worker (Spec 12 §2). It owns every write of trigger
 * decisions, so hooks never contend for the store. It exits when idle or past its TTL.
 */

import type { TypedDecisionProvider } from '../application/typed-decisions.ts';
import { acquireWorkerLock, claimNextJob, completeJob, failJob, recoverClaimed, type DecisionJob } from '../decisions/queue.ts';
import type { DecisionConfig } from '../decisions/providers.ts';
import { expectedLevel } from '../decisions/providers.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { findingTrials } from './finding-trials.ts';
import { expectedLevelVerdict, recordTriggerDecision, triggerDecisionId, type DecisionTrigger } from './finding-decision-triggers.ts';

export interface WorkerOptions {
  storePath: string;
  queueDir: string;
  provider: TypedDecisionProvider;
  worker: DecisionConfig['worker'];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  pollMs?: number;
}

export interface WorkerSummary { started: boolean; decided: number; expired: number; failed: number; reason: 'idle' | 'ttl' | 'locked' }

export async function runDecisionWorker(options: WorkerOptions): Promise<WorkerSummary> {
  const now = options.now ?? Date.now, sleep = options.sleep ?? (ms => new Promise(r => setTimeout(r, ms)));
  const release = acquireWorkerLock(options.queueDir);
  if (!release) return { started: false, decided: 0, expired: 0, failed: 0, reason: 'locked' };
  const summary: WorkerSummary = { started: true, decided: 0, expired: 0, failed: 0, reason: 'idle' };
  const started = now();
  let idleSince = now();
  try {
    recoverClaimed(options.queueDir);
    for (;;) {
      if (now() - started >= options.worker.ttlSeconds * 1000) { summary.reason = 'ttl'; break; }
      const claimed = claimNextJob(options.queueDir);
      if (!claimed) {
        if (now() - idleSince >= options.worker.idleSeconds * 1000) break;
        await sleep(options.pollMs ?? 1000);
        continue;
      }
      try {
        const outcome = await decideJob(options, claimed.job, now);
        summary.decided += outcome.decided; summary.expired += outcome.expired;
        completeJob(claimed.path);
      } catch {
        summary.failed += 1;
        failJob(options.queueDir, claimed.path);
      }
      idleSince = now();
    }
  } finally { release(); }
  return summary;
}

async function decideJob(options: WorkerOptions, job: DecisionJob, now: () => number) {
  const store = new LessonStore(options.storePath);
  let decided = 0, expired = 0;
  try {
    const trials = findingTrials(store.db);
    const base = { jobId: job.jobId, sessionId: job.sessionId, runtime: job.runtime, cwd: job.cwd, model: job.model, trigger: job.trigger };
    const tooOld = now() - Date.parse(job.createdAt) > options.worker.maxAgeSeconds * 1000;
    for (const trialHash of job.trialHashes) {
      // A crash between storing a decision and deleting the job must not decide it twice.
      if (store.getTrace(triggerDecisionId(job.jobId, trialHash))) continue;
      const trial = trials.find(candidate => candidate.hash === trialHash);
      const trigger = trial && 'decision' in trial.trigger ? trial.trigger as DecisionTrigger : null;
      const empty = { level: null, provider: null, answeredModel: null, requestHash: null, latencyMs: null };
      if (!trigger) { recordTriggerDecision(store, { ...base, trialHash, ...empty, verdict: 'skipped', reason: 'trial definition not found' }); continue; }
      if (tooOld) { recordTriggerDecision(store, { ...base, trialHash, ...empty, verdict: 'expired', reason: 'job older than maxAgeSeconds' }); expired++; continue; }
      const t = now();
      try {
        const record = await options.provider.decide({ state: job.state, questions: { match: trigger.decision.question } },
          { timeoutMs: options.worker.timeoutMs });
        const level = expectedLevel(record.answers.match);
        recordTriggerDecision(store, { ...base, trialHash, level, verdict: expectedLevelVerdict(level, trigger.decision.band),
          reason: null, provider: record.provider, answeredModel: record.answeredModel, requestHash: record.requestHash, latencyMs: now() - t });
      } catch (error) {
        recordTriggerDecision(store, { ...base, trialHash, ...empty, latencyMs: now() - t, verdict: 'unknown',
          reason: `provider error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300), provider: options.provider.name });
      }
      decided++;
    }
  } finally { store.close(); }
  return { decided, expired };
}
