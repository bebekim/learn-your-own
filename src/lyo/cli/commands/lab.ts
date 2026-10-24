import { resolve } from 'node:path';
import type { CommandArgs, CommandHandler } from './context.ts';
import { reportLab, runLab } from '../../lab/runner.ts';

export const LAB_COMMANDS: Record<string, CommandHandler> = {
  'lab run': (args: CommandArgs) => runLab(resolve(args.cwd, args.requiredFlag('--plan')),
    resolve(args.cwd, args.flagValue('--out') ?? '.agent-learning/lab'),
    { dryRun: args.hasFlag('--dry-run'), hostBinary: args.flagValue('--host-binary') }),
  'lab report': (args: CommandArgs) => ({ ok: true, report: reportLab(resolve(args.cwd, args.requiredFlag('--out'))) }),
};
