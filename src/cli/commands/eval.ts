import { resolve } from 'node:path';

import {
  parseBaselineId,
  runLocalEpisode,
} from '../../eval/live-runner.ts';
import {
  buildEvalReport,
  readEpisodeRows,
  renderEvalReportMarkdown,
} from '../../eval/report.ts';
import {
  readReplayTrace,
  replayTrace,
} from '../../eval/replay.ts';
import {
  readEvalTask,
  validateEvalTaskDirectory,
} from '../../eval/tasks.ts';
import { LessonStore } from '../../lyo/lesson-store.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const EVAL_COMMANDS: Record<string, CommandHandler> = {
  'eval report': evalReportCommand,
  'eval replay': evalReplayCommand,
  'eval run-local': evalRunLocalCommand,
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

function evalRunLocalCommand(args: CommandArgs): unknown {
  return {
    ok: true,
    episode: runLocalEpisode({
      task: readEvalTask(resolve(args.cwd, args.requiredFlag('--task'))),
      baselineId: parseBaselineId(args.requiredFlag('--baseline')),
      model: args.flagValue('--model') ?? 'unknown',
      harness: args.flagValue('--harness') ?? 'local-shell',
      cwd: args.cwd,
      dbPath: args.dbPath,
      scopeKind: args.flagValue('--scope-kind') ?? 'repository',
      scopeValue: args.flagValue('--scope-value') ?? args.cwd,
      staticSkill: args.flagValue('--static-skill') ?? null,
    }),
  };
}

function evalReportCommand(args: CommandArgs): unknown {
  const report = buildEvalReport(readEpisodeRows(resolve(args.cwd, args.requiredFlag('--episodes'))), {
    ruleId: args.flagValue('--rule-id'),
    baselineId: args.flagValue('--baseline') ? parseBaselineId(args.requiredFlag('--baseline')) : undefined,
    treatmentId: args.flagValue('--treatment') ? parseBaselineId(args.requiredFlag('--treatment')) : undefined,
  });
  return {
    ok: true,
    report,
    markdown: args.hasFlag('--markdown') ? renderEvalReportMarkdown(report) : undefined,
  };
}
