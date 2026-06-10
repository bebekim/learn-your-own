import { getExerciseView } from '../../reducers.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const EXERCISE_COMMANDS: Record<string, CommandHandler> = {
  'exercise view': exerciseViewCommand,
};

function exerciseViewCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => ({
    ok: true,
    ...getExerciseView(kernel, {
      exerciseId: args.flagValue('--exercise-id'),
      runId: args.flagValue('--run-id'),
      limit: args.optionalNumber('--limit') ?? undefined,
    }),
  }));
}
