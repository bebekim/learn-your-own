import type { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { findingLifecycle } from '../domain/finding-lifecycle.ts';
import { receiptSchema, revisionReceiptSchema } from '../application/finding-assessment.ts';
import type { Feedback, FindingAssessmentPort } from '../application/finding-assessment.ts';
import type { Finding } from '../application/finding-selection.ts';
import type { LessonStore } from './lesson-store.ts';
import { resolveFindingEvidence } from './finding-evidence.ts';

/** Activities are open names (Spec 11 increment A); a prompt opts in with `[lyo:<activity>]`. */
export const activitySchema = z.string().regex(/^[a-z][a-z0-9-]{1,47}$/, 'activity must be a lowercase slug');

export const findingSchema = z.object({
  source: z.literal('session-finding@1'),
  // Scoped either to one repository (gitCommonDir) or to repository roots (scope), never neither.
  gitCommonDir: z.string().refine(path.isAbsolute).optional(),
  scope: z.object({ roots: z.array(z.string().refine(path.isAbsolute)).min(1).max(20) }).strict().optional(),
  activity: activitySchema,
  observation: z.string().trim().min(1).max(240), evidenceRef: z.string().trim().min(1).max(300),
  intervention: z.string().trim().min(1).max(220),
}).strict().refine(f => Boolean(f.gitCommonDir) !== Boolean(f.scope), 'declare exactly one of gitCommonDir or scope');

/** Records a finding declared by a reviewer. An existing id with different content is refused. */
export function declareFinding(store: LessonStore, id: string, value: unknown) {
  if (!/^finding:[a-z0-9][a-z0-9:._-]{1,95}$/.test(id)) throw new Error('finding id must look like finding:<slug>');
  const finding = findingSchema.parse({ source: 'session-finding@1', ...(value as object) });
  const existing = store.getTrace(id);
  if (existing) {
    if (hashValue(JSON.parse(existing.payload_json!)) !== hashValue(finding)) throw new Error('a different finding already has this id');
    return { id, created: false, version: findingState(store.db, id).version };
  }
  store.recordTrace({ trace_id: id, kind: 'behavior', summary: 'Declared session finding; usefulness unvalidated.', payload: finding });
  return { id, created: true, version: findingState(store.db, id).version };
}
export type { Finding } from '../application/finding-selection.ts';

function checkedFeedback(db: DatabaseSync, row: Feedback): row is Feedback & { observationId: string } {
  if (row.source !== 'session-finding-feedback@2') return false;
  try {
    const evidence = resolveFindingEvidence(db, row.evidenceRef);
    return !evidence.withdrawn && row.evidenceHash === evidence.hash && row.opportunityId === evidence.opportunityId && row.observationId === evidence.observationId
      && row.findingId === evidence.opportunity.input.findingId && row.deliveryId === evidence.deliveryId
      && row.version === evidence.opportunity.version && hashValue(row.context) === hashValue(evidence.opportunity.context)
      && row.applicability === evidence.applicability && row.adherence === evidence.adherence && row.outcome === evidence.outcome;
  } catch { return false; }
}

export function findingRecords(db: DatabaseSync, source: string): Array<{ id: string; value: unknown }> {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'learning_trace'").get()) return [];
  return db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = ?
    ORDER BY rowid`).all(source).map(row => ({ id: String(row.trace_id), value: JSON.parse(String(row.payload_json)) }));
}

export function findingState(db: DatabaseSync, id: string) {
  // ponytail: replay this small journal on reads; index/materialize if hook latency grows.
  const row = findingRecords(db, 'session-finding@1').find(row => row.id === id);
  if (!row) throw new Error('unknown session finding');
  const original: Finding = { ...findingSchema.parse(row.value), id };
  const revisions = findingRecords(db, 'session-finding-revision@1').flatMap(row => {
    const parsed = revisionReceiptSchema.safeParse(row.value);
    return parsed.success && parsed.data.findingId === id ? [parsed.data] : [];
  });
  const feedback = [...findingRecords(db, 'session-finding-feedback@1'), ...findingRecords(db, 'session-finding-feedback@2')].flatMap(row => {
    const parsed = receiptSchema.safeParse(row.value);
    return parsed.success && parsed.data.findingId === id ? [parsed.data] : [];
  });
  const superseded = new Set(feedback.map(row => row.supersedes));
  const latestFeedback = feedback.filter(row => !superseded.has(row.id));
  const checked = latestFeedback.filter((row): row is Feedback & { observationId: string } => checkedFeedback(db, row));
  const currentFeedback: Feedback[] = checked;
  const unverifiedFeedbackIds = latestFeedback.filter(row => !currentFeedback.includes(row)).map(row => row.id);
  const { intervention, ...lifecycle } = findingLifecycle(
    { version: hashValue(original), intervention: original.intervention }, revisions, checked);
  const finding = { ...original, intervention };
  // An opportunity-level misfire is not evidence for a repository-wide exclusion.
  const excludedContexts: Array<{ repository: string | null; activity: string; match: 'repository' | 'activity' }> = [];
  return { finding, ...lifecycle, revisions, feedback, latestFeedback, currentFeedback, excludedContexts, unverifiedFeedbackIds };
}

export function findingAssessmentPort(store: LessonStore): FindingAssessmentPort {
  return {
    hash: hashValue,
    evidence: ref => resolveFindingEvidence(store.db, ref),
    state(id) {
      const state = findingState(store.db, id);
      return { version: state.version, finding: state.finding, currentFeedback: state.currentFeedback,
        latestFeedback: state.latestFeedback.map(receipt => ({ receipt, current: state.currentFeedback.includes(receipt) })) };
    },
    delivery(id) {
      const row = store.getTrace(id);
      return row ? { kind: row.kind, sessionId: row.run_id,
        findings: row.kind === 'protocol_application' ? JSON.parse(row.payload_json ?? '{}').findings : undefined } : null;
    },
    prior(kind, id) {
      const row = store.getTrace(`finding-${kind}:${id}`);
      return row ? { value: JSON.parse(row.payload_json ?? '{}') } : null;
    },
    transaction(work) {
      store.db.exec('BEGIN IMMEDIATE');
      try { const result = work(); store.db.exec('COMMIT'); return result; }
      catch (error) { store.db.exec('ROLLBACK'); throw error; }
    },
    append(receipt, sessionId) {
      if (receipt.source === 'session-finding-revision@1') {
        store.recordTrace({ trace_id: `finding-revision:${receipt.id}`, kind: 'behavior',
          summary: 'Provisional finding revision from reviewed outcomes.', payload: receipt });
      } else {
        store.recordTrace({ trace_id: `finding-feedback:${receipt.id}`, run_id: sessionId, kind: 'behavior',
          summary: 'Reviewed finding outcome.', ref: receipt.evidenceRef, payload: receipt });
      }
    },
  };
}
