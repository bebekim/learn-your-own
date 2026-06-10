import { buildAssociationLearningReport } from '../../compiler/association-learning.ts';
import { buildStyleLearningReport } from '../../compiler/style-learning.ts';
import type {
  StyleLearningCandidate,
  StyleLearningReport,
} from '../../compiler/style-learning.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { withKernel } from './context.ts';

export const LEARNING_COMMANDS: Record<string, CommandHandler> = {
  'learn associations': learnAssociationsCommand,
  'learn style': learnStyleCommand,
};

function learnAssociationsCommand(args: CommandArgs): unknown {
  if (!args.hasFlag('--dry-run')) {
    throw new Error('learn associations is currently dry-run only; pass --dry-run');
  }

  return {
    ok: true,
    learning: buildAssociationLearningReport({
      root: args.flagValue('--dir') ?? args.cwd,
    }),
  };
}

function learnStyleCommand(args: CommandArgs): unknown {
  return withKernel(args, (kernel) => {
    const report = buildStyleLearningReport(kernel);
    return {
      ok: true,
      learning: args.hasFlag('--verbose') ? report : compactStyleLearningReport(report),
    };
  });
}

function compactStyleLearningReport(report: StyleLearningReport): unknown {
  const {
    analyzedRunIds,
    learningCandidates,
    ...rest
  } = report;

  return {
    ...rest,
    analyzedRunCount: analyzedRunIds.length,
    analyzedRunIdPreview: analyzedRunIds.slice(0, 20),
    summaryText: styleLearningSummaryLines(report).join('\n'),
    summaryLines: styleLearningSummaryLines(report),
    learningCandidates: learningCandidates.map(compactLearningCandidate),
  };
}

function compactLearningCandidate(candidate: StyleLearningCandidate): unknown {
  const {
    evidenceRunIds,
    ...rest
  } = candidate;

  return {
    ...rest,
    evidenceRunCount: evidenceRunIds.length,
    evidenceRunIdPreview: evidenceRunIds.slice(0, 10),
  };
}

function styleLearningSummaryLines(report: StyleLearningReport): string[] {
  const distribution = report.styleDistribution;
  const metrics = report.aggregateMetrics;
  const modelUsage = report.modelUsage;
  const candidates = report.learningCandidates
    .slice(0, 5)
    .map((candidate) => `${candidate.id}(${candidate.support})`)
    .join(', ') || 'none';

  return [
    `Analyzed ${report.runCount} telemetry runs.`,
    `Styles: prompt=${distribution.promptDriven}, manual=${distribution.manualOrchestrated}, loop-assisted=${distribution.loopAssisted}, loop-driven=${distribution.loopDrivenCandidate}, insufficient=${distribution.insufficientEvidence}.`,
    `Edit verification rate: ${formatRate(metrics.editVerificationRate)} (${metrics.runsWithVerifiedEdits}/${metrics.runsWithEdits}).`,
    `Stopped after edit without verification: ${metrics.runsStoppedAfterEditWithoutVerification}.`,
    `Model calls: ${modelUsage.totalModelCalls}, tokens: ${modelUsage.totalTokens}.`,
    `Top learning candidates: ${candidates}.`,
  ];
}

function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}
