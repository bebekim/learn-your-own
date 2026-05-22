import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface LearningKernel {
  db: DatabaseSync;
  dbPath: string;
}

export interface CreateKernelInput {
  dbPath?: string;
}

const DEFAULT_SQLITE_BUSY_TIMEOUT_MS = 10_000;

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

function sqliteBusyTimeoutMs(): number {
  const raw = process.env.LEARNLOOP_SQLITE_BUSY_TIMEOUT_MS;
  if (!raw) return DEFAULT_SQLITE_BUSY_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_SQLITE_BUSY_TIMEOUT_MS;
}
