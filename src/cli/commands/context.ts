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
