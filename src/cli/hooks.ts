import { join } from 'node:path';
import { translateBobEvent } from '../adapters/bob.ts';
import { translateEcaEvent } from '../adapters/eca.ts';
import { emitSessionLessons, resolveSessionLessonStorePath } from '../lyo/selection/session-hook.ts';
import { emitFindingReviewQueue, findingOwnsToolCall } from '../lyo/interface/session-finding-workflow.ts';
import {
  closeKernel,
  createKernel,
} from '../ledger.ts';
import { initLedger } from '../schema.ts';
import { translateAgyEvent } from '../adapters/antigravity.ts';
import { translateDcodeEvent } from '../adapters/deepagents.ts';
import { translateGeminiEvent } from '../adapters/gemini.ts';
import {
  drainHookSpool,
  handleClaudeHook,
  handleCodexHook,
  spoolClaudeHookEvent,
  spoolCodexHookEvent,
} from '../hooks/runtime.ts';
import { CliArgs, readStdin } from './args.ts';
import { normalizeOutcome } from './coercion.ts';
import { autoConnectWorkspace } from '../corpus/workspace-sync.ts';
import { nativeFeedback } from '../lyo/control/native-feedback.ts';
import { ordinaryFindingTrialFeedback } from '../lyo/interface/finding-trials.ts';

export async function runCodexHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const event = input.trim() ? JSON.parse(input) : {};
  return addNativeFeedback(await captureCodexHook(args, event), 'codex', event, args);
}

async function captureCodexHook(args: CliArgs, event: Record<string, any>): Promise<unknown> {
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
    if ((event.hook_event_name === 'Stop' || event.hook_event_name === 'SessionEnd') && args.env.LEARNLOOP_DRAIN_SPOOL_ON_STOP !== '0') {
      tryDrainSpool(args, effectiveDbPath, effectiveSpoolDir);
    }
    syncHookWorkspace(args, event.hook_event_name, eventCwd);
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
    syncHookWorkspace(args, event.hook_event_name, eventCwd);
  }
}

export async function runClaudeHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const event = input.trim() ? JSON.parse(input) : {};
  return addNativeFeedback(await runClaudeStyleHook(args, event), 'claude', event, args);
}

function addNativeFeedback(output: any, runtime: 'codex' | 'claude', event: Record<string, any>, args: CliArgs): unknown {
  let trialManaged = false;
  try {
    const cwd = event.cwd || args.cwd;
    const trial = ordinaryFindingTrialFeedback(runtime, { ...event, cwd }, resolveSessionLessonStorePath(cwd));
    trialManaged = trial.managed;
    if (trial.additionalContext) output = { ...output, hookSpecificOutput: { ...output.hookSpecificOutput,
      hookEventName: event.hook_event_name, additionalContext: [output.hookSpecificOutput?.additionalContext, trial.additionalContext].filter(Boolean).join('\n') } };
  } catch (error) {
    // An uncertain assignment must not fall through into a different intervention.
    trialManaged = true;
    process.stderr.write(`Lyo prospective trial: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  if (trialManaged) return output;
  if (['PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name)) {
    try {
      const cwd = event.cwd || args.cwd, storePath = resolveSessionLessonStorePath(cwd);
      let additionalContext = '';
      if (storePath) emitFindingReviewQueue(storePath, cwd, event.session_id ?? null, text => { additionalContext += text; });
      if (additionalContext) output = { ...output, hookSpecificOutput: { ...output.hookSpecificOutput,
        hookEventName: event.hook_event_name, additionalContext: [output.hookSpecificOutput?.additionalContext, additionalContext].filter(Boolean).join('\n') } };
    } catch { /* Pending review delivery must not block capture or native feedback. */ }
  }
  try {
    const findingEvent = { ...event, cwd: event.cwd || args.cwd };
    try {
      if (findingOwnsToolCall(resolveSessionLessonStorePath(findingEvent.cwd), runtime, findingEvent)) return output;
    } catch { /* An unavailable finding store must not disable the separate native controller. */ }
    const native = nativeFeedback(runtime, { ...event, cwd: event.cwd || args.cwd }, args.env);
    if (native) return { ...output, hookSpecificOutput: { ...output.hookSpecificOutput, ...native,
      hookEventName: event.hook_event_name,
      ...(native.additionalContext ? { additionalContext:
        [output.hookSpecificOutput?.additionalContext, native.additionalContext].filter(Boolean).join('\n') } : {}) } };
  } catch (error) {
    process.stderr.write(`Lyo adaptive feedback: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  return output;
}

export async function runBobHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const payload = input.trim() ? JSON.parse(input) : {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const event = translateBobEvent(payload);
  return event ? runClaudeStyleHook(args, event) : {};
}

export async function runEcaHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const payload = input.trim() ? JSON.parse(input) : {};
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const event = translateEcaEvent(payload);
  if (!event) return {};
  await runClaudeStyleHook(args, event);
  let additionalContext = '';
  if (payload.hook_type === 'chatStart' || payload.hook_type === 'preRequest') {
    emitSessionLessons(event, text => { additionalContext += text; });
  }
  return additionalContext ? { additionalContext } : {};
}

export async function runGeminiHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const event = input.trim() ? JSON.parse(input) : {};
  return runClaudeStyleHook(args, translateGeminiEvent(event));
}

export async function runAgyHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  // Antigravity payloads omit the event name; the hooks.json command passes it
  // as the positional argument right after `agy-hook`.
  const eventName = args.subcommand ?? 'Unknown';
  const input = await readStdin(stdin);
  const payload = input.trim() ? JSON.parse(input) : {};
  const translated = translateAgyEvent(eventName, payload);
  if (translated === null) {
    return {};
  }
  const result = await runClaudeStyleHook(args, translated);
  // Antigravity denies tool calls whose PreToolUse hook does not explicitly
  // allow them; every other event accepts an empty object.
  if (translated.hook_event_name === 'PreToolUse') {
    return { decision: 'allow' };
  }
  return result;
}

export async function runDcodeHookCommand(
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
): Promise<unknown> {
  const input = await readStdin(stdin);
  const payload = input.trim() ? JSON.parse(input) : {};
  return runClaudeStyleHook(args, translateDcodeEvent(payload));
}

async function runClaudeStyleHook(
  args: CliArgs,
  event: Record<string, unknown>
): Promise<unknown> {
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
    syncHookWorkspace(args, event.hook_event_name, eventCwd);
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
    syncHookWorkspace(args, event.hook_event_name, eventCwd);
  }
}

function syncHookWorkspace(args: CliArgs, eventName: unknown, cwd: string): void {
  if (args.hasFlag('--db-from-event-cwd') && ['SessionStart', 'UserPromptSubmit', 'Stop', 'SessionEnd'].includes(String(eventName))) {
    autoConnectWorkspace(cwd, args.env);
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
