export interface FindingRevision {
  id: string;
  previousVersion: string;
  version: string;
  intervention: string;
  feedbackIds: readonly string[];
}

export interface FindingAssessment {
  id: string;
  version: string;
  observationId: string;
  applicability: 'applicable' | 'inapplicable' | 'unknown';
  outcome: 'supported' | 'contradicted' | 'unknown';
}

/** Assessments must first be rechecked against current retained evidence by the caller. */
export function findingLifecycle(
  original: { version: string; intervention: string },
  revisions: readonly FindingRevision[],
  assessments: readonly FindingAssessment[],
) {
  let { version, intervention } = original;
  for (const revision of revisions) {
    if (revision.previousVersion !== version) throw new Error('broken finding revision chain');
    intervention = revision.intervention;
    version = revision.version;
  }
  const supporting = new Set(assessments.filter(row => row.version === version && row.outcome === 'supported')
    .map(row => row.observationId)).size;
  const scopeReviewFeedbackIds = assessments.filter(row => row.version === version && row.applicability === 'inapplicable')
    .map(row => row.id);
  const contradicted = assessments.some(row => row.version === version && row.outcome === 'contradicted');
  const staleRevisionIds = revisions.filter(revision => !revision.feedbackIds.every(id => assessments.some(row => row.id === id
    && row.version === revision.previousVersion && row.outcome === 'contradicted'))).map(row => row.id);
  const validity = staleRevisionIds.length ? 'needs-reassessment' as const : contradicted ? 'needs-revision' as const
    : supporting ? 'supported' as const : 'unvalidated' as const;
  return { version, intervention, supporting, scopeReviewFeedbackIds, staleRevisionIds, validity };
}
