import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { isWithinRoot } from '../corpus/workspace-sync.ts';

const requestSchema = z.object({
  id: z.string().min(1), command: z.string().min(1),
  workspace: z.string().min(1), receiptPath: z.string().min(1),
}).strict();
export const nativeCheckReceiptSchema = z.object({
  id: z.string(), commandHash: z.string(), cwd: z.string(), startedAt: z.string(), endedAt: z.string(),
  exitCode: z.number().int().nonnegative().nullable(), signal: z.string().nullable(),
}).strict();

function run() {
  const input = requestSchema.parse(JSON.parse(Buffer.from(process.argv[2] ?? '', 'base64url').toString('utf8')));
  if (!isWithinRoot(realpathSync(input.workspace), realpathSync(dirname(input.receiptPath)))) {
    throw new Error('Measurement receipt must stay within the workspace');
  }
  if (existsSync(input.receiptPath)) throw new Error('Measurement receipt already exists');
  const startedAt = new Date().toISOString();
  const cwd = process.cwd();
  const result = spawnSync(process.env.SHELL || '/bin/sh', ['-c', input.command], { stdio: 'inherit' });
  try {
    writeFileSync(input.receiptPath, JSON.stringify({ id: input.id,
      commandHash: hashValue(input.command), cwd, startedAt, endedAt: new Date().toISOString(),
      exitCode: result.status, signal: result.signal }), { flag: 'wx' });
  } catch (error) { process.stderr.write(`Lyo measurement receipt: ${String(error)}\n`); }
  if (result.error) process.stderr.write(`Lyo check launch: ${result.error.message}\n`);
  if (result.signal) process.kill(process.pid, result.signal);
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) run();
