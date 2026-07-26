import { resolve } from 'node:path';

import { consumeTraces } from '../../lyo/trace-consumer.ts';
import { runPipeline } from '../../runner/run-pipeline.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const PIPELINE_COMMANDS: Record<string, CommandHandler> = {
  'pipeline run': pipelineRunCommand,
  'pipeline learn': pipelineLearnCommand,
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

async function pipelineLearnCommand(args: CommandArgs): Promise<unknown> {
  const runDirs = args
    .requiredFlag('--run')
    .split(',')
    .map((entry) => resolve(entry.trim()));
  const result = await consumeTraces({
    runDirs,
    judgeModel: args.flagValue('--judge-model'),
  });
  return {
    ok: true,
    updatePath: result.updatePath,
    analysisPath: result.analysisPath,
    disagreements: result.analyses.flatMap((analysis) =>
      analysis.disagreements.map((disagreement) => ({
        runId: analysis.runId,
        testName: disagreement.testName,
        classification: disagreement.judgment.classification,
      }))
    ),
    promotions: result.update.promotions.map((promotion) => ({
      scope: promotion.scope,
      rationale: promotion.rationale,
      artifact: promotion.artifactRef.path,
    })),
  };
}
