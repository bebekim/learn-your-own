import type { DatabaseSync } from 'node:sqlite';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { inspectFindingOpportunities, resolveFindingEvidence } from './session-finding-evidence.ts';

const text = z.string().trim().min(1).max(500);
const findingSchema = z.object({
  source: z.literal('session-finding@1'), gitCommonDir: z.string().refine(path.isAbsolute),
  activity: z.enum(['transfer-review', 'experiment-design', 'learning-budget']),
  observation: z.string().trim().min(1).max(240), evidenceRef: z.string().trim().min(1).max(300),
  intervention: z.string().trim().min(1).max(220),
}).strict();
const contextSchema = z.object({ repository: z.string().nullable(), activity: text,
  match: z.enum(['repository', 'activity']) }).strict();
const feedbackSchema = z.object({
  id: text, findingId: text, deliveryId: text, supersedes: text.optional(),
  applicability: z.enum(['applicable', 'inapplicable', 'unknown']),
  adherence: z.enum(['followed', 'not-followed', 'unknown']),
  outcome: z.enum(['supported', 'contradicted', 'unknown']),
  verifier: text, evidenceRef: text, rationale: text,
}).strict();
const receiptSchema = feedbackSchema.extend({ source: z.enum(['session-finding-feedback@1', 'session-finding-feedback@2']),
  version: text, context: contextSchema, opportunityId: text.optional(), observationId: text.optional(), evidenceHash: text.optional() });
const revisionSchema = z.object({ id: text, findingId: text, previousVersion: text,
  intervention: z.string().trim().min(1).max(220), feedbackIds: z.array(text).min(1), author: text, rationale: text }).strict();
const revisionReceiptSchema = revisionSchema.extend({ source: z.literal('session-finding-revision@1'), version: text,
  scopeFeedbackIds: z.array(text).default([]) });
type Feedback = z.infer<typeof receiptSchema>;
type Finding = z.infer<typeof findingSchema> & { id: string };
export type SessionFinding = Finding & { version: string; context: z.infer<typeof contextSchema>; supporting: number };

function checkedFeedback(db: DatabaseSync, row: Feedback): boolean {
  if (row.source !== 'session-finding-feedback@2') return false;
  try {
    const evidence = resolveFindingEvidence(db, row.evidenceRef);
    return !evidence.withdrawn && row.evidenceHash === evidence.hash && row.opportunityId === evidence.opportunityId && row.observationId === evidence.observationId
      && row.findingId === evidence.opportunity.input.findingId && row.deliveryId === evidence.deliveryId
      && row.version === evidence.opportunity.version && hashValue(row.context) === hashValue(evidence.opportunity.context)
      && row.applicability === evidence.applicability && row.adherence === evidence.adherence && row.outcome === evidence.outcome;
  } catch { return false; }
}

function records(db: DatabaseSync, source: string): Array<{ id: string; value: unknown }> {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'learning_trace'").get()) return [];
  return db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = ?
    ORDER BY rowid`).all(source).map(row => ({ id: String(row.trace_id), value: JSON.parse(String(row.payload_json)) }));
}

export function findingState(db: DatabaseSync, id: string) {
  // ponytail: replay this small journal on reads; index/materialize if hook latency grows.
  const row = records(db, 'session-finding@1').find(row => row.id === id);
  if (!row) throw new Error('unknown session finding');
  let finding: Finding = { ...findingSchema.parse(row.value), id };
  let version = hashValue(finding);
  const revisions = records(db, 'session-finding-revision@1').flatMap(row => {
    const parsed = revisionReceiptSchema.safeParse(row.value);
    return parsed.success && parsed.data.findingId === id ? [parsed.data] : [];
  });
  for (const revision of revisions) {
    if (revision.previousVersion !== version) throw new Error('broken finding revision chain');
    finding = { ...finding, intervention: revision.intervention };
    version = revision.version;
  }
  const feedback = [...records(db, 'session-finding-feedback@1'), ...records(db, 'session-finding-feedback@2')].flatMap(row => {
    const parsed = receiptSchema.safeParse(row.value);
    return parsed.success && parsed.data.findingId === id ? [parsed.data] : [];
  });
  const superseded = new Set(feedback.map(row => row.supersedes));
  const latestFeedback = feedback.filter(row => !superseded.has(row.id));
  const currentFeedback = latestFeedback.filter(row => checkedFeedback(db, row));
  const unverifiedFeedbackIds = latestFeedback.filter(row => !currentFeedback.includes(row)).map(row => row.id);
  const supporting = new Set(currentFeedback.filter(row => row.version === version && row.outcome === 'supported').map(row => row.observationId)).size;
  const scopeReviewFeedbackIds = currentFeedback.filter(row => row.version === version && row.applicability === 'inapplicable').map(row => row.id);
  // An opportunity-level misfire is not evidence for a repository-wide exclusion.
  const excludedContexts: z.infer<typeof contextSchema>[] = [];
  const contradicted = currentFeedback.some(row => row.version === version && row.outcome === 'contradicted');
  const staleRevisionIds = revisions.filter(revision => !revision.feedbackIds.every(id => currentFeedback.some(row => row.id === id
    && row.version === revision.previousVersion && row.outcome === 'contradicted'))).map(row => row.id);
  return { finding, version, revisions, feedback, latestFeedback, currentFeedback, supporting, excludedContexts,
    scopeReviewFeedbackIds, unverifiedFeedbackIds, staleRevisionIds,
    validity: staleRevisionIds.length ? 'needs-reassessment' : contradicted ? 'needs-revision' : supporting ? 'supported' : 'unvalidated' };
}

export function inspectFinding(store: LessonStore, id: string) {
  const state = findingState(store.db, id);
  const opportunities = inspectFindingOpportunities(store.db, id).map(entry => {
    const review = state.latestFeedback.find(row => row.opportunityId === entry.id);
    const evidence = entry.evidence;
    return { ...entry, reviewed: Boolean(review), reviewEvidenceCurrent: Boolean(review && state.currentFeedback.includes(review)),
      semanticReviewTemplate: entry.registered ? {
        id: '', opportunityId: entry.id, ...(entry.semantics ? { supersedes: entry.semantics.id } : {}),
        reviewer: { id: '', kind: 'agent' }, verdict: '', claimKind: entry.registered.input.claim.kind,
        ...Object.fromEntries(['applicability', 'adherence', 'prediction'].map(key => [key,
          { rationale: '', verifierPaths: entry.registered!.input.verifierFiles }])), limitations: '',
      } : null,
      reviewTemplate: evidence?.deliveryId ? {
        id: `review-${hashValue([entry.id, review?.id ?? null, evidence.hash]).slice(0, 20)}`, findingId: id,
        deliveryId: evidence.deliveryId, ...(review ? { supersedes: review.id } : {}),
        applicability: evidence.applicability, adherence: evidence.adherence, outcome: evidence.outcome,
        verifier: `${evidence.opportunity.input.evaluator.id}@${evidence.opportunity.input.evaluator.version}`,
        evidenceRef: evidence.id, rationale: '',
      } : null };
  });
  const deliveries = store.db.prepare(`SELECT trace_id, run_id, payload_json FROM learning_trace
    WHERE kind = 'protocol_application' AND json_valid(payload_json) ORDER BY rowid`).all().flatMap(row => {
    const payload = JSON.parse(String(row.payload_json));
    const snapshot = Array.isArray(payload.findings) ? payload.findings.find((entry: SessionFinding) => entry.id === id) : null;
    if (!snapshot) return [];
    const review = state.latestFeedback.find(feedback => feedback.deliveryId === row.trace_id);
    return [{ deliveryId: String(row.trace_id), sessionId: row.run_id, version: snapshot.version ?? null,
      context: snapshot.context ?? null, reviewed: Boolean(review),
      registrationTemplate: snapshot.version && snapshot.context ? {
        id: '', findingId: id, deliveryId: String(row.trace_id), taskId: '', cwd: payload.cwd,
        claim: { kind: '', conditions: '', action: snapshot.intervention, prediction: '', falsifiedBy: '' },
        checks: { applicability: '', adherence: '', prediction: '' }, verifierFiles: [], sourceFiles: [],
        evaluator: { id: '', version: '' },
      } : null }];
  });
  return { ...state, deliveries, opportunities };
}

export function selectSessionFindings(db: DatabaseSync, input: { repository: () => string | null; cwd?: string | null; prompt?: string | null }): SessionFinding[] {
  const candidates = records(db, 'session-finding@1');
  const repository = candidates.length ? input.repository() : null;
  return candidates.flatMap(row => {
    if (!findingSchema.safeParse(row.value).success) return [];
    let state: ReturnType<typeof findingState>;
    try { state = findingState(db, row.id); } catch { return []; }
    if (state.validity === 'needs-revision' || state.validity === 'needs-reassessment') return [];
    const activity = input.prompt?.includes(`[lyo:${state.finding.activity}]`);
    if (!activity && state.finding.gitCommonDir !== repository) return [];
    const context = { repository: repository ?? (input.cwd ? realpathSync(input.cwd) : null),
      activity: state.finding.activity, match: activity ? 'activity' as const : 'repository' as const };
    const supporting = new Set(state.currentFeedback.filter(row => row.version === state.version && row.outcome === 'supported'
      && hashValue(row.context) === hashValue(context)).map(row => row.observationId)).size;
    return [{ ...state.finding, version: state.version, context, supporting }];
  }).slice(0, 3);
}

export function recordFindingFeedback(store: LessonStore, value: unknown): Feedback {
  const input = feedbackSchema.parse(value);
  if (input.outcome !== 'unknown' && (input.applicability !== 'applicable' || input.adherence !== 'followed'))
    throw new Error('a validity judgment requires evidence that the finding was applicable and followed');
  const delivery = store.getTrace(input.deliveryId);
  if (!delivery || delivery.kind !== 'protocol_application') throw new Error('unknown finding delivery');
  const payload = JSON.parse(delivery.payload_json ?? '{}');
  const finding = payload.findings?.find((row: SessionFinding) => row.id === input.findingId);
  if (!finding?.version || !finding.context) throw new Error('delivery lacks this finding with versioned context');
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const evidence = resolveFindingEvidence(store.db, input.evidenceRef);
    if (evidence.deliveryId !== input.deliveryId || evidence.opportunity.input.findingId !== input.findingId
      || evidence.opportunity.version !== finding.version) throw new Error('finding evidence belongs to another delivery or version');
    if (input.applicability !== evidence.applicability || input.adherence !== evidence.adherence || input.outcome !== evidence.outcome)
      throw new Error('review judgments must match registered finding evidence');
    const receipt = receiptSchema.parse({ ...input, source: 'session-finding-feedback@2',
      version: finding.version, context: finding.context, opportunityId: evidence.opportunityId, observationId: evidence.observationId, evidenceHash: evidence.hash });
    const prior = store.getTrace(`finding-feedback:${input.id}`);
    if (prior) {
      if (hashValue(JSON.parse(prior.payload_json ?? '{}')) !== hashValue(receipt)) throw new Error('conflicting feedback identity');
    } else {
      const reviewed = inspectFinding(store, input.findingId).latestFeedback.find(row => row.opportunityId === evidence.opportunityId
        || (row.source === 'session-finding-feedback@1' && row.deliveryId === input.deliveryId));
      if (input.supersedes && input.supersedes !== reviewed?.id) throw new Error('supersedes must name the current review of this delivery');
      if (reviewed && !input.supersedes) throw new Error('delivery already reviewed; use supersedes to correct its evidence');
      store.recordTrace({ trace_id: `finding-feedback:${input.id}`, run_id: delivery.run_id, kind: 'behavior',
        summary: 'Reviewed finding outcome.', ref: input.evidenceRef, payload: receipt });
    }
    store.db.exec('COMMIT');
    return receipt;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function reviseFinding(store: LessonStore, value: unknown) {
  const input = revisionSchema.parse(value);
  let receipt: z.infer<typeof revisionReceiptSchema>;
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const prior = store.getTrace(`finding-revision:${input.id}`);
    if (prior) {
      receipt = revisionReceiptSchema.parse(JSON.parse(prior.payload_json ?? '{}'));
      const { source: _source, version: _version, scopeFeedbackIds: _scope, ...priorInput } = receipt;
      if (hashValue(priorInput) !== hashValue(input)) throw new Error('conflicting revision identity');
    } else {
      const state = inspectFinding(store, input.findingId);
      if (input.previousVersion !== state.version) throw new Error('stale finding version');
      if (input.intervention === state.finding.intervention) throw new Error('revision must change the advice');
      if (!input.feedbackIds.every(id => state.currentFeedback.some(row => row.id === id && row.version === state.version && row.outcome === 'contradicted')))
        throw new Error('revision requires checked contradiction on the current finding version');
      const snapshot = { ...input, scopeFeedbackIds: [] };
      receipt = { ...snapshot, source: 'session-finding-revision@1', version: hashValue(snapshot) };
      store.recordTrace({ trace_id: `finding-revision:${input.id}`, kind: 'behavior',
        summary: 'Provisional finding revision from reviewed outcomes.', payload: receipt });
    }
    store.db.exec('COMMIT');
    return receipt;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
