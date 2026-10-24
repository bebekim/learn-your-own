import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FeedbackController } from '../../control/feedback-controller.ts';
import { openKernel, withKernel } from './context.ts';
import { closeKernel } from '../../storage/ledger.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { nativeFeedbackStatus } from '../../control/native-feedback.ts';
import { TaskFeedback } from '../../control/task-feedback.ts';
import { runTask } from '../../control/task-run.ts';
import { CliArgs } from '../args.ts';
import { workspaceSyncConfig } from '../../corpus/workspace-sync.ts';
import { renderTaskIntervention } from '../../control/task-intervention.ts';

export const CONTROL_COMMANDS: Record<string, CommandHandler> = {
  'control status': args => withKernel(args, nativeFeedbackStatus),
  'control decide': controlCommand,
  'control feedback': controlCommand,
  'control inspect': controlCommand,
  'task register': taskCommand,
  'task finish': taskCommand,
  'task inspect': taskCommand,
  'task freeze': taskCommand,
  'task report': taskCommand,
  'task compare': taskCommand,
  'task run': taskCommand,
  'task derive': deriveTaskCommand,
  'task trial': taskCommand,
  'task intervention': taskCommand,
  'task analyses': taskCommand,
};

function taskCommand(args: CommandArgs): unknown {
  const dbPath = args.flagValue('--db') ?? args.env.LEARNLOOP_DB ?? workspaceSyncConfig(args.env)?.corpusPath ?? args.dbPath;
  if (args.subcommand === 'run') return runTask(resolve(args.cwd, args.requiredFlag('--input')), dbPath,
    resolve(args.cwd, args.requiredFlag('--trace')), args.flagValue('--host-binary'));
  args = new CliArgs([...args.argv, '--db', dbPath], args.env, args.cwd);
  return withKernel(args, kernel => {
    const loop = new TaskFeedback(kernel);
    if (args.subcommand === 'trial') return { ok: true, policy: loop.trial(args.requiredFlag('--intervention-id'),
      args.flagValue('--budget') ? JSON.parse(readFileSync(resolve(args.cwd, args.flagValue('--budget')!), 'utf8')) : undefined) };
    if (args.subcommand === 'intervention') {
      const intervention = loop.intervention(args.requiredFlag('--intervention-id'));
      const output = args.flagValue('--output');
      if (output) writeFileSync(resolve(args.cwd, output), renderTaskIntervention(intervention), { flag: 'wx' });
      return { ok: true, intervention };
    }
    if (args.subcommand === 'register') return { ok: true,
      attempt: loop.register(JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'))) };
    if (args.subcommand === 'compare') return { ok: true,
      comparison: loop.registerComparison(JSON.parse(readFileSync(resolve(args.cwd, args.requiredFlag('--input')), 'utf8'))) };
    if (args.subcommand === 'report') return { ok: true, report: loop.report(args.requiredFlag('--policy-id'), args.flagValue('--comparison-id')) };
    const id = args.requiredFlag('--attempt-id');
    if (args.subcommand === 'analyses') return { ok: true, analyses: loop.analyses(id) };
    if (args.subcommand === 'finish') return { ok: true, receipt: loop.finish(id, resolve(args.cwd, args.requiredFlag('--trace'))) };
    if (args.subcommand === 'freeze') return { ok: true, policy: loop.freeze(id) };
    return { ok: true, attempt: loop.inspect(id) };
  });
}

async function deriveTaskCommand(args: CommandArgs) {
  const dbPath = args.flagValue('--db') ?? args.env.LEARNLOOP_DB ?? workspaceSyncConfig(args.env)?.corpusPath ?? args.dbPath;
  const kernel = openKernel(new CliArgs([...args.argv, '--db', dbPath], args.env, args.cwd));
  try {
    return { ok: true, intervention: await new TaskFeedback(kernel).derive(args.requiredFlag('--attempt-id'), {
      repoPath: resolve(args.cwd, args.requiredFlag('--repo')), model: args.requiredFlag('--model'),
      reuseAnalysisId: args.flagValue('--reuse-analysis'),
    }) };
  } finally { closeKernel(kernel); }
}

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
