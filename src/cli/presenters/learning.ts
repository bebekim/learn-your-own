import type {
  AssociationHypothesis,
  AssociationLearningReport,
} from '../../compiler/association-learning.ts';
import type {
  StyleLearningCandidate,
  StyleLearningReport,
} from '../../compiler/style-learning.ts';

export function compactAssociationLearningReport(report: AssociationLearningReport): unknown {
  const {
    analyzedRunIds,
    associationHypotheses,
    evidenceEvents,
    explanationBeliefs,
    ...rest
  } = report;
  const promotionCandidates = associationHypotheses.filter((hypothesis) => hypothesis.promotionCandidate);
  const blockedHypotheses = associationHypotheses.filter((hypothesis) => !hypothesis.promotionCandidate);

  return {
    ...rest,
    analyzedRunCount: analyzedRunIds.length,
    analyzedRunIdPreview: analyzedRunIds.slice(0, 20),
    promotableCandidateCount: promotionCandidates.length,
    blockedHypothesisCount: blockedHypotheses.length,
    evidenceEventCount: evidenceEvents.length,
    explanationBeliefCount: explanationBeliefs.length,
    topPromotionCandidates: promotionCandidates.slice(0, 10).map(compactAssociationHypothesis),
    topBlockedHypotheses: blockedHypotheses.slice(0, 10).map(compactAssociationHypothesis),
  };
}

export function compactAssociationHypothesis(hypothesis: AssociationHypothesis): unknown {
  return {
    id: hypothesis.id,
    source: hypothesis.source,
    relation: hypothesis.relation,
    target: hypothesis.target,
    credibility: hypothesis.credibility,
    promotionCandidate: hypothesis.promotionCandidate,
    promotionBlockers: hypothesis.promotionBlockers,
    supportCount: hypothesis.supportCount,
    weakenCount: hypothesis.weakenCount,
    defeatCount: hypothesis.defeatCount,
    distinctRunCount: hypothesis.distinctRunCount,
    distinctLedgerCount: hypothesis.distinctLedgerCount,
    scopeWarnings: hypothesis.scopeWarnings,
    policyWarnings: hypothesis.policyWarnings,
    runPolicyWarnings: hypothesis.runPolicyWarnings,
    recommendedNextExperiment: hypothesis.recommendedNextExperiment,
  };
}

export function compactStyleLearningReport(report: StyleLearningReport): unknown {
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

export function compactLearningCandidate(candidate: StyleLearningCandidate): unknown {
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

export function styleLearningSummaryLines(report: StyleLearningReport): string[] {
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

export function formatRate(value: number | null): string {
  return value === null ? 'n/a' : `${Math.round(value * 100)}%`;
}
