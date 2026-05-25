import { runFixtureReplayDemo } from '../../reducers.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const DEMO_COMMANDS: Record<string, CommandHandler> = {
  'demo fixture-replay': demoFixtureReplayCommand,
};

function demoFixtureReplayCommand(args: CommandArgs): unknown {
  return runFixtureReplayDemo({ dbPath: args.dbPath });
}
