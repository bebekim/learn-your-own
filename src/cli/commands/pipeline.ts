import { resolve } from 'node:path';

import { loadCalibrationCases, runJudgeCalibration } from '../../lyo/judge-calibration.ts';
import { consumeTraces, createDefaultJudge } from '../../lyo/trace-consumer.ts';
import { compareRuns } from '../../runner/compare-runs.ts';
import { runPipeline } from '../../runner/run-pipeline.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const PIPELINE_COMMANDS: Record<string, CommandHandler> = {
  'pipeline run': pipelineRunCommand,
  'pipeline learn': pipelineLearnCommand,
  'pipeline compare': pipelineCompareCommand,
  'pipeline calibrate': pipelineCalibrateCommand,
};

async function pipelineRunCommand(args: CommandArgs): Promise<unknown> {
  const lessonsDir = args.flagValue('--lessons');
  const result = await runPipeline({
    planPath: resolve(args.requiredFlag('--plan')),
    runsRoot: resolve(args.flagValue('--runs-root') ?? 'runs'),
    lessonsDir: lessonsDir ? resolve(lessonsDir) : undefined,
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
  const library = args.flagValue('--library');
  const gateMode = args.flagValue('--gate');
  const result = await consumeTraces({
    runDirs,
    judgeModel: args.flagValue('--judge-model'),
    libraryDir: library ? resolve(library) : undefined,
    gate: { mode: gateMode === 'strict' ? 'strict' : 'permissive' },
  });
  return {
    ok: true,
    updatePath: result.updatePath,
    analysisPath: result.analysisPath,
    installedLessons: result.installedLessons,
    credits: result.appliedCredits.map((credit) => ({
      lesson: credit.lessonPath.split('/').pop(),
      outcome: credit.outcome,
      runId: credit.runId,
    })),
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

async function pipelineCompareCommand(args: CommandArgs): Promise<unknown> {
  const comparison = compareRuns({
    baselineDir: resolve(args.requiredFlag('--baseline')),
    treatmentDir: resolve(args.requiredFlag('--treatment')),
  });
  return { ok: true, ...comparison };
}

async function pipelineCalibrateCommand(args: CommandArgs): Promise<unknown> {
  const result = await runJudgeCalibration({
    cases: loadCalibrationCases(resolve(args.requiredFlag('--cases'))),
    judge: createDefaultJudge(args.flagValue('--judge-model')),
  });
  return { ok: true, ...result };
}
