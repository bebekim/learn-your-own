import type { FindingTrialPolicyDefinition } from '../domain/finding-trial-policy.ts';
import { reconcileFindingTrial as reconcile, findingTrialAllocation as allocate } from '../application/finding-trial-reconciliation.ts';
import { closeFindingTrialWindow, findingTrialReconciliationPort } from '../storage/finding-trial-state.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import type { findingOpportunity } from './session-finding-evidence.ts';

export { closeFindingTrialWindow };

export function reconcileFindingTrial(store: LessonStore, trial: FindingTrialPolicyDefinition) {
  return reconcile(findingTrialReconciliationPort(store), trial);
}

/** Validate again inside assignment's write transaction and immediately before emission. */
export function findingTrialAllocation(store: LessonStore, registered: { content: ReturnType<typeof findingOpportunity>['content'] }, ref: string) {
  return allocate(findingTrialReconciliationPort(store), registered.content.input, ref);
}
