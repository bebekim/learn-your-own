import { execFileSync } from 'node:child_process';

export const ROOT = new URL('../..', import.meta.url).pathname;

export function runLyo(args, options = {}) {
  const {
    expectFailure = false,
    ...execOptions
  } = options;
  try {
    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', ...args],
      {
        cwd: ROOT,
        encoding: 'utf8',
        ...execOptions,
      }
    );
    if (expectFailure) {
      throw new Error(`expected lyo command to fail: ${args.join(' ')}`);
    }
    return output;
  } catch (error) {
    if (!expectFailure) throw error;
    return commandFailureOutput(error);
  }
}

export function runLyoJson(args, options = {}) {
  return JSON.parse(runLyo(args, options));
}

function commandFailureOutput(error) {
  if (typeof error?.stdout === 'string' || typeof error?.stderr === 'string') {
    return `${error.stdout ?? ''}${error.stderr ?? ''}`;
  }
  if (Buffer.isBuffer(error?.stdout) || Buffer.isBuffer(error?.stderr)) {
    return `${error.stdout?.toString('utf8') ?? ''}${error.stderr?.toString('utf8') ?? ''}`;
  }
  return error instanceof Error ? error.message : String(error);
}
