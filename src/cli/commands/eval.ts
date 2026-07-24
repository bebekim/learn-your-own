import { resolve } from 'node:path';

import { validateEvalTaskDirectory } from '../../eval/tasks.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const EVAL_COMMANDS: Record<string, CommandHandler> = {
  'eval validate': evalValidateCommand,
};

function evalValidateCommand(args: CommandArgs): unknown {
  const dir = resolve(args.cwd, args.flagValue('--dir') ?? 'eval');
  return {
    ok: true,
    validation: validateEvalTaskDirectory(dir),
  };
}
