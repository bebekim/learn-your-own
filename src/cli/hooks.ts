import { join } from 'node:path';
import {
  closeKernel,
  createKernel,
} from '../ledger.ts';
import { initLedger } from '../schema.ts';
import {
  drainHookSpool,
  handleClaudeHook,
  handleCodexHook,
  spoolClaudeHookEvent,
  spoolCodexHookEvent,
} from '../hooks/runtime.ts';
import { CliArgs, readStdin } from './args.ts';
import { normalizeOutcome } from './coercion.ts';

export async function runCodexHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const event = input.trim() ? JSON.parse(input) : {};
  const eventCwd = typeof event.cwd === 'string' && event.cwd ? event.cwd : args.cwd;
  const effectiveDbPath = args.hasFlag('--db-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'learning.sqlite')
    : args.dbPath;
  const effectivePromptDir = args.hasFlag('--prompt-dir-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'prompts')
    : args.promptDir;
  const effectiveSpoolDir = args.hasFlag('--spool-dir-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'hook-spool')
    : args.flagValue('--spool-dir') ?? args.env.LEARNLOOP_HOOK_SPOOL_DIR;

  if (effectiveSpoolDir) {
    spoolCodexHookEvent(event, {
      spoolDir: effectiveSpoolDir,
      promptDir: effectivePromptDir,
    });
    if (event.hook_event_name === 'Stop' && args.env.LEARNLOOP_DRAIN_SPOOL_ON_STOP !== '0') {
      tryDrainSpool(args, effectiveDbPath, effectiveSpoolDir);
    }
    return emptyHookOutput(event.hook_event_name ?? 'Unknown');
  }

  const kernel = createKernel({ dbPath: effectiveDbPath });
  try {
    initLedger(kernel);
    return handleCodexHook(kernel, event, {
      channel: args.channel,
      promptDir: effectivePromptDir,
      normalizeOnStop: !args.hasFlag('--no-normalize-on-stop') && args.env.LEARNLOOP_NORMALIZE_ON_STOP !== '0',
      normalizeOnToolUse: !args.hasFlag('--no-normalize-on-tool-use') && args.env.LEARNLOOP_NORMALIZE_ON_TOOL_USE !== '0',
      normalizeWorkspaceId: args.flagValue('--workspace-id'),
      normalizeOutcome: normalizeOutcome(args.flagValue('--outcome')),
    });
  } finally {
    closeKernel(kernel);
  }
}

export async function runClaudeHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const event = input.trim() ? JSON.parse(input) : {};
  const eventCwd = typeof event.cwd === 'string' && event.cwd ? event.cwd : args.cwd;
  const effectiveDbPath = args.hasFlag('--db-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'learning.sqlite')
    : args.dbPath;
  const effectivePromptDir = args.hasFlag('--prompt-dir-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'prompts')
    : args.promptDir;
  const effectiveSpoolDir = args.hasFlag('--spool-dir-from-event-cwd')
    ? join(eventCwd, '.agent-learning', 'hook-spool')
    : args.flagValue('--spool-dir') ?? args.env.LEARNLOOP_HOOK_SPOOL_DIR;

  if (effectiveSpoolDir) {
    spoolClaudeHookEvent(event, {
      spoolDir: effectiveSpoolDir,
      promptDir: effectivePromptDir,
    });
    if ((event.hook_event_name === 'Stop' || event.hook_event_name === 'SessionEnd') && args.env.LEARNLOOP_DRAIN_SPOOL_ON_STOP !== '0') {
      tryDrainSpool(args, effectiveDbPath, effectiveSpoolDir);
    }
    return {};
  }

  const kernel = createKernel({ dbPath: effectiveDbPath });
  try {
    initLedger(kernel);
    return handleClaudeHook(kernel, event, {
      promptDir: effectivePromptDir,
      normalizeOnStop: !args.hasFlag('--no-normalize-on-stop') && args.env.LEARNLOOP_NORMALIZE_ON_STOP !== '0',
      normalizeOnToolUse: !args.hasFlag('--no-normalize-on-tool-use') && args.env.LEARNLOOP_NORMALIZE_ON_TOOL_USE !== '0',
      normalizeWorkspaceId: args.flagValue('--workspace-id'),
      normalizeOutcome: normalizeOutcome(args.flagValue('--outcome')),
    });
  } finally {
    closeKernel(kernel);
  }
}

function tryDrainSpool(args: CliArgs, dbPath: string, spoolDir: string): void {
  try {
    const kernel = createKernel({ dbPath });
    try {
      initLedger(kernel);
      drainHookSpool(kernel, {
        spoolDir,
        normalize: true,
        normalizeWorkspaceId: args.flagValue('--workspace-id'),
        normalizeOutcome: normalizeOutcome(args.flagValue('--outcome')),
      });
    } finally {
      closeKernel(kernel);
    }
  } catch {
    // Hook capture has already succeeded; ingestion can be retried later.
  }
}

function emptyHookOutput(eventName: string): Record<string, true> {
  if (eventName === 'PreToolUse') return {};
  return { continue: true };
}
