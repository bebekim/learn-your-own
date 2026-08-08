import { createHash } from 'node:crypto';
import type { LearningKernel } from '../ledger.ts';
import type {
  AssociationOutcome,
  ZoneActivationRecord,
  ZoneAssociationRecord,
  ZoneCoactivationRecord,
} from '../types/activation.ts';
import {
  commandMatchesZone,
  deploymentMatchesZone,
  pathMatchesGlob,
  sortedPair,
} from './matching.ts';
import {
  ensureJob,
  getZoneCoactivation,
  listCommandActivations,
  listDeploymentActions,
  listPathActivations,
  listZoneCoactivations,
  listZonesForWorkspace,
  recordZoneActivation,
} from './records.ts';
import { getZoneAssociation } from './reports.ts';

const ISO_NOW = () => new Date().toISOString();

export function deriveZoneActivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneActivationRecord[] {
  const job = ensureJob(kernel, jobId);
  const zones = listZonesForWorkspace(kernel, job.workspaceId);
  const created: ZoneActivationRecord[] = [];
  const pathActivations = listPathActivations(kernel, jobId);
  for (const activation of pathActivations) {
    for (const zone of zones) {
      if (zone.pathGlob && pathMatchesGlob(activation.path, zone.pathGlob)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: activation.activationKind,
          sourceKind: 'path',
          sourceId: activation.activationId,
          evidenceRef: activation.evidenceRef,
          strength: activation.activationKind === 'file_written' ? 1.5 : 1,
          confidence: activation.confidence,
        }));
      }
    }
  }
  const commandActivations = listCommandActivations(kernel, jobId);
  for (const activation of commandActivations) {
    for (const zone of zones) {
      if (commandMatchesZone(activation, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          runId: activation.runId,
          zoneId: zone.zoneId,
          activationKind: 'command_observed',
          sourceKind: 'command',
          sourceId: activation.commandId,
          evidenceRef: activation.evidenceRef,
          strength: 1,
          confidence: 'medium',
        }));
      }
    }
  }
  const deploymentActions = listDeploymentActions(kernel, jobId);
  for (const action of deploymentActions) {
    for (const zone of zones) {
      if (deploymentMatchesZone(action, zone)) {
        created.push(recordZoneActivation(kernel, {
          jobId,
          zoneId: zone.zoneId,
          activationKind: 'deployment_action',
          sourceKind: 'deployment',
          sourceId: action.deploymentId,
          evidenceRef: action.evidenceRef,
          strength: 2,
          confidence: 'medium',
        }));
      }
    }
  }
  return created;
}

export function deriveZoneCoactivationsForJob(kernel: LearningKernel, { jobId }: { jobId: string }): ZoneCoactivationRecord[] {
  ensureJob(kernel, jobId);
  const activations = kernel.db.prepare(`
    select zone_id as zoneId, max(strength) as strength
    from zone_activations
    where job_id = ?
    group by zone_id
    order by zone_id asc
  `).all(jobId) as { zoneId: string; strength: number }[];
  const records: ZoneCoactivationRecord[] = [];
  for (let i = 0; i < activations.length; i += 1) {
    for (let j = i + 1; j < activations.length; j += 1) {
      const left = activations[i];
      const right = activations[j];
      const [leftZoneId, rightZoneId] = sortedPair(left.zoneId, right.zoneId);
      const strength = Math.min(Number(left.strength), Number(right.strength));
      const coactivationId = `coact-${sha256(`${jobId}:${leftZoneId}:${rightZoneId}`).slice(0, 20)}`;
      kernel.db.prepare(`
        insert or ignore into zone_coactivations (
          coactivation_id, job_id, left_zone_id, right_zone_id, reason,
          strength, created_at
        )
        values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        coactivationId,
        jobId,
        leftZoneId,
        rightZoneId,
        'zones activated in the same job',
        strength,
        ISO_NOW()
      );
      records.push(getZoneCoactivation(kernel, coactivationId));
    }
  }
  return records;
}

export function updateZoneAssociationsFromJob(
  kernel: LearningKernel,
  { jobId, outcome = 'unknown' }: { jobId: string; outcome: AssociationOutcome | undefined }
): ZoneAssociationRecord[] {
  ensureJob(kernel, jobId);
  const coactivations = listZoneCoactivations(kernel, jobId);
  const records: ZoneAssociationRecord[] = [];
  for (const coactivation of coactivations) {
    const associationKind = 'coactivation';
    const associationId = `assoc-${sha256(`${coactivation.leftZoneId}:${coactivation.rightZoneId}:${associationKind}`).slice(0, 20)}`;
    kernel.db.prepare(`
      insert into zone_associations (
        association_id, left_zone_id, right_zone_id, association_kind, weight,
        support_count, positive_outcomes, negative_outcomes, last_observed_at,
        created_at, updated_at
      )
      values (?, ?, ?, ?, 0, 0, 0, 0, null, ?, ?)
      on conflict(left_zone_id, right_zone_id, association_kind) do nothing
    `).run(
      associationId,
      coactivation.leftZoneId,
      coactivation.rightZoneId,
      associationKind,
      ISO_NOW(),
      ISO_NOW()
    );
    // Upsert the observation: on conflict (same association + job seen again),
    // update the outcome. Track the old outcome so we can adjust counters.
    const prev = kernel.db.prepare(`
      select outcome as oldOutcome
      from zone_association_observations
      where association_id = ? and job_id = ?
    `).get(associationId, jobId) as { oldOutcome: AssociationOutcome } | undefined;
    const oldOutcome = prev?.oldOutcome ?? null;

    kernel.db.prepare(`
      insert into zone_association_observations (
        association_id, job_id, outcome, observed_at
      )
      values (?, ?, ?, ?)
      on conflict(association_id, job_id) do update set
        outcome = excluded.outcome,
        observed_at = excluded.observed_at
    `).run(associationId, jobId, outcome, ISO_NOW());

    if (oldOutcome === null) {
      // New observation — increment support_count and outcome counters.
      kernel.db.prepare(`
        update zone_associations
        set support_count = support_count + 1,
          positive_outcomes = positive_outcomes + ?,
          negative_outcomes = negative_outcomes + ?,
          weight = support_count + 1 + positive_outcomes + ? - negative_outcomes - ?,
          last_observed_at = ?,
          updated_at = ?
        where association_id = ?
      `).run(
        outcome === 'positive' ? 1 : 0,
        outcome === 'negative' ? 1 : 0,
        outcome === 'positive' ? 1 : 0,
        outcome === 'negative' ? 1 : 0,
        ISO_NOW(),
        ISO_NOW(),
        associationId
      );
    } else if (oldOutcome !== outcome) {
      // Outcome changed — adjust counters by the delta, keep support_count.
      kernel.db.prepare(`
        update zone_associations
        set positive_outcomes = positive_outcomes + ?,
          negative_outcomes = negative_outcomes + ?,
          weight = support_count + positive_outcomes + ? - negative_outcomes - ?,
          last_observed_at = ?,
          updated_at = ?
        where association_id = ?
      `).run(
        // positive delta: +1 if new is positive, -1 if old was positive
        (outcome === 'positive' ? 1 : 0) - (oldOutcome === 'positive' ? 1 : 0),
        (outcome === 'negative' ? 1 : 0) - (oldOutcome === 'negative' ? 1 : 0),
        (outcome === 'positive' ? 1 : 0) - (oldOutcome === 'positive' ? 1 : 0),
        (outcome === 'negative' ? 1 : 0) - (oldOutcome === 'negative' ? 1 : 0),
        ISO_NOW(),
        ISO_NOW(),
        associationId
      );
    }
    records.push(getZoneAssociation(kernel, coactivation.leftZoneId, coactivation.rightZoneId, associationKind));
  }
  return records;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
