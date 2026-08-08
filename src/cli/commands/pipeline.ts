import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { checkBlindness, validatePlan, validateSpec, validateSpecProposal } from '../../contract/index.ts';
import { loadCalibrationCases, runJudgeCalibration } from '../../lyo/judge/judge-calibration.ts';
import { consumeTraces } from '../../lyo/judge/trace-consumer.ts';
import { createDefaultJudge } from '../../lyo/judge/openrouter.ts';
import { applyRun } from '../../runner/apply.ts';
import { compareRuns } from '../../runner/compare-runs.ts';
import { runPipeline } from '../../runner/run-pipeline.ts';
import { compileSpecMarkdown } from '../../runner/spec-compiler.ts';
import { closeKernel, createKernel } from '../../ledger.ts';
import { initLedger } from '../../schema.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const PIPELINE_COMMANDS: Record<string, CommandHandler> = {
  'pipeline run': pipelineRunCommand,
  'pipeline learn': pipelineLearnCommand,
  'pipeline compare': pipelineCompareCommand,
  'pipeline calibrate': pipelineCalibrateCommand,
  'pipeline proposals': pipelineProposalsCommand,
  'pipeline proposal-review': pipelineProposalReviewCommand,
  'pipeline init': pipelineInitCommand,
  'pipeline apply': pipelineApplyCommand,
};

async function pipelineRunCommand(args: CommandArgs): Promise<unknown> {
  const lessonsDir = args.flagValue('--lessons');
  const kernel = createKernel({ dbPath: args.dbPath });
  initLedger(kernel);
  try {
    const result = await runPipeline({
      planPath: resolve(args.requiredFlag('--plan')),
      runsRoot: resolve(args.flagValue('--runs-root') ?? 'runs'),
      lessonsDir: lessonsDir ? resolve(lessonsDir) : undefined,
      kernel,
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
  } finally {
    closeKernel(kernel);
  }
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
        source: disagreement.judgment.source ?? 'judge',
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

async function pipelineProposalsCommand(args: CommandArgs): Promise<unknown> {
  const proposalsDir = join(
    resolve(args.requiredFlag('--run')),
    'spec-proposals'
  );
  let entries: string[] = [];
  try {
    entries = readdirSync(proposalsDir).filter((entry) => entry.endsWith('.json')).sort();
  } catch {
    return { ok: true, proposals: [] };
  }
  const proposals = entries.map((entry) => {
    const proposal = JSON.parse(readFileSync(join(proposalsDir, entry), 'utf8'));
    return {
      proposalId: proposal.proposalId,
      specId: proposal.specId,
      status: proposal.status,
      edit: proposal.edit,
      rationale: proposal.rationale,
      sourceRuns: proposal.sourceRuns,
    };
  });
  return { ok: true, proposals };
}

async function pipelineProposalReviewCommand(args: CommandArgs): Promise<unknown> {
  const status = args.requiredFlag('--status');
  if (status !== 'accepted' && status !== 'rejected') {
    throw new Error(`--status must be accepted or rejected, got '${status}'`);
  }
  const proposalPath = join(
    resolve(args.requiredFlag('--run')),
    'spec-proposals',
    `${args.requiredFlag('--id')}.json`
  );
  const proposal = JSON.parse(readFileSync(proposalPath, 'utf8'));
  proposal.status = status;
  const validation = validateSpecProposal(proposal);
  if (!validation.ok) {
    throw new Error(`invalid proposal after review: ${validation.errors.map((e) => e.message).join('; ')}`);
  }
  writeFileSync(proposalPath, JSON.stringify(proposal, null, 2));
  return { ok: true, proposalId: proposal.proposalId, status };
}

async function pipelineInitCommand(args: CommandArgs): Promise<unknown> {
  const specPath = resolve(args.requiredFlag('--spec'));
  const taskDir = resolve(args.flagValue('--task-dir') ?? dirname(specPath));
  const { spec, plan } = compileSpecMarkdown({ specPath });
  const specValidation = validateSpec(spec);
  if (!specValidation.ok) {
    throw new Error(`compiled spec invalid: ${specValidation.errors.map((e) => e.message).join('; ')}`);
  }
  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    throw new Error(`compiled plan invalid: ${planValidation.errors.map((e) => e.message).join('; ')}`);
  }
  const blindness = checkBlindness(planValidation.value);
  if (!blindness.ok) {
    throw new Error(`compiled plan violates blindness:\n- ${blindness.violations.join('\n- ')}`);
  }
  mkdirSync(taskDir, { recursive: true });
  const specOut = join(taskDir, 'spec.json');
  const planOut = join(taskDir, 'plan.json');
  writeFileSync(specOut, JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(planOut, JSON.stringify(plan, null, 2) + '\n');
  return { ok: true, specPath: specOut, planPath: planOut, specId: spec.specId };
}

async function pipelineApplyCommand(args: CommandArgs): Promise<unknown> {
  const result = applyRun({
    runDir: resolve(args.requiredFlag('--run')),
    targetDir: resolve(args.requiredFlag('--target')),
    force: args.hasFlag('--force'),
  });
  return { ok: true, copied: result.copied, outcome: result.outcome };
}
