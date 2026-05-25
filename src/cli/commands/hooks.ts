import { drainHookSpool } from '../../hooks/runtime.ts';
import { normalizeHooks } from '../../hooks/normalization-runner.ts';
import { normalizeOutcome } from '../coercion.ts';
import {
  runClaudeHookCommand,
  runCodexHookCommand,
} from '../hooks.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const HOOK_COMMANDS: Record<string, CommandHandler> = {
  'codex-hook': runCodexHookCommand,
  'claude-hook': runClaudeHookCommand,
  'normalize hooks': normalizeHooksCommand,
};

function normalizeHooksCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => {
    const spoolDir = args.flagValue('--spool-dir') ?? args.env.LEARNLOOP_HOOK_SPOOL_DIR;
    const spool = spoolDir
      ? drainHookSpool(kernel, {
          spoolDir,
          limit: args.optionalNumber('--limit') ?? undefined,
          normalize: false,
        })
      : null;
    return {
      ok: true,
      ...(spool ? { spool } : {}),
      ...normalizeHooks(kernel, {
        workspaceId: args.flagValue('--workspace-id'),
        outcome: normalizeOutcome(args.flagValue('--outcome')),
        limit: args.optionalNumber('--limit') ?? undefined,
      }),
    };
  });
}
