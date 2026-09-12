export interface PendingFindingReview {
  findingId: string;
  opportunityId: string;
  cwd: string;
  status: string;
  evidenceRef: string | null;
  problems: string[];
}

/**
 * A finding under trial management is withheld here: its control arm is decided
 * by assignment/emission, and an ordinary review prompt would expose what the
 * trial withheld. Retained evidence from another workspace can still be reviewed;
 * a bare local absence cannot, since acquiring it needs that workspace present.
 */
export function eligibleFindingReviewQueue(items: readonly PendingFindingReview[], input: {
  managed(findingId: string): boolean;
  workspace: string;
}): PendingFindingReview[] {
  return items
    .filter(item => !input.managed(item.findingId) && (item.cwd === input.workspace || item.evidenceRef !== null))
    .sort((a, b) => Number(b.cwd === input.workspace) - Number(a.cwd === input.workspace));
}
