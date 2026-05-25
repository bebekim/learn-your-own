import type { LearningKernel } from '../ledger.ts';
import {
  optionalRow,
  requiredRow,
  rows,
} from '../db/rows.ts';
import type {
  AdaptiveCredit,
  AttachEvidenceInput,
  OutcomeRecord,
  PromoteProtocolFromPreferencesInput,
  PromoteProtocolInput,
  ProposeProtocolInput,
  ProtocolDelivery,
  ProtocolRecord,
  RecordOutcomeInput,
  ResolveProtocolInput,
  ResolveProtocolResult,
} from '../types/core.ts';
import {
  ensureGap,
  ensurePreferencePair,
} from './core.ts';
import {
  boolInt,
  ISO_NOW,
  requireFields,
} from './shared.ts';

export function proposeProtocol(kernel: LearningKernel, input: ProposeProtocolInput): ProtocolRecord {
  requireFields(input, ['protocolId', 'title', 'scopeKind', 'scopeValue', 'action']);
  if (input.action.trim().length < 12) {
    throw new Error('protocol action must be specific enough to execute');
  }
  kernel.db.prepare(`
    insert into protocols (
      protocol_id, title, scope_kind, scope_value, action, proposed_by,
      status, proposed_at
    )
    values (?, ?, ?, ?, ?, ?, 'candidate', ?)
  `).run(
    input.protocolId,
    input.title,
    input.scopeKind,
    input.scopeValue,
    input.action,
    input.proposedBy ?? null,
    ISO_NOW()
  );
  return ensureProtocol(kernel, input.protocolId);
}

export function attachEvidence(kernel: LearningKernel, { protocolId, gapId }: AttachEvidenceInput): AttachEvidenceInput {
  requireFields({ protocolId, gapId }, ['protocolId', 'gapId']);
  ensureProtocol(kernel, protocolId);
  ensureGap(kernel, gapId);
  kernel.db.prepare(`
    insert or ignore into protocol_evidence (protocol_id, gap_id, attached_at)
    values (?, ?, ?)
  `).run(protocolId, gapId, ISO_NOW());
  return { protocolId, gapId };
}

export function promoteProtocol(kernel: LearningKernel, input: PromoteProtocolInput): ProtocolRecord {
  requireFields(input, ['protocolId']);
  const protocol = ensureProtocol(kernel, input.protocolId);
  if (protocol.status !== 'candidate') {
    throw new Error(`protocol ${input.protocolId} is not a candidate`);
  }

  for (const gapId of input.evidenceIds ?? []) {
    attachEvidence(kernel, { protocolId: input.protocolId, gapId });
  }

  const evidenceRow = requiredRow<{ count: number }>(kernel.db.prepare(`
    select count(*) as count
    from protocol_evidence pe
    join gaps g on g.gap_id = pe.gap_id
    where pe.protocol_id = ? and g.status = 'observed'
  `).get(input.protocolId), 'protocol evidence count query returned no row');
  const evidenceCount = evidenceRow.count;

  if (evidenceCount < 2) {
    throw new Error(`promote_protocol requires at least 2 evidence items; found ${evidenceCount}`);
  }
  if (!protocol.scopeKind || !protocol.scopeValue) {
    throw new Error('promote_protocol requires explicit scope');
  }
  if (!protocol.action) {
    throw new Error('promote_protocol requires an action');
  }

  kernel.db.prepare(`
    update protocols
    set status = 'active', promoted_by = ?, promoted_at = ?
    where protocol_id = ?
  `).run(input.promotedBy ?? null, ISO_NOW(), input.protocolId);
  return ensureProtocol(kernel, input.protocolId);
}

export function promoteProtocolFromPreferences(
  kernel: LearningKernel,
  input: PromoteProtocolFromPreferencesInput
): ProtocolRecord {
  requireFields(input, ['protocolId']);
  const protocol = ensureProtocol(kernel, input.protocolId);
  if (protocol.status !== 'candidate') {
    throw new Error(`protocol ${input.protocolId} is not a candidate`);
  }
  for (const preferenceId of input.preferenceIds ?? []) {
    ensurePreferencePair(kernel, preferenceId);
    kernel.db.prepare(`
      insert or ignore into protocol_preferences (protocol_id, preference_id, attached_at)
      values (?, ?, ?)
    `).run(input.protocolId, preferenceId, ISO_NOW());
  }
  const preferenceRow = requiredRow<{ count: number }>(kernel.db.prepare(`
    select count(*) as count
    from protocol_preferences pp
    join preference_pairs p on p.preference_id = pp.preference_id
    where pp.protocol_id = ?
      and p.confidence in ('medium', 'high')
  `).get(input.protocolId), 'protocol preference count query returned no row');
  const minPreferences = input.minPreferences ?? 2;
  if (preferenceRow.count < minPreferences) {
    throw new Error(`promote_protocol_from_preferences requires at least ${minPreferences} preference pairs; found ${preferenceRow.count}`);
  }
  if (!protocol.scopeKind || !protocol.scopeValue) {
    throw new Error('promote_protocol_from_preferences requires explicit scope');
  }
  if (!protocol.action) {
    throw new Error('promote_protocol_from_preferences requires an action');
  }

  kernel.db.prepare(`
    update protocols
    set status = 'active', promoted_by = ?, promoted_at = ?
    where protocol_id = ?
  `).run(input.promotedBy ?? null, ISO_NOW(), input.protocolId);
  return ensureProtocol(kernel, input.protocolId);
}

export function resolveProtocol(kernel: LearningKernel, input: ResolveProtocolInput): ResolveProtocolResult {
  requireFields(input, ['taskShape', 'channel']);
  const protocols = rows<ProtocolDelivery>(kernel.db.prepare(`
    select
      protocol_id as protocolId,
      title,
      scope_kind as scopeKind,
      scope_value as scopeValue,
      action,
      status
    from protocols
    where status = 'active'
      and scope_kind = 'channel'
      and scope_value = ?
    order by promoted_at asc, protocol_id asc
    limit 1
  `).all(input.channel));

  let deliveryId: string | null = null;
  for (const protocol of protocols) {
    deliveryId = `delivery-${input.runId ?? 'adhoc'}-${protocol.protocolId}`;
    kernel.db.prepare(`
      insert or ignore into deliveries (
        delivery_id, protocol_id, run_id, task_shape, channel, delivered_at
      )
      values (?, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      protocol.protocolId,
      input.runId ?? null,
      input.taskShape,
      input.channel,
      ISO_NOW()
    );
  }

  return { protocols, deliveryId };
}

export function recordOutcome(kernel: LearningKernel, input: RecordOutcomeInput): OutcomeRecord {
  requireFields(input, ['deliveryId', 'followed', 'defectRepeated', 'verified', 'costBand']);
  ensureDelivery(kernel, input.deliveryId);
  const creditDelta = scoreOutcome(input);
  const outcomeId = input.outcomeId ?? `outcome-${input.deliveryId}`;
  kernel.db.prepare(`
    insert into outcomes (
      outcome_id, delivery_id, run_id, followed, defect_repeated, verified,
      cost_band, credit_delta, recorded_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    outcomeId,
    input.deliveryId,
    input.runId ?? null,
    boolInt(input.followed),
    boolInt(input.defectRepeated),
    boolInt(input.verified),
    input.costBand,
    creditDelta,
    ISO_NOW()
  );
  return { outcomeId, deliveryId: input.deliveryId, creditDelta };
}

export function getCredit(kernel: LearningKernel): AdaptiveCredit {
  const row = requiredRow<AdaptiveCredit>(kernel.db.prepare(`
    select coalesce(sum(credit_delta), 0) as adaptiveCredit
    from outcomes
  `).get(), 'credit query returned no row');
  return { adaptiveCredit: row.adaptiveCredit };
}

export function getProtocol(kernel: LearningKernel, protocolId: string): ProtocolRecord | undefined {
  return optionalRow<ProtocolRecord>(kernel.db.prepare(`
    select
      protocol_id as protocolId,
      title,
      scope_kind as scopeKind,
      scope_value as scopeValue,
      action,
      proposed_by as proposedBy,
      promoted_by as promotedBy,
      status
    from protocols
    where protocol_id = ?
  `).get(protocolId));
}

export function ensureProtocol(kernel: LearningKernel, protocolId: string): ProtocolRecord {
  const protocol = getProtocol(kernel, protocolId);
  if (!protocol) throw new Error(`unknown protocol: ${protocolId}`);
  return protocol;
}

function scoreOutcome(input: RecordOutcomeInput): number {
  let score = 0;
  if (input.verified) score += 10;
  if (input.followed) score += 5;
  if (!input.defectRepeated) score += 5;
  if (!input.followed) score -= 5;
  if (input.defectRepeated) score -= 20;
  if (input.costBand === 'medium') score -= 2;
  if (input.costBand === 'high') score -= 5;
  return score;
}

function ensureDelivery(kernel: LearningKernel, deliveryId: string): { deliveryId: string } {
  const delivery = kernel.db.prepare(`
    select delivery_id as deliveryId
    from deliveries
    where delivery_id = ?
  `).get(deliveryId) as { deliveryId: string } | undefined;
  if (!delivery) throw new Error(`unknown delivery: ${deliveryId}`);
  return delivery;
}
