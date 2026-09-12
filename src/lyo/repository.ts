import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function repositoryKey(cwd?: string | null): string | null {
  if (!cwd) return null;
  try {
    return fs.realpathSync(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      { cwd, encoding: 'utf8', timeout: 1000, stdio: ['ignore', 'pipe', 'ignore'] }).trim());
  } catch { return null; }
}
