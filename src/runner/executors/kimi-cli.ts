import { execFile } from 'node:child_process';

import type { StageExecutor } from './stage-executor.ts';

const DEFAULT_TIMEOUT_MS = 600000;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export interface KimiCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface SpawnKimiArgs {
  prompt: string;
  cwd: string;
  model?: string;
}

export type SpawnKimiFn = (args: SpawnKimiArgs) => Promise<KimiCliResult>;

export interface KimiCliExecutorOptions {
  model?: string;
  spawnKimi?: SpawnKimiFn;
  timeoutMs?: number;
}

/**
 * Agentic executor: runs `kimi -p` headless (auto permission mode) with the
 * sandbox as working directory. The agent writes outputs into the sandbox
 * directly; the sandbox only contains the stage's declared reads, so the
 * filesystem view IS the blindness boundary.
 */
export function createKimiCliExecutor({
  model,
  spawnKimi,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: KimiCliExecutorOptions = {}): StageExecutor {
  const spawnFn: SpawnKimiFn = spawnKimi || ((args) => defaultSpawnKimi({ ...args, timeoutMs }));
  return async ({ prompt, sandboxDir }) => {
    const result = await spawnFn({ prompt, cwd: sandboxDir, model });
    if (result.code !== 0) {
      throw new Error(`kimi exited ${result.code}: ${result.stderr.slice(0, 500)}`);
    }
    return { transcript: [result.stdout, result.stderr].filter(Boolean).join('\n') };
  };
}

function defaultSpawnKimi({
  prompt,
  cwd,
  model,
  timeoutMs,
}: SpawnKimiArgs & { timeoutMs: number }): Promise<KimiCliResult> {
  const argv = ['-p', prompt];
  if (model) {
    argv.push('-m', model);
  }
  return new Promise((resolve, reject) => {
    execFile(
      'kimi',
      argv,
      { cwd, timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error && typeof error.code !== 'number') {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, code: typeof error?.code === 'number' ? error.code : 0 });
      }
    );
  });
}
