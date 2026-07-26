import { resolve } from 'node:path';

import { runPipeline } from '../../runner/run-pipeline.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const PIPELINE_COMMANDS: Record<string, CommandHandler> = {
  'pipeline run': pipelineRunCommand,
};

async function pipelineRunCommand(args: CommandArgs): Promise<unknown> {
  const result = await runPipeline({
    planPath: resolve(args.requiredFlag('--plan')),
    runsRoot: resolve(args.flagValue('--runs-root') ?? 'runs'),
  });
  return {
    ok: true,
    runId: result.runId,
    runDir: result.runDir,
    outcome: result.report.outcome,
    counts: result.report.counts,
    reportPath: result.reportPath,
    tracePath: result.tracePath,
  };
}
