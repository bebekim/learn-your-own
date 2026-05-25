import type { LearningKernel } from '../ledger.ts';
import {
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  updateZoneAssociationsFromJob,
} from '../activation.ts';

export function deriveActivationState(kernel: LearningKernel, jobId: string, outcome: string): object {
  const zoneActivations = deriveZoneActivationsForJob(kernel, { jobId });
  const zoneCoactivations = deriveZoneCoactivationsForJob(kernel, { jobId });
  const associations = updateZoneAssociationsFromJob(kernel, {
    jobId,
    outcome: outcome === 'positive' || outcome === 'negative' ? outcome : 'unknown',
  });
  return { zoneActivations, zoneCoactivations, associations };
}
