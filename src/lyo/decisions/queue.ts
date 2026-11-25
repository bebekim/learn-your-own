/**
 * Decision job queue (Spec 12 §1a): a directory of job files, written by hooks with
 * write-then-rename and claimed by the single worker with rename. No database sits on
 * the hook path. Job files hold live failure text, so the directory is owner-only and
 * a job is deleted as soon as its decisions are stored.
 */

import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export interface DecisionJob {
  /** 'trigger' (Spec 12) decides enrollment; 'outcome' (Spec 13) decides a captured action's result. */
  kind?: 'trigger' | 'outcome';
  opportunityId?: string;
  jobId: string;
  sessionId: string;
  runtime: string;
  cwd: string;
  model: string | null;
  createdAt: string;
  trialHashes: string[];
  trigger: { eventName: string; toolUseId: string; inputHash: string; responseHash: string };
  state: string;
  inputFormat: string;
  attempts: number;
}

const DIRS = ['incoming', 'claimed', 'dead'] as const;

export function ensureQueue(dir: string) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const sub of DIRS) mkdirSync(join(dir, sub), { recursive: true, mode: 0o700 });
}

const jobFile = (jobId: string) => `${jobId.replace(/[^A-Za-z0-9_-]/g, '_')}.json`;

/** 'duplicate' when the same trigger is already queued, claimed or dead; 'dropped' when the queue is full. */
export function enqueueDecisionJob(dir: string, job: Omit<DecisionJob, 'attempts'>, maxQueued: number): 'queued' | 'duplicate' | 'dropped' {
  ensureQueue(dir);
  const name = jobFile(job.jobId);
  if (DIRS.some(sub => existsSync(join(dir, sub, name)))) return 'duplicate';
  if (readdirSync(join(dir, 'incoming')).filter(f => f.endsWith('.json')).length >= maxQueued) return 'dropped';
  const tmp = join(dir, `.${name}.${process.pid}.tmp`);
  writeFileSync(tmp, JSON.stringify({ ...job, attempts: 0 }), { mode: 0o600 });
  renameSync(tmp, join(dir, 'incoming', name));
  return 'queued';
}

export function readJob(path: string): DecisionJob { return JSON.parse(readFileSync(path, 'utf8')); }

/** Oldest first. Renaming into `claimed/` is the claim, so two workers cannot take one job. */
export function claimNextJob(dir: string): { job: DecisionJob; path: string } | null {
  const incoming = join(dir, 'incoming');
  const files = readdirSync(incoming).filter(f => f.endsWith('.json')).map(f => {
    try { return { f, createdAt: readJob(join(incoming, f)).createdAt }; } catch { return { f, createdAt: '' }; }
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.f.localeCompare(b.f));
  for (const { f } of files) {
    const claimed = join(dir, 'claimed', f);
    try { renameSync(join(incoming, f), claimed); } catch { continue; } // another worker took it
    try { return { job: readJob(claimed), path: claimed }; }
    catch { renameSync(claimed, join(dir, 'dead', f)); }
  }
  return null;
}

export function completeJob(path: string) { rmSync(path, { force: true }); }

/** Requeue with one more attempt, or move to `dead/` after `maxAttempts`. Returns where it went. */
export function failJob(dir: string, path: string, maxAttempts = 3): 'requeued' | 'dead' {
  const job = readJob(path), name = path.split('/').pop()!;
  job.attempts += 1;
  writeFileSync(path, JSON.stringify(job), { mode: 0o600 });
  const target = job.attempts >= maxAttempts ? 'dead' : 'incoming';
  renameSync(path, join(dir, target, name));
  return target === 'dead' ? 'dead' : 'requeued';
}

/** Jobs a dead worker left claimed go back to `incoming/` (or `dead/`), counting the interrupted attempt. */
export function recoverClaimed(dir: string, maxAttempts = 3) {
  const claimed = join(dir, 'claimed');
  return readdirSync(claimed).filter(f => f.endsWith('.json')).map(f => failJob(dir, join(claimed, f), maxAttempts));
}

export function queueCounts(dir: string) {
  return Object.fromEntries(DIRS.map(sub => [sub, existsSync(join(dir, sub))
    ? readdirSync(join(dir, sub)).filter(f => f.endsWith('.json')).length : 0])) as Record<typeof DIRS[number], number>;
}

function pidAlive(pid: number) {
  try { process.kill(pid, 0); return true; } catch (error) { return (error as NodeJS.ErrnoException).code === 'EPERM'; }
}

export function lockHolder(dir: string): { pid: number; startedAt: string } | null {
  const path = join(dir, 'worker.lock');
  try {
    const holder = JSON.parse(readFileSync(path, 'utf8'));
    return Number.isInteger(holder.pid) && pidAlive(holder.pid) ? holder : null;
  } catch { return null; }
}

/** Exclusive create; a lock whose holder is dead is removed and retried once. */
export function acquireWorkerLock(dir: string, pid = process.pid): (() => void) | null {
  ensureQueue(dir);
  const path = join(dir, 'worker.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(path, 'wx', 0o600);
      writeSync(fd, JSON.stringify({ pid, startedAt: new Date().toISOString() }));
      closeSync(fd);
      return () => { try { if (JSON.parse(readFileSync(path, 'utf8')).pid === pid) rmSync(path, { force: true }); } catch { /* already gone */ } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (lockHolder(dir)) return null;
      // A holder that never wrote its PID gets a short grace period before it counts as dead.
      try { if (Date.now() - statSync(path).mtimeMs < 2000 && !readFileSync(path, 'utf8')) return null; } catch { /* raced away */ }
      rmSync(path, { force: true });
    }
  }
  return null;
}
