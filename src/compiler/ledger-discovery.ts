import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const AGENT_LEARNING_LEDGER_DISCOVERY_SKIPPED_DIRECTORIES = [
  '.git',
  '.cache',
  '.next',
  '.turbo',
  '.venv',
  'build',
  'coverage',
  'dist',
  'node_modules',
] as const;

const SKIPPED_DIRECTORY_NAMES = new Set<string>(
  AGENT_LEARNING_LEDGER_DISCOVERY_SKIPPED_DIRECTORIES
);

export interface AgentLearningLedgerLocation {
  dbPath: string;
  workspaceRoot: string;
  relativeWorkspace: string;
  depth: number;
}

export function discoverAgentLearningLedgers(root: string): AgentLearningLedgerLocation[] {
  if (!existsSync(root)) return [];

  const found: AgentLearningLedgerLocation[] = [];
  const visit = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIPPED_DIRECTORY_NAMES.has(entry)) continue;
      if (isAgentLearningArchiveDirectory(dir, entry)) continue;
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

      if (stats.isFile() && isAgentLearningDatabasePath(fullPath, entry)) {
        found.push(ledgerLocation(root, fullPath));
      }
    }
  };

  visit(root);
  return found.sort((left, right) => left.dbPath.localeCompare(right.dbPath));
}

export function findAgentLearningDatabases(root: string): string[] {
  return discoverAgentLearningLedgers(root).map((ledger) => ledger.dbPath);
}

function isAgentLearningDatabasePath(fullPath: string, entry: string): boolean {
  return fullPath.split(/[\\/]/).includes('.agent-learning')
    && (entry === 'learning.sqlite' || entry.endsWith('.sqlite'));
}

function isAgentLearningArchiveDirectory(parentDir: string, entry: string): boolean {
  return entry === 'snapshots'
    && parentDir.split(/[\\/]/).at(-1) === '.agent-learning';
}

function ledgerLocation(root: string, dbPath: string): AgentLearningLedgerLocation {
  const workspaceRoot = workspaceRootForLedger(dbPath);
  const relativeWorkspace = relative(root, workspaceRoot) || '.';
  return {
    dbPath,
    workspaceRoot,
    relativeWorkspace,
    depth: relativeWorkspace === '.'
      ? 0
      : relativeWorkspace.split(/[\\/]/).filter(Boolean).length,
  };
}

function workspaceRootForLedger(dbPath: string): string {
  const normalized = dbPath.replaceAll('\\', '/');
  const markerIndex = normalized.lastIndexOf('/.agent-learning/');
  return markerIndex === -1 ? dbPath : dbPath.slice(0, markerIndex);
}
