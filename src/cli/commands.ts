import { CliArgs } from './args.ts';
import { ACTIVATION_COMMANDS } from './commands/activation.ts';
import { ASSOCIATION_COMMANDS } from './commands/associations.ts';
import { CONTEXT_COMMANDS } from './commands/context.ts';
import { DEMO_COMMANDS } from './commands/demo.ts';
import { EXERCISE_COMMANDS } from './commands/exercise.ts';
import { HARNESS_COMMANDS } from './commands/harness.ts';
import { HOOK_COMMANDS } from './commands/hooks.ts';
import { INIT_COMMANDS } from './commands/init.ts';
import { LEARNING_COMMANDS } from './commands/learning.ts';
import { OBSERVATION_COMMANDS } from './commands/observation.ts';
import { RUN_COMMANDS } from './commands/runs.ts';
import { TAPE_COMMANDS } from './commands/tape.ts';
import { WORKSPACE_COMMANDS } from './commands/workspace.ts';
import type { CommandHandler } from './commands/context.ts';
import { usage } from './output.ts';

const COMMAND_HANDLERS: Record<string, CommandHandler> = {
  ...INIT_COMMANDS,
  ...HOOK_COMMANDS,
  ...HARNESS_COMMANDS,
  ...OBSERVATION_COMMANDS,
  ...LEARNING_COMMANDS,
  ...RUN_COMMANDS,
  ...TAPE_COMMANDS,
  ...WORKSPACE_COMMANDS,
  ...ACTIVATION_COMMANDS,
  ...ASSOCIATION_COMMANDS,
  ...CONTEXT_COMMANDS,
  ...EXERCISE_COMMANDS,
  ...DEMO_COMMANDS,
};

export async function runCommand(args: CliArgs, stdin: AsyncIterable<string | Buffer>): Promise<unknown> {
  const handler = COMMAND_HANDLERS[commandKey(args)];
  if (!handler) usage(1);
  return handler(args, stdin);
}

function commandKey(args: CliArgs): string {
  if (!args.command) return '';
  if (args.subcommand && !args.subcommand.startsWith('-')) {
    const compound = `${args.command} ${args.subcommand}`;
    if (Object.hasOwn(COMMAND_HANDLERS, compound)) return compound;
  }
  return args.command;
}
