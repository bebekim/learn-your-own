import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { nativeCheckReceiptSchema } from '../control/native-check.ts';
import { isWithinRoot } from '../corpus/workspace-sync.ts';
import { verifierCommand } from '../bridge/verifier-command.ts';
import { hookValueText } from './test-summary.ts';
import type { CodexHookInput } from './adapters/codex.ts';

const bindingSchema = z.object({ id: z.string(), sessionId: z.string(), toolUseId: z.string(),
  cwd: z.string(), createdAt: z.string(), originalInput: z.record(z.string(), z.unknown()),
  updatedInput: z.record(z.string(), z.unknown()), receiptPath: z.string() }).strict();

function paths(event: CodexHookInput) {
  if (!event.cwd || !event.session_id || !event.tool_use_id || event.tool_name !== 'Bash') return null;
  const cwd = realpathSync(event.cwd);
  const id = hashValue(['codex-command-status@1', event.session_id, event.turn_id ?? null, event.tool_use_id, cwd]);
  const directory = join(cwd, '.agent-learning', 'command-receipts');
  for (const path of [join(cwd, '.agent-learning'), directory]) {
    if (existsSync(path) && !isWithinRoot(cwd, realpathSync(path))) throw new Error('Command receipt directory escapes workspace');
  }
  return { cwd, id, directory, bindingPath: join(directory, `${id}.binding.json`), receiptPath: join(directory, `${id}.json`) };
}

/** Opt-in: standalone foreground verifiers only; no automatic shell-program rewriting. */
export function codexCommandStatusRewrite(event: CodexHookInput) {
  if (event.hook_event_name !== 'PreToolUse') return null;
  const input = event.tool_input as Record<string, unknown> | undefined;
  const command = input?.command;
  if (typeof command !== 'string' || input?.run_in_background || /[;&|<>\n\r`$()]/.test(command) || !verifierCommand(command)) return null;
  const location = paths(event);
  if (!location) return null;
  mkdirSync(location.directory, { recursive: true });
  if (existsSync(location.bindingPath)) {
    if (!isWithinRoot(location.directory, realpathSync(location.bindingPath))) throw new Error('Command binding escapes workspace');
    const prior = bindingSchema.parse(JSON.parse(readFileSync(location.bindingPath, 'utf8')));
    if (hashValue(prior.originalInput) !== hashValue(input)) throw new Error('Conflicting command capture identity');
    return { permissionDecision: 'allow' as const, updatedInput: prior.updatedInput };
  }
  const request = Buffer.from(JSON.stringify({ id: location.id, command, workspace: location.cwd,
    receiptPath: location.receiptPath })).toString('base64url');
  const runner = fileURLToPath(new URL(`../control/native-check.${import.meta.url.endsWith('.ts') ? 'ts' : 'js'}`, import.meta.url));
  const wrapped = [process.execPath, runner, request].map(value => `'${value.replaceAll("'", "'\\''")}'`).join(' ');
  const updatedInput = { ...input, command: wrapped };
  writeFileSync(location.bindingPath, JSON.stringify({ id: location.id, sessionId: event.session_id,
    toolUseId: event.tool_use_id, cwd: location.cwd, createdAt: new Date().toISOString(), originalInput: input,
    updatedInput, receiptPath: location.receiptPath }), { flag: 'wx', mode: 0o600 });
  return { permissionDecision: 'allow' as const, updatedInput };
}

/** Retain the as-issued command and a bound completion signal; absent/invalid receipts add no status. */
export function codexCommandStatusEvent(event: CodexHookInput): CodexHookInput {
  if (event.hook_event_name !== 'PostToolUse' || event.is_interrupt) return event;
  try {
    const location = paths(event);
    if (!location || !existsSync(location.bindingPath) || !existsSync(location.receiptPath)) return event;
    if (!isWithinRoot(location.directory, realpathSync(location.bindingPath))
      || !isWithinRoot(location.directory, realpathSync(location.receiptPath))) return event;
    const binding = bindingSchema.parse(JSON.parse(readFileSync(location.bindingPath, 'utf8')));
    const receipt = nativeCheckReceiptSchema.parse(JSON.parse(readFileSync(location.receiptPath, 'utf8')));
    if (binding.id !== location.id || binding.sessionId !== event.session_id || binding.toolUseId !== event.tool_use_id
      || binding.cwd !== location.cwd || binding.receiptPath !== location.receiptPath
      || hashValue(binding.updatedInput) !== hashValue(event.tool_input)
      || receipt.id !== binding.id || receipt.commandHash !== hashValue(binding.originalInput.command)
      || receipt.cwd !== location.cwd || receipt.exitCode === null || receipt.signal
      || !(Date.parse(binding.createdAt) <= Date.parse(receipt.startedAt)
        && Date.parse(receipt.startedAt) <= Date.parse(receipt.endedAt) && Date.parse(receipt.endedAt) <= Date.now())) return event;
    return { ...event, tool_input: binding.originalInput,
      tool_response: { output: hookValueText(event.tool_response), exit_code: receipt.exitCode },
      command_status_receipt: { basis: 'command-receipt@1', id: receipt.id, cwd: receipt.cwd,
        hostToolInputHash: hashValue(event.tool_input), receiptHash: hashValue(receipt) } };
  } catch { return event; }
}
