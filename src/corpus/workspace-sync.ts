import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createKernel, closeKernel } from '../ledger.ts';
import { initLedger } from '../schema.ts';
import { drainHookSpool } from '../hooks/runtime.ts';
import { discoverAgentLearningLedgers } from '../compiler/ledger-discovery.ts';
import { syncWorkspaceToCorpus, type SyncCorpusOnceInput } from './sync.ts';
import { z } from 'zod';

const adaptiveFeedbackSchema = z.object({
  mode: z.enum(['explore', 'evaluate']), revision: z.number().int().nonnegative().optional(),
}).strict().refine(value => value.mode !== 'evaluate' || value.revision !== undefined,
  'evaluation requires a frozen revision');

export function workspaceSyncConfig(env = process.env): (SyncCorpusOnceInput & {
  adaptiveFeedback?: z.infer<typeof adaptiveFeedbackSchema>;
}) | null {
  const file = env.LYO_CONFIG_FILE ?? join(homedir(), '.lyo', 'config.json');
  if (!existsSync(file)) return null;
  const config = JSON.parse(readFileSync(file, 'utf8'));
  if (!config || typeof config.rootDir !== 'string' || !isAbsolute(config.rootDir)
    || typeof config.corpusPath !== 'string' || !isAbsolute(config.corpusPath)) {
    throw new Error(`Expected absolute rootDir and corpusPath in ${file}`);
  }
  return { rootDir: realpathSync(config.rootDir), corpusPath: resolve(config.corpusPath),
    ...(config.adaptiveFeedback === undefined ? {} : { adaptiveFeedback: adaptiveFeedbackSchema.parse(config.adaptiveFeedback) }) };
}

export function isWithinRoot(root: string, path: string): boolean {
  const child = relative(root, path);
  return child === '' || (child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child));
}

export function connectWorkspace(cwd: string, config: SyncCorpusOnceInput) {
  const workspaceRoot = realpathSync(cwd);
  if (!isWithinRoot(config.rootDir, workspaceRoot)) return { ok: true, connected: false, reason: 'outside configured root' } as const;
  const stateDir = join(workspaceRoot, '.agent-learning');
  const dbPath = join(stateDir, 'learning.sqlite');
  for (const path of [stateDir, dbPath, join(stateDir, 'hook-spool')]) {
    if (existsSync(path) && !isWithinRoot(workspaceRoot, realpathSync(path))) {
      throw new Error('Workspace telemetry path points outside the workspace');
    }
  }
  const centralPath = existsSync(config.corpusPath) ? realpathSync(config.corpusPath) : resolve(config.corpusPath);
  if (centralPath === dbPath) throw new Error('The central corpus must be separate from the workspace ledger');
  const kernel = createKernel({ dbPath });
  let drained;
  try {
    initLedger(kernel);
    drained = drainHookSpool(kernel, { spoolDir: join(stateDir, 'hook-spool'), normalize: true });
  } finally { closeKernel(kernel); }
  const sync = syncWorkspaceToCorpus({ ...config, workspaceRoot });
  if (drained.failedPackets || drained.requeuedPackets) {
    throw new Error(`Central sync imported available records, but ${drained.failedPackets} hook packets failed and ${drained.requeuedPackets} need retry in ${workspaceRoot}`);
  }
  return { ok: true, connected: true, corpusPath: config.corpusPath, drained, ...sync } as const;
}

export function autoConnectWorkspace(cwd: string, env = process.env): void {
  try {
    const config = workspaceSyncConfig(env);
    if (config) connectWorkspace(cwd, config);
  } catch (error) {
    // Capture is durable locally. The scheduled sync retries central failures.
    process.stderr.write(`Lyo central sync: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

export function syncConnectedWorkspaces(config: SyncCorpusOnceInput, discover = false) {
  const paths = new Set<string>();
  if (existsSync(config.corpusPath)) {
    const central = new DatabaseSync(config.corpusPath, { readOnly: true });
    try {
      for (const row of central.prepare('select workspace_root from sync_ledgers').all() as { workspace_root: string }[]) {
        if (existsSync(row.workspace_root) && isWithinRoot(config.rootDir, realpathSync(row.workspace_root))) paths.add(row.workspace_root);
      }
    } finally { central.close(); }
  }
  if (discover) {
    for (const ledger of discoverAgentLearningLedgers(config.rootDir)) paths.add(ledger.workspaceRoot);
  }
  const connected = [];
  const errors = [];
  for (const path of paths) {
    try { connected.push(connectWorkspace(path, config)); }
    catch (error) { errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  if (errors.length) throw new Error(`Synced ${connected.length} workspaces; failures:\n${errors.join('\n')}`);
  return { ok: true, corpusPath: config.corpusPath, workspaces: connected.length,
    hookEvents: connected.reduce((sum, row) => sum + (row.connected ? row.imported.hookEvents : 0), 0) };
}
