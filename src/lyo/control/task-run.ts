import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createKernel, closeKernel } from '../../ledger.ts';
import { TaskFeedback } from './task-feedback.ts';

/** Register before launch and collect host usage plus independent verifier results after exit. */
export function runTask(inputPath: string, dbPath: string, tracePath: string, hostBinary?: string) {
  const kernel = createKernel({ dbPath });
  try {
    const loop = new TaskFeedback(kernel);
    const attempt = loop.register(JSON.parse(readFileSync(inputPath, 'utf8')));
    if (attempt.receipt) return { ok: true, receipt: attempt.receipt, reused: true };
    const { input } = attempt.registration;
    tracePath = resolve(tracePath);
    mkdirSync(dirname(tracePath), { recursive: true });
    const configPath = `${tracePath}.lyo-config.json`;
    writeFileSync(configPath, JSON.stringify({ rootDir: input.cwd, corpusPath: resolve(dbPath), adaptiveFeedback: { mode: 'explore' } }), { flag: 'wx' });
    const args = input.runtime === 'codex'
      ? ['exec', '--ephemeral', '--json', '--sandbox', 'workspace-write', '--model', input.model, '--cd', input.cwd, input.task.prompt]
      : ['-p', '--output-format', 'stream-json', '--verbose', '--include-hook-events', '--no-session-persistence',
        '--model', input.model, '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(rtk *)', input.task.prompt];
    const invocation = { binary: hostBinary ?? input.runtime, args, cwd: input.cwd,
      registrationHash: attempt.registration.hash, startedAt: new Date().toISOString() };
    writeFileSync(`${tracePath}.launch.json`, JSON.stringify(invocation, null, 2), { flag: 'wx' });
    const out = openSync(tracePath, 'wx');
    let result;
    try {
      const err = openSync(`${tracePath}.stderr.log`, 'wx');
      try {
        result = spawnSync(invocation.binary, args, { cwd: input.cwd,
          env: { ...process.env, LYO_CONFIG_FILE: configPath }, stdio: ['ignore', out, err],
          timeout: Math.ceil(input.task.budget.max_wall_time_seconds * 1000), killSignal: 'SIGKILL' });
      } finally { closeSync(err); }
    } finally { closeSync(out); }
    const host = { exitCode: result.status, signal: result.signal, error: result.error?.message ?? null, tracePath };
    writeFileSync(`${tracePath}.exit.json`, JSON.stringify(host, null, 2), { flag: 'wx' });
    try {
      return { ok: true, host, receipt: loop.finish(input.attemptId, tracePath) };
    } catch (error) {
      // Keep the registered attempt and host artifacts available for inspection/recovery; never invent feedback.
      return { ok: false, host, error: error instanceof Error ? error.message : String(error), attemptId: input.attemptId };
    }
  } finally { closeKernel(kernel); }
}
