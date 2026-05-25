import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const INIT_COMMANDS: Record<string, CommandHandler> = {
  init: initCommand,
};

function initCommand(args: CommandArgs): unknown {
  return withKernel(args, () => ({ ok: true, dbPath: args.dbPath }));
}
