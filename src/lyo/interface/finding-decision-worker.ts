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
import { expectedLevelVerdict, outcomeDecisionId, recordOutcomeDecision, recordTriggerDecision, triggerDecisionId,
  type DecisionTrigger } from './finding-decision-triggers.ts';
import { measureFindingOpportunity } from './session-finding-evidence.ts';
import { assessFindingEvidence } from './session-findings.ts';
import { closeFindingTrialWindow } from './finding-trial-policy.ts';
import { listHypotheses, recordHypothesisMatch } from '../hypotheses/store.ts';

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
    if (job.kind === 'outcome') return await decideOutcome(options, store, trials, job, tooOld, now);
    if (job.kind === 'shadow') return await decideShadow(options, store, job, tooOld, now);
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

/**
 * Spec 13: decide whether a captured action's failure was the trial's situation, then measure,
 * assess and close the opportunity. The worker is the only writer, so this cannot race the hook.
 */
async function decideOutcome(options: WorkerOptions, store: LessonStore, trials: ReturnType<typeof findingTrials>,
  job: DecisionJob, tooOld: boolean, now: () => number) {
  const id = job.opportunityId!, trialHash = job.trialHashes[0];
  const base = { opportunityId: id, sessionId: job.sessionId, trialHash };
  const empty = { level: null, provider: null, answeredModel: null, requestHash: null, latencyMs: null };
  let decided = 0, expired = 0;
  if (!store.getTrace(outcomeDecisionId(id))) {
    const trial = trials.find(candidate => candidate.hash === trialHash);
    const trigger = trial && 'decision' in trial.trigger ? trial.trigger as DecisionTrigger : null;
    if (!trigger) recordOutcomeDecision(store, { ...base, ...empty, verdict: 'skipped', reason: 'trial definition not found' });
    else if (tooOld) { recordOutcomeDecision(store, { ...base, ...empty, verdict: 'expired', reason: 'job older than maxAgeSeconds' }); expired++; }
    else {
      const t = now();
      try {
        const record = await options.provider.decide({ state: job.state, questions: { match: trigger.decision.question } },
          { timeoutMs: options.worker.timeoutMs });
        const level = expectedLevel(record.answers.match);
        recordOutcomeDecision(store, { ...base, level, verdict: expectedLevelVerdict(level, trigger.decision.band), reason: null,
          provider: record.provider, answeredModel: record.answeredModel, requestHash: record.requestHash, latencyMs: now() - t });
      } catch (error) {
        recordOutcomeDecision(store, { ...base, ...empty, latencyMs: now() - t, verdict: 'unknown', provider: options.provider.name,
          reason: `provider error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 300) });
      }
      decided++;
    }
  }
  // Measurement now has its input; an unknown or expired decision measures as an unknown outcome.
  const evidence = measureFindingOpportunity(store, id);
  assessFindingEvidence(store, evidence.id);
  closeFindingTrialWindow(store, id, 'Stop');
  return { decided, expired };
}

/** Spec 14: ask each shadowing hypothesis about one failure and record the level. Nothing is delivered. */
async function decideShadow(options: WorkerOptions, store: LessonStore, job: DecisionJob, tooOld: boolean, now: () => number) {
  const hypotheses = listHypotheses(store.db).filter(h => job.hypothesisIds?.includes(h.id) && h.status === 'shadowing');
  let decided = 0, expired = 0;
  for (const h of hypotheses) {
    const base = { hypothesisId: h.id, episodeId: job.trigger.toolUseId, sessionId: job.sessionId, cwd: job.cwd,
      at: job.createdAt, mode: 'live' as const };
    if (tooOld) { recordHypothesisMatch(store, { ...base, level: null, provider: null, model: null }); expired++; continue; }
    try {
      const record = await options.provider.decide({ state: job.state, questions: { match: h.proposal.question } }, { timeoutMs: options.worker.timeoutMs });
      recordHypothesisMatch(store, { ...base, level: expectedLevel(record.answers.match), provider: record.provider, model: record.answeredModel });
    } catch {
      recordHypothesisMatch(store, { ...base, level: null, provider: options.provider.name, model: null });
    }
    decided++;
  }
  void now;
  return { decided, expired };
}
