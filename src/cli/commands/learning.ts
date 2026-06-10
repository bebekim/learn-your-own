import { buildStyleLearningReport } from '../../compiler/style-learning.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const LEARNING_COMMANDS: Record<string, CommandHandler> = {
  'learn style': learnStyleCommand,
};

function learnStyleCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    learning: buildStyleLearningReport(kernel),
  }));
}
