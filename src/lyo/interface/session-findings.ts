import type { DatabaseSync } from 'node:sqlite';
import { realpathSync } from 'node:fs';
import { hashValue } from '../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { inspectFindingOpportunities } from '../storage/finding-evidence.ts';
import { findingState, findingRecords as records, findingSchema, findingAssessmentPort } from '../storage/finding-state.ts';
import { assessmentInput, assessFindingEvidence as assess, recordFindingFeedback as record, reviseFinding as revise } from '../application/finding-assessment.ts';
import { selectSessionFindings as select } from '../application/finding-selection.ts';
import type { SessionFinding } from '../application/finding-selection.ts';

export { findingState } from '../storage/finding-state.ts';
export type { SessionFinding } from '../application/finding-selection.ts';

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
      reviewTemplate: evidence ? assessmentInput(hashValue, evidence, review) : null };
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

export function trialManagedFindings(db: DatabaseSync) {
  return new Map(records(db, 'session-finding-trial@1').map(row => {
    const input = (row.value as { content?: { input?: { findingId?: string; measurement?: { claim?: { action?: string } } } } }).content?.input;
    return [input?.findingId, input?.measurement?.claim?.action?.trim()] as const;
  }));
}

export function selectSessionFindings(db: DatabaseSync, input: { repository: () => string | null; cwd?: string | null; prompt?: string | null }): SessionFinding[] {
  const candidates = new Map(records(db, 'session-finding@1').map(row => [row.id, row.value]));
  const managed = trialManagedFindings(db);
  return select([...candidates.keys()], { ...input, cwd: () => input.cwd ? realpathSync(input.cwd) : null }, {
    hash: hashValue,
    managed: id => managed.has(id),
    state(id) {
      if (!findingSchema.safeParse(candidates.get(id)).success) return null;
      try { return findingState(db, id); } catch { return null; }
    },
  });
}

export function assessFindingEvidence(store: LessonStore, evidenceRef: string) {
  return assess(findingAssessmentPort(store), evidenceRef);
}

export function recordFindingFeedback(store: LessonStore, value: unknown) {
  return record(findingAssessmentPort(store), value);
}

export function reviseFinding(store: LessonStore, value: unknown) {
  return revise(findingAssessmentPort(store), value);
}
