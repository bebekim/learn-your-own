import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadTuning } from './config/tuning.ts';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: loadTuning().git.timeoutMs, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

export function repositoryKey(cwd?: string | null): string | null {
  if (!cwd) return null;
  try {
    return fs.realpathSync(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  } catch { return null; }
}

/** The checkout (or linked worktree) root containing cwd; cwd itself outside git. */
export function workspaceRoot(cwd: string): string {
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']) || cwd;
  } catch { return cwd; }
}
