import type { LearningKernel } from '../ledger.ts';
import type {
  CommandActivationRecord,
  DeploymentActionRecord,
  JobActivationReport,
  JobActivationSummary,
  PathActivationKind,
  PathActivationRecord,
  ZoneActivationRecord,
  ZoneAssociationRecord,
  ZoneCoactivationRecord,
} from '../types.ts';
import {
  ensureJob,
  ensureWorkspace,
  ensureZone,
  listCommandActivations,
  listDeploymentActions,
  listPathActivations,
  listZoneActivations,
  listZoneCoactivations,
} from './records.ts';

export function getJobActivationReport(kernel: LearningKernel, { jobId }: { jobId: string }): JobActivationReport {
  const job = ensureJob(kernel, jobId);
  const pathActivations = listPathActivations(kernel, jobId);
  const commandActivations = listCommandActivations(kernel, jobId);
  const deploymentActions = listDeploymentActions(kernel, jobId);
  const zoneActivations = listZoneActivations(kernel, jobId);
  const zoneCoactivations = listZoneCoactivations(kernel, jobId);
  const associations = listJobZoneAssociations(kernel, jobId);
  return {
    job,
    summary: summarizeJobActivations({
      pathActivations,
      commandActivations,
      deploymentActions,
      zoneActivations,
      zoneCoactivations,
    }),
    pathActivations,
    commandActivations,
    deploymentActions,
    zoneActivations,
    zoneCoactivations,
    associations,
  };
}

export function getZoneAssociationReport(
  kernel: LearningKernel,
  { workspaceId, zoneId, limit = 20 }: { workspaceId: string; zoneId?: string; limit?: number }
): ZoneAssociationRecord[] {
  ensureWorkspace(kernel, workspaceId);
  const params: (string | number)[] = [workspaceId, workspaceId];
  let zoneFilter = '';
  if (zoneId) {
    ensureZone(kernel, zoneId);
    zoneFilter = 'and (za.left_zone_id = ? or za.right_zone_id = ?)';
    params.push(zoneId, zoneId);
  }
  params.push(limit);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_associations za
    join zones zl on zl.zone_id = za.left_zone_id
    join zones zr on zr.zone_id = za.right_zone_id
    where zl.workspace_id = ? and zr.workspace_id = ?
      ${zoneFilter}
    order by za.weight desc, za.support_count desc, za.updated_at desc
    limit ?
  `).all(...params) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
}

export function getZoneAssociation(
  kernel: LearningKernel,
  leftZoneId: string,
  rightZoneId: string,
  associationKind: string
): ZoneAssociationRecord {
  const row = kernel.db.prepare(`
    select
      association_id as associationId,
      left_zone_id as leftZoneId,
      right_zone_id as rightZoneId,
      association_kind as associationKind,
      weight,
      support_count as supportCount,
      positive_outcomes as positiveOutcomes,
      negative_outcomes as negativeOutcomes,
      support_count - positive_outcomes - negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = zone_associations.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = zone_associations.association_id
      ) as coactivationSupport
    from zone_associations
    where left_zone_id = ? and right_zone_id = ? and association_kind = ?
  `).get(leftZoneId, rightZoneId, associationKind) as ZoneAssociationRecord;
  return enrichZoneAssociation(row);
}

function listJobZoneAssociations(kernel: LearningKernel, jobId: string): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const rows = kernel.db.prepare(`
    select
      za.association_id as associationId,
      za.left_zone_id as leftZoneId,
      za.right_zone_id as rightZoneId,
      za.association_kind as associationKind,
      za.weight,
      za.support_count as supportCount,
      za.positive_outcomes as positiveOutcomes,
      za.negative_outcomes as negativeOutcomes,
      za.support_count - za.positive_outcomes - za.negative_outcomes as unknownOutcomes,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.left_zone_id
      ) as leftActivationCount,
      (
        select count(distinct zav.job_id)
        from zone_activations zav
        where zav.zone_id = za.right_zone_id
      ) as rightActivationCount,
      (
        select count(*)
        from zone_association_observations zao
        where zao.association_id = za.association_id
      ) as coactivationSupport
    from zone_coactivations zc
    join zone_associations za
      on za.left_zone_id = zc.left_zone_id
      and za.right_zone_id = zc.right_zone_id
      and za.association_kind = 'coactivation'
    where zc.job_id = ?
    order by za.weight desc, za.support_count desc, za.updated_at desc
  `).all(jobId) as ZoneAssociationRecord[];
  return rows.map(enrichZoneAssociation);
}

function summarizeJobActivations({
  pathActivations,
  commandActivations,
  deploymentActions,
  zoneActivations,
  zoneCoactivations,
}: {
  pathActivations: PathActivationRecord[];
  commandActivations: CommandActivationRecord[];
  deploymentActions: DeploymentActionRecord[];
  zoneActivations: ZoneActivationRecord[];
  zoneCoactivations: ZoneCoactivationRecord[];
}): JobActivationSummary {
  return {
    evidenceRefs: uniqueSorted([
      ...pathActivations.map((activation) => activation.evidenceRef),
      ...commandActivations.map((activation) => activation.evidenceRef),
      ...deploymentActions.map((activation) => activation.evidenceRef),
      ...zoneActivations.map((activation) => activation.evidenceRef),
    ]),
    paths: {
      total: pathActivations.length,
      byKind: countBy(pathActivations, (activation) => activation.activationKind),
      byPhase: countBy(pathActivations, (activation) => activation.phase),
      repeated: repeatedPathActivations(pathActivations),
    },
    commands: {
      total: commandActivations.length,
      byClassification: countBy(commandActivations, (activation) => activation.classification),
      byStatus: countBy(commandActivations, (activation) => activation.status),
      byPhase: countBy(commandActivations, (activation) => activation.phase),
      totalOutputSize: commandActivations.reduce((sum, activation) => sum + activation.outputSize, 0),
      repeated: commandActivations
        .filter((activation) => activation.occurrenceCount > 1)
        .map((activation) => ({
          commandName: activation.commandName,
          argvSummary: activation.argvSummary,
          count: activation.occurrenceCount,
        })),
    },
    deployments: {
      total: deploymentActions.length,
      byProvider: countBy(deploymentActions, (activation) => activation.provider ?? 'unknown'),
      byEnvironment: countBy(deploymentActions, (activation) => activation.environment ?? 'unknown'),
      byStatus: countBy(deploymentActions, (activation) => activation.status),
    },
    zones: {
      total: zoneActivations.length,
      uniqueZones: new Set(zoneActivations.map((activation) => activation.zoneId)).size,
      byZoneId: countBy(zoneActivations, (activation) => activation.zoneId),
      byActivationKind: countBy(zoneActivations, (activation) => activation.activationKind),
      bySourceKind: countBy(zoneActivations, (activation) => activation.sourceKind),
      byConfidence: countBy(zoneActivations, (activation) => activation.confidence),
      strengthByZoneId: sumBy(zoneActivations, (activation) => activation.zoneId, (activation) => activation.strength),
    },
    coactivations: {
      total: zoneCoactivations.length,
    },
  };
}

function countBy<T>(records: T[], keyFn: (record: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sumBy<T>(
  records: T[],
  keyFn: (record: T) => string,
  valueFn: (record: T) => number
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const record of records) {
    const key = keyFn(record);
    sums[key] = roundMetric((sums[key] ?? 0) + valueFn(record));
  }
  return sums;
}

function repeatedPathActivations(records: PathActivationRecord[]): { path: string; activationKind: PathActivationKind; count: number }[] {
  const counts = new Map<string, { path: string; activationKind: PathActivationKind; count: number }>();
  for (const record of records) {
    const key = `${record.path}\0${record.activationKind}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { path: record.path, activationKind: record.activationKind, count: 1 });
    }
  }
  return [...counts.values()]
    .filter((record) => record.count > 1)
    .sort((left, right) => left.path.localeCompare(right.path) || left.activationKind.localeCompare(right.activationKind));
}

function uniqueSorted(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))].sort();
}

function enrichZoneAssociation(record: ZoneAssociationRecord): ZoneAssociationRecord {
  const unknownOutcomes = Math.max(0, record.unknownOutcomes ?? record.supportCount - record.positiveOutcomes - record.negativeOutcomes);
  const knownOutcomes = record.positiveOutcomes + record.negativeOutcomes;
  const leftActivationCount = record.leftActivationCount ?? 0;
  const rightActivationCount = record.rightActivationCount ?? 0;
  const coactivationSupport = record.coactivationSupport ?? record.supportCount;
  const normalizedDenominator = Math.sqrt(leftActivationCount * rightActivationCount);
  const unionActivationCount = leftActivationCount + rightActivationCount - coactivationSupport;
  return {
    ...record,
    unknownOutcomes,
    knownOutcomes,
    successRate: knownOutcomes > 0 ? roundMetric(record.positiveOutcomes / knownOutcomes) : null,
    riskRate: knownOutcomes > 0 ? roundMetric(record.negativeOutcomes / knownOutcomes) : null,
    leftActivationCount,
    rightActivationCount,
    coactivationSupport,
    normalizedWeight: normalizedDenominator > 0 ? roundMetric(coactivationSupport / normalizedDenominator) : 0,
    jaccardWeight: unionActivationCount > 0 ? roundMetric(coactivationSupport / unionActivationCount) : 0,
  };
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
