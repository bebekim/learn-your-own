import { hashValue } from '../../contract/refs.ts';
import { realpathSync } from 'node:fs';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingOpportunity, findingAssignment, findingOpportunityDelivery } from './session-finding-evidence.ts';
import { findingSemanticReview } from './session-finding-semantics.ts';
import { findingState } from './session-findings.ts';
import { findingFiles } from '../storage/finding-files.ts';
import { closeFindingTrialWindow, findingTrialAllocation } from './finding-trial-policy.ts';

function beforeAction(store: LessonStore, id: string) {
  if (store.getTrace(`finding-window:${id}`)) throw new Error('finding outcome window has closed');
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

export function assignFindingOpportunity(store: LessonStore, id: string, random = Math.random, policyRef?: string) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const prior = findingAssignment(store.db, id);
    if (prior) { store.db.exec('COMMIT'); return prior; }
    const registered = beforeAction(store, id);
    if (!registered.content.input.prospective) throw new Error('assignment requires a prospective opportunity');
    const { sessionId, input } = registered.content;
    const priorAssignments = store.db.prepare(`SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
      AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-assignment@1'`).all(sessionId);
    for (const row of priorAssignments) {
      const previous = findingOpportunity(store.db, JSON.parse(String(row.payload_json)).opportunityId).content.input;
      if (previous.prospective?.trialId === input.prospective!.trialId) throw new Error('session already assigned to this trial');
      if (input.prospective?.automatic && previous.prospective?.automatic && previous.capture?.runtime === input.capture?.runtime)
        throw new Error('session already enrolled in an ordinary trial');
    }
    const deliveries = store.db.prepare("SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'protocol_application'").all(sessionId);
    if (deliveries.some(row => {
      const payload = JSON.parse(String(row.payload_json));
      return payload.findings?.some((finding: { id: string }) => finding.id === input.findingId)
        || payload.lessons?.some((lesson: { intervention: string }) => lesson.intervention?.trim() === input.claim.action.trim());
    }))
      throw new Error('session already exposed to this finding');
    const allocation = policyRef ? findingTrialAllocation(store, registered, policyRef) : null;
    if (input.prospective?.automatic && !policyRef) throw new Error('automatic trials require a current policy decision');
    const draw = allocation ? 0 : random();
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('random draw must be in [0, 1)');
    const content = { source: 'session-finding-assignment@1' as const, opportunityId: id, opportunityHash: registered.payload.hash,
      action: allocation ?? (draw < 0.5 ? 'advice' as const : 'no-advice' as const), probability: allocation ? 1 as const : 0.5 as const,
      ...(policyRef ? { policyRef } : {}) };
    const receipt = { ...content, hash: hashValue(content) };
    store.recordTrace({ trace_id: `finding-assignment:${id}`, run_id: registered.content.sessionId, kind: 'behavior',
      summary: 'Prospective randomized lesson assignment; no delivery inferred.', payload: receipt });
    store.db.exec('COMMIT');
    return receipt;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function emitFindingOpportunity(store: LessonStore, id: string, write: (text: string) => void, refresh = false) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const assignment = findingAssignment(store.db, id);
    if (!assignment) throw new Error('assign the opportunity before delivery');
    const delivered = findingOpportunityDelivery(store.db, id);
    if (assignment.action === 'no-advice' || (refresh ? !delivered : delivered)) { store.db.exec('COMMIT'); return; }
    const { content, payload } = beforeAction(store, id);
    if (assignment.policyRef) findingTrialAllocation(store, { content }, assignment.policyRef);
    const finding = { ...findingState(store.db, content.input.findingId).finding, version: content.version,
      context: content.context, supporting: 0 };
    write(`LYO prospective lesson (${id}): ${finding.intervention}\n`);
    if (!delivered) store.recordTrace({ trace_id: `finding-delivery:${id}`, run_id: content.sessionId, kind: 'protocol_application',
      summary: 'Prospective advice emitted as hook context.', payload: { cwd: content.input.cwd,
        opportunityHash: payload.hash, findings: [finding], evidenceKind: 'delivery-only' } });
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function refreshSessionTrialAdvice(store: LessonStore, input: {
  sessionId: string; cwd: string; model?: string | null; event?: string | null; source?: string | null;
}, write: (text: string) => void) {
  const rows = store.db.prepare(`SELECT payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-opportunity@2'`).all(input.sessionId);
  for (const row of rows) {
    try {
      const id = JSON.parse(String(row.payload_json)).content.input.id;
      if (input.event === 'UserPromptSubmit' || ['startup', 'clear'].includes(input.source ?? ''))
        closeFindingTrialWindow(store, id, 'UserPromptSubmit');
      if (input.event !== 'SessionStart' || !['compact', 'resume'].includes(input.source ?? '')) continue;
      const registered = findingOpportunity(store.db, id).content;
      if (!input.model || registered.input.cwd !== realpathSync(input.cwd) || registered.input.prospective?.model !== input.model) continue;
      // Reuse the assignment and before-action checks; never redraw or turn a
      // refresh into a new application. Changed/closed opportunities stay silent.
      emitFindingOpportunity(store, id, write, true);
    } catch { /* A stale opportunity cannot authorize refreshed advice. */ }
  }
}
