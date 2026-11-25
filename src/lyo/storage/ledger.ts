import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { loadTuning } from '../config/tuning.ts';

export interface LearningKernel {
  db: DatabaseSync;
  dbPath: string;
}

export interface CreateKernelInput {
  dbPath?: string;
}


export function createKernel({ dbPath = '.agent-learning/learning.sqlite' }: CreateKernelInput = {}): LearningKernel {
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA busy_timeout = ${sqliteBusyTimeoutMs()}`);
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  return { db, dbPath };
}

export function closeKernel(kernel: LearningKernel): void {
  kernel.db.close();
}

/** `tuning.sqlite.ledgerBusyTimeoutMs`; the older `LEARNLOOP_SQLITE_BUSY_TIMEOUT_MS` still overrides it. */
function sqliteBusyTimeoutMs(): number {
  const raw = process.env.LEARNLOOP_SQLITE_BUSY_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : loadTuning().sqlite.ledgerBusyTimeoutMs;
}
