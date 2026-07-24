import { resolve } from 'node:path';

import {
  readReplayTrace,
  replayTrace,
} from '../../eval/replay.ts';
import { validateEvalTaskDirectory } from '../../eval/tasks.ts';
import { LessonStore } from '../../lyo/lesson-store.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const EVAL_COMMANDS: Record<string, CommandHandler> = {
  'eval replay': evalReplayCommand,
  'eval validate': evalValidateCommand,
};

function evalValidateCommand(args: CommandArgs): unknown {
  const dir = resolve(args.cwd, args.flagValue('--dir') ?? 'eval');
  return {
    ok: true,
    validation: validateEvalTaskDirectory(dir),
  };
}

function evalReplayCommand(args: CommandArgs): unknown {
  const trace = readReplayTrace(resolve(args.cwd, args.requiredFlag('--trace')));
  const store = new LessonStore(args.dbPath);
  try {
    return {
      ok: true,
      replay: replayTrace(store, trace, {
        seed: args.optionalNumber('--seed') ?? undefined,
        limit: args.optionalNumber('--limit') ?? undefined,
      }),
    };
  } finally {
    store.close();
  }
}
