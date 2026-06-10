import { recordRunGoal } from '../../reducers.ts';
import {
  closeKernel,
  createKernel,
} from '../../ledger.ts';
import type { LearningKernel } from '../../ledger.ts';
import { initLedger } from '../../schema.ts';
import type { CliArgs } from '../args.ts';

export type CommandArgs = CliArgs;

export type CommandHandler = (
  args: CliArgs,
  stdin: AsyncIterable<string | Buffer>
) => Promise<unknown> | unknown;

export function openKernel(args: CliArgs): LearningKernel {
  const kernel = createKernel({ dbPath: args.dbPath });
  initLedger(kernel);
  return kernel;
}

export function withKernel<T>(args: CliArgs, work: (kernel: LearningKernel) => T): T {
  const kernel = openKernel(args);
  try {
    return work(kernel);
  } finally {
    closeKernel(kernel);
  }
}

export const CONTEXT_COMMANDS: Record<string, CommandHandler> = {
  'context goal': contextGoalCommand,
};

function contextGoalCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    goal: recordRunGoal(kernel, {
      runId: args.requiredFlag('--run-id'),
      goal: args.requiredFlag('--goal'),
      successCriteria: args.flagValue('--success-criteria') ?? null,
      stopCondition: args.flagValue('--stop-condition') ?? null,
      expectedProcess: args.flagValue('--expected-process') ?? null,
      riskClass: args.flagValue('--risk-class') ?? null,
    }),
  }));
}
