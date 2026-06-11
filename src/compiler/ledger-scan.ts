import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { LearningKernel } from '../ledger.ts';

export interface SkippedDatabase {
  dbPath: string;
  reason: string;
}

export function findAgentLearningDatabases(root: string): string[] {
  if (!existsSync(root)) return [];

  const found: string[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git') continue;
      const fullPath = join(dir, entry);
      let stats;
      try {
        stats = statSync(fullPath);
      } catch {
        continue;
      }

      if (stats.isDirectory()) {
        visit(fullPath);
        continue;
      }

      if (
        stats.isFile()
        && fullPath.includes(`${join('.agent-learning')}`)
        && (entry === 'learning.sqlite' || entry.endsWith('.sqlite'))
      ) {
        found.push(fullPath);
      }
    }
  };

  visit(root);
  return found.sort();
}

export function openReadOnlyLedger(dbPath: string): DatabaseSync {
  const attempts = [
    dbPath,
    immutableReadOnlyUri(dbPath),
  ];
  const errors: string[] = [];

  for (const filename of attempts) {
    let db: DatabaseSync | null = null;
    try {
      db = new DatabaseSync(filename, { readOnly: true });
      db.exec('PRAGMA query_only = ON');
      db.prepare('select name from sqlite_master limit 1').get();
      return db;
    } catch (error) {
      db?.close();
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`open_read_only_failed: ${errors.join(' | ')}`);
}

export function hasTable(kernel: LearningKernel, tableName: string): boolean {
  const row = kernel.db.prepare(`
    select name
    from sqlite_master
    where type = 'table' and name = ?
  `).get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

export function countHookEvents(kernel: LearningKernel): number {
  const row = kernel.db.prepare('select count(*) as count from hook_events').get() as { count: number };
  return row.count;
}

export function listTelemetryRunIds(kernel: LearningKernel): string[] {
  const rows = kernel.db.prepare(`
    select distinct coalesce(turn_id, session_id) as runId
    from hook_events
    where coalesce(turn_id, session_id) is not null
    order by runId asc
  `).all() as { runId: string }[];
  return rows.map((row) => row.runId);
}

function immutableReadOnlyUri(dbPath: string): string {
  const url = pathToFileURL(resolve(dbPath));
  url.searchParams.set('mode', 'ro');
  url.searchParams.set('immutable', '1');
  return url.href;
}
