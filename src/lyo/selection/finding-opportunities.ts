import { hashValue } from '../../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingOpportunity, findingAssignment, findingOpportunityDelivery } from './session-finding-evidence.ts';
import { findingSemanticReview } from './session-finding-semantics.ts';
import { findingState } from './session-findings.ts';
import { findingFiles } from './session-finding-files.ts';

function beforeAction(store: LessonStore, id: string) {
  if (store.getTrace(`finding-action:${id}:before`) || store.getTrace(`finding-action:${id}:after`)
    || store.getTrace(`finding-evidence:${id}`)) throw new Error('assignment and delivery must precede the action');
  const registered = findingOpportunity(store.db, id), { content } = registered;
  const current = findingState(store.db, content.input.findingId);
  if (current.version !== content.version || ['needs-revision', 'needs-reassessment'].includes(current.validity))
    throw new Error('finding changed or was suspended before assignment or delivery');
  if (content.problems.length || content.applicability.satisfied !== true
    || findingSemanticReview(store.db, id, registered.payload.hash)?.verdict !== 'accepted')
    throw new Error('assignment requires checked eligibility and reviewed evaluator semantics');
  if (hashValue(findingFiles(content.input.sourceFiles)) !== hashValue(content.sourceBefore)
    || hashValue(findingFiles(content.input.verifierFiles)) !== hashValue(content.verifierFiles))
    throw new Error('source or verifier changed before assignment or delivery');
  return registered;
}

export function assignFindingOpportunity(store: LessonStore, id: string, random = Math.random) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const prior = findingAssignment(store.db, id);
    if (prior) { store.db.exec('COMMIT'); return prior; }
    const registered = beforeAction(store, id);
    if (!registered.content.input.prospective) throw new Error('assignment requires a prospective opportunity');
    const { sessionId, input } = registered.content;
    const priorAssignments = store.db.prepare(`SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
      AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-assignment@1'`).all(sessionId);
    if (priorAssignments.some(row => findingOpportunity(store.db, JSON.parse(String(row.payload_json)).opportunityId)
      .content.input.prospective?.trialId === input.prospective!.trialId)) throw new Error('session already assigned to this trial');
    const deliveries = store.db.prepare("SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'protocol_application'").all(sessionId);
    if (deliveries.some(row => JSON.parse(String(row.payload_json)).findings?.some((finding: { id: string }) => finding.id === input.findingId)))
      throw new Error('session already exposed to this finding');
    const draw = random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('random draw must be in [0, 1)');
    const content = { source: 'session-finding-assignment@1' as const, opportunityId: id, opportunityHash: registered.payload.hash,
      action: draw < 0.5 ? 'advice' as const : 'no-advice' as const, probability: 0.5 as const };
    const receipt = { ...content, hash: hashValue(content) };
    store.recordTrace({ trace_id: `finding-assignment:${id}`, run_id: registered.content.sessionId, kind: 'behavior',
      summary: 'Prospective randomized lesson assignment; no delivery inferred.', payload: receipt });
    store.db.exec('COMMIT');
    return receipt;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function emitFindingOpportunity(store: LessonStore, id: string, write: (text: string) => void) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const assignment = findingAssignment(store.db, id);
    if (!assignment) throw new Error('assign the opportunity before delivery');
    if (assignment.action === 'no-advice' || findingOpportunityDelivery(store.db, id)) { store.db.exec('COMMIT'); return; }
    const { content, payload } = beforeAction(store, id);
    const finding = { ...findingState(store.db, content.input.findingId).finding, version: content.version,
      context: content.context, supporting: 0 };
    write(`LYO prospective lesson (${id}): ${finding.intervention}\n`);
    store.recordTrace({ trace_id: `finding-delivery:${id}`, run_id: content.sessionId, kind: 'protocol_application',
      summary: 'Prospective advice emitted as hook context.', payload: { cwd: content.input.cwd,
        opportunityHash: payload.hash, findings: [finding], evidenceKind: 'delivery-only' } });
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
