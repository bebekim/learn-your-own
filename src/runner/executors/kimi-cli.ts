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
  retryDelayMs?: number;
}

const DEFAULT_RETRY_DELAY_MS = 5000;

/**
 * Agentic executor: runs `kimi -p` headless (auto permission mode) with the
 * sandbox as working directory. The agent writes outputs into the sandbox
 * directly; the sandbox only contains the stage's declared reads, so the
 * filesystem view IS the blindness boundary.
 *
 * A single retry guards against transient mid-request deaths (dropped
 * connection, momentary rate limit): the stage is stateless, so a fresh
 * process with the same prompt is a clean retry, not a repeated side effect.
 */
export function createKimiCliExecutor({
  model,
  spawnKimi,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: KimiCliExecutorOptions = {}): StageExecutor {
  const spawnFn: SpawnKimiFn = spawnKimi || ((args) => defaultSpawnKimi({ ...args, timeoutMs }));
  return async ({ prompt, sandboxDir }) => {
    const transcripts: string[] = [];
    for (let attempt = 1; attempt <= 2; attempt++) {
      const result = await spawnFn({ prompt, cwd: sandboxDir, model });
      transcripts.push(
        [`--- attempt ${attempt} (exit ${result.code}) ---`, result.stdout, result.stderr]
          .filter(Boolean)
          .join('\n')
      );
      if (result.code === 0) {
        return { transcript: transcripts.join('\n') };
      }
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      }
    }
    throw new Error(`kimi failed after 2 attempts:\n${transcripts.join('\n').slice(0, 1000)}`);
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
