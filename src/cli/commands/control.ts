import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FeedbackController } from '../../lyo/control/feedback-controller.ts';
import { withKernel } from './context.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { nativeFeedbackStatus } from '../../lyo/control/native-feedback.ts';

export const CONTROL_COMMANDS: Record<string, CommandHandler> = {
  'control status': args => withKernel(args, nativeFeedbackStatus),
  'control decide': controlCommand,
  'control feedback': controlCommand,
  'control inspect': controlCommand,
};

function controlCommand(args: CommandArgs): unknown {
  const specification = JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--spec')), 'utf8'));
  return withKernel(args, kernel => {
    const controller = new FeedbackController(kernel, specification);
    if (args.subcommand === 'inspect') return { ok: true, episode: controller.inspect(args.requiredFlag('--episode-id')) };
    const input = JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'));
    if (args.subcommand === 'decide') return { ok: true, decision: controller.decide(input) };
    controller.feedback(input);
    return { ok: true };
  });
}
