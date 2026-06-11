import type {
  AssociationCredibility,
  AssociationHypothesis,
} from '../association-learning.ts';

export function promotionBlockersFor(input: {
  credibility: AssociationCredibility;
  supportCount: number;
  weakenCount: number;
  defeatCount: number;
  distinctRunCount: number;
  distinctLedgerCount: number;
  scopeWarnings: string[];
  policyWarnings: string[];
}): string[] {
  const blockers: string[] = [];
  if (input.credibility !== 'credible') blockers.push(`association_credibility:${input.credibility}`);
  if (input.supportCount < 2) blockers.push('support_count_below_2');
  if (input.distinctRunCount < 2) blockers.push('distinct_run_count_below_2');
  if (input.distinctLedgerCount < 2) blockers.push('distinct_ledger_count_below_2');
  if (input.weakenCount > 0) blockers.push('weaken_events_present');
  if (input.defeatCount > 0) blockers.push('defeat_events_present');
  for (const warning of input.scopeWarnings) blockers.push(`scope_warning:${warning}`);
  for (const warning of input.policyWarnings) blockers.push(`evidence_policy_warning:${warning}`);
  return Array.from(new Set(blockers)).sort();
}

export function credibilityFor(input: {
  supportCount: number;
  weakenCount: number;
  defeatCount: number;
  distinctRunCount: number;
  distinctLedgerCount: number;
  scopeWarnings: string[];
}): AssociationCredibility {
  if (input.defeatCount > 0) return 'defeated';
  if (input.weakenCount > input.supportCount) return 'weakened';
  if (
    input.supportCount >= 2
    && input.distinctRunCount >= 2
    && input.distinctLedgerCount >= 2
    && input.weakenCount === 0
    && input.scopeWarnings.length === 0
  ) {
    return 'credible';
  }
  if (input.supportCount > 0 && input.weakenCount === 0) return 'plausible';
  if (input.supportCount > input.weakenCount) return 'plausible';
  if (input.weakenCount > 0) return 'weakened';
  return 'conjectural';
}

export function compareHypotheses(left: AssociationHypothesis, right: AssociationHypothesis): number {
  return credibilityRank(right.credibility) - credibilityRank(left.credibility)
    || right.supportCount - left.supportCount
    || right.distinctLedgerCount - left.distinctLedgerCount
    || left.scopeWarnings.length - right.scopeWarnings.length
    || left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target);
}

function credibilityRank(value: AssociationCredibility): number {
  if (value === 'credible') return 4;
  if (value === 'plausible') return 3;
  if (value === 'conjectural') return 2;
  if (value === 'weakened') return 1;
  return 0;
}
