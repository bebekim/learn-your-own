import {
  rows,
} from '../db/rows.ts';
import type { LearningKernel } from '../ledger.ts';
import type {
  RecommendZoneAssociationsInput,
  ZoneAssociationRecommendation,
  ZoneAssociationRecord,
  ZoneRecord,
} from '../types/activation.ts';
import {
  ensureWorkspace,
  ensureZone,
  listZonesForWorkspace,
} from './records.ts';
import { getZoneAssociationReport } from './reports.ts';

interface RecommendationAccumulator {
  targetZoneId: string;
  targetZoneName: string;
  sourceZoneIds: Set<string>;
  score: number;
  supportCount: number;
  positiveOutcomes: number;
  negativeOutcomes: number;
  unknownOutcomes: number;
  evidenceJobIds: Set<string>;
}

export function recommendZoneAssociations(
  kernel: LearningKernel,
  input: RecommendZoneAssociationsInput
): ZoneAssociationRecommendation[] {
  ensureWorkspace(kernel, input.workspaceId);
  const limit = input.limit ?? 10;
  const seedZoneIds = input.seedZoneIds ?? [];
  for (const seedZoneId of seedZoneIds) {
    const zone = ensureZone(kernel, seedZoneId);
    if (zone.workspaceId !== input.workspaceId) {
      throw new Error(`seed zone ${seedZoneId} does not belong to workspace ${input.workspaceId}`);
    }
  }

  const zonesById = new Map(listZonesForWorkspace(kernel, input.workspaceId).map((zone) => [zone.zoneId, zone]));
  const sourceAssociations = seedZoneIds.length > 0
    ? uniqueAssociations(seedZoneIds.flatMap((zoneId) => getZoneAssociationReport(kernel, {
        workspaceId: input.workspaceId,
        zoneId,
        limit: 1000,
      })))
    : getZoneAssociationReport(kernel, {
        workspaceId: input.workspaceId,
        limit: 1000,
      });

  const accumulators = new Map<string, RecommendationAccumulator>();
  for (const association of sourceAssociations) {
    const sources = associationSourceZones(association, seedZoneIds);
    if (seedZoneIds.length > 0 && sources.length === 0) continue;
    const targetZoneId = associationTargetZone(association, sources, seedZoneIds);
    if (!targetZoneId || seedZoneIds.includes(targetZoneId)) continue;
    const targetZone = zonesById.get(targetZoneId);
    if (!targetZone) continue;
    const score = associationRecommendationScore(association);
    if (!input.includeNonPositive && score <= 0) continue;
    const accumulator = accumulators.get(targetZoneId) ?? createAccumulator(targetZone);
    for (const source of sources.length > 0 ? sources : [association.leftZoneId]) {
      accumulator.sourceZoneIds.add(source);
    }
    accumulator.score += score;
    accumulator.supportCount += association.supportCount;
    accumulator.positiveOutcomes += association.positiveOutcomes;
    accumulator.negativeOutcomes += association.negativeOutcomes;
    accumulator.unknownOutcomes += association.unknownOutcomes;
    for (const jobId of associationEvidenceJobIds(kernel, association.associationId)) {
      accumulator.evidenceJobIds.add(jobId);
    }
    accumulators.set(targetZoneId, accumulator);
  }

  return [...accumulators.values()]
    .map(toRecommendation)
    .sort((left, right) =>
      right.score - left.score
      || right.supportCount - left.supportCount
      || left.targetZoneName.localeCompare(right.targetZoneName)
    )
    .slice(0, limit);
}

function uniqueAssociations(associations: ZoneAssociationRecord[]): ZoneAssociationRecord[] {
  const seen = new Set<string>();
  const unique: ZoneAssociationRecord[] = [];
  for (const association of associations) {
    if (seen.has(association.associationId)) continue;
    seen.add(association.associationId);
    unique.push(association);
  }
  return unique;
}

function associationSourceZones(association: ZoneAssociationRecord, seedZoneIds: string[]): string[] {
  if (seedZoneIds.length === 0) return [association.leftZoneId];
  return [association.leftZoneId, association.rightZoneId].filter((zoneId) => seedZoneIds.includes(zoneId));
}

function associationTargetZone(
  association: ZoneAssociationRecord,
  sources: string[],
  seedZoneIds: string[]
): string | null {
  if (sources.includes(association.leftZoneId)) return association.rightZoneId;
  if (sources.includes(association.rightZoneId)) return association.leftZoneId;
  if (seedZoneIds.length === 0) return association.rightZoneId;
  return null;
}

function associationRecommendationScore(association: ZoneAssociationRecord): number {
  const evidenceBalance = association.supportCount + association.positiveOutcomes - association.negativeOutcomes;
  const knownOutcomes = association.positiveOutcomes + association.negativeOutcomes;
  const outcomeMultiplier = knownOutcomes > 0
    ? association.positiveOutcomes / knownOutcomes
    : 0.5;
  return roundMetric(Math.max(0, association.normalizedWeight * evidenceBalance * outcomeMultiplier));
}

function createAccumulator(targetZone: ZoneRecord): RecommendationAccumulator {
  return {
    targetZoneId: targetZone.zoneId,
    targetZoneName: targetZone.name,
    sourceZoneIds: new Set(),
    score: 0,
    supportCount: 0,
    positiveOutcomes: 0,
    negativeOutcomes: 0,
    unknownOutcomes: 0,
    evidenceJobIds: new Set(),
  };
}

function associationEvidenceJobIds(kernel: LearningKernel, associationId: string): string[] {
  return rows<{ jobId: string }>(kernel.db.prepare(`
    select job_id as jobId
    from zone_association_observations
    where association_id = ?
    order by observed_at asc, job_id asc
  `).all(associationId)).map((row) => row.jobId);
}

function toRecommendation(accumulator: RecommendationAccumulator): ZoneAssociationRecommendation {
  const knownOutcomes = accumulator.positiveOutcomes + accumulator.negativeOutcomes;
  return {
    targetZoneId: accumulator.targetZoneId,
    targetZoneName: accumulator.targetZoneName,
    sourceZoneIds: [...accumulator.sourceZoneIds].sort(),
    score: roundMetric(accumulator.score),
    supportCount: accumulator.supportCount,
    positiveOutcomes: accumulator.positiveOutcomes,
    negativeOutcomes: accumulator.negativeOutcomes,
    unknownOutcomes: accumulator.unknownOutcomes,
    successRate: knownOutcomes > 0 ? roundMetric(accumulator.positiveOutcomes / knownOutcomes) : null,
    riskRate: knownOutcomes > 0 ? roundMetric(accumulator.negativeOutcomes / knownOutcomes) : null,
    localEvidence: accumulator.supportCount > 0,
    evidenceJobIds: [...accumulator.evidenceJobIds].sort(),
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
