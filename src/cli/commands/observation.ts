import { readFileSync } from 'node:fs';
import {
  getObserverSummary,
  recordPromptBoundary,
  recordSessionStarted,
} from '../../reducers.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const OBSERVATION_COMMANDS: Record<string, CommandHandler> = {
  'session-start': sessionStartCommand,
  'record-prompt': recordPromptCommand,
  report: reportCommand,
};

function sessionStartCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    session: recordSessionStarted(kernel, {
      sessionId: args.requiredFlag('--session-id'),
      workspaceScope: args.flagValue('--workspace-scope') ?? 'local',
      repoPath: args.flagValue('--repo-path') ?? args.cwd,
      branch: args.flagValue('--branch'),
      platform: args.flagValue('--platform') ?? 'agent',
      model: args.flagValue('--model') ?? null,
    }),
  }));
}

function recordPromptCommand(args: CommandArgs): unknown {
  const promptFile = args.flagValue('--prompt-file');
  const promptText = promptFile ? readFileSync(promptFile, 'utf8') : undefined;
  return withKernel(args, (kernel) => ({
    ok: true,
    prompt: recordPromptBoundary(kernel, {
      sessionId: args.requiredFlag('--session-id'),
      runId: args.flagValue('--run-id') ?? null,
      turnId: args.flagValue('--turn-id') ?? null,
      role: args.requiredFlag('--role'),
      kind: args.flagValue('--kind') ?? 'user_prompt',
      promptText,
      promptRef: promptFile,
      summary: args.flagValue('--summary'),
      responseSummary: args.flagValue('--response'),
      model: args.flagValue('--model') ?? null,
    }),
  }));
}

function reportCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({ ok: true, ...getObserverSummary(kernel) }));
}
