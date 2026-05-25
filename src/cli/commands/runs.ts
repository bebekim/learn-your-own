import { readFileSync } from 'node:fs';
import {
  finishRun,
  recordModelCall,
  recordRun,
} from '../../reducers.ts';
import { modelCallStatus } from '../coercion.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const RUN_COMMANDS: Record<string, CommandHandler> = {
  'model-call record': recordModelCallCommand,
  'run-start': runStartCommand,
  'run-finish': runFinishCommand,
};

function recordModelCallCommand(args: CommandArgs): unknown {
  const promptFile = args.flagValue('--prompt-file');
  const promptText = promptFile ? readFileSync(promptFile, 'utf8') : undefined;
  return withKernel(args, (kernel) => ({
    ok: true,
    modelCall: recordModelCall(kernel, {
      callId: args.flagValue('--call-id'),
      sessionId: args.flagValue('--session-id') ?? null,
      runId: args.flagValue('--run-id') ?? null,
      provider: args.requiredFlag('--provider'),
      model: args.requiredFlag('--model'),
      modelLane: args.requiredFlag('--model-lane'),
      promptRef: args.flagValue('--prompt-ref') ?? promptFile ?? null,
      promptText,
      promptHash: args.flagValue('--prompt-hash') ?? null,
      promptSummary: args.flagValue('--summary') ?? null,
      inputTokens: args.optionalNumber('--input-tokens'),
      outputTokens: args.optionalNumber('--output-tokens'),
      totalTokens: args.optionalNumber('--total-tokens'),
      estimatedCost: args.optionalNumber('--estimated-cost'),
      latencyMs: args.optionalNumber('--latency-ms'),
      status: modelCallStatus(args.flagValue('--status')),
      errorSummary: args.flagValue('--error') ?? null,
    }),
  }));
}

function runStartCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    run: recordRun(kernel, {
      runId: args.requiredFlag('--run-id'),
      taskShape: args.requiredFlag('--task-shape'),
      channel: args.requiredFlag('--channel'),
      status: args.flagValue('--status') ?? 'started',
      tokenCost: Number(args.flagValue('--token-cost') ?? 0),
    }),
  }));
}

function runFinishCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    run: finishRun(kernel, {
      runId: args.requiredFlag('--run-id'),
      status: args.flagValue('--status') ?? 'completed',
      tokenCost: args.flagValue('--token-cost') === undefined
        ? undefined
        : Number(args.flagValue('--token-cost')),
    }),
  }));
}
