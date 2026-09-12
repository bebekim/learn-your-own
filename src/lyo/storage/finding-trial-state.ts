import { hashValue } from '../../contract/refs.ts';
import type { LessonStore } from './lesson-store.ts';
import { findingAssignment, findingOpportunity, resolveFindingEvidence } from './finding-evidence.ts';
import { findingState } from './finding-state.ts';
import { findingFiles } from './finding-files.ts';
import type { FindingTrialReconciliationPort, TrialObservation, TrialPolicyRecord } from '../application/finding-trial-reconciliation.ts';

function windowReceipt(store: LessonStore, id: string) {
  const row = store.getTrace(`finding-window:${id}`);
  if (!row) return null;
  const receipt = JSON.parse(row.payload_json!);
  if (receipt.source !== 'session-finding-window@1' || receipt.hash !== hashValue(receipt.content)
    || receipt.content.opportunityHash !== findingOpportunity(store.db, id).payload.hash)
    throw new Error('invalid finding outcome window');
  return receipt as { hash: string; content: { opportunityHash: string; evidenceRef: string | null } };
}

/** The next matching action, or a turn/session boundary, closes the declared proximal outcome window. */
export function closeFindingTrialWindow(store: LessonStore, id: string, eventName: string) {
  if (windowReceipt(store, id)) return;
  const evidenceRef = store.getTrace(`finding-evidence:${id}`) ? `finding-evidence:${id}` : null;
  if (!evidenceRef && !['UserPromptSubmit', 'Stop', 'SessionEnd'].includes(eventName)) return;
  const registered = findingOpportunity(store.db, id);
  const content = { opportunityHash: registered.payload.hash, evidenceRef };
  store.recordTrace({ trace_id: `finding-window:${id}`, run_id: registered.content.sessionId, kind: 'behavior',
    summary: 'Prospective outcome window closed; missing evidence remains unknown.',
    payload: { source: 'session-finding-window@1', content, hash: hashValue(content) } });
}

function observations(store: LessonStore, trialHash: string): TrialObservation[] {
  return store.db.prepare(`SELECT a.payload_json FROM learning_trace a JOIN learning_trace o
    ON o.trace_id = 'finding-opportunity:' || json_extract(a.payload_json, '$.opportunityId')
    WHERE a.kind = 'behavior' AND json_extract(a.payload_json, '$.source') = 'session-finding-assignment@1'
    AND json_extract(o.payload_json, '$.content.input.prospective.automatic.trialHash') = ? ORDER BY a.rowid`).all(trialHash).map(row => {
      const id = JSON.parse(String(row.payload_json)).opportunityId as string;
      const assignment = findingAssignment(store.db, id)!;
      const registered = findingOpportunity(store.db, id);
      const window = windowReceipt(store, id);
      const evidence = window?.content.evidenceRef ? resolveFindingEvidence(store.db, window.content.evidenceRef) : null;
      if (evidence && evidence.opportunityId !== id) throw new Error('outcome window references another opportunity');
      return { id, assignment: { action: assignment.action, probability: assignment.probability },
        sessionId: registered.content.sessionId, cwd: registered.content.input.cwd,
        unit: registered.content.input.prospective?.automatic?.unit,
        closed: Boolean(window), outcome: evidence?.observedOutcome ?? 'unknown' as const,
        reference: { id, assignmentHash: assignment.hash, windowHash: window?.hash ?? null, evidenceHash: evidence?.hash ?? null } };
    });
}

function latestPolicy(store: LessonStore, trialHash: string): TrialPolicyRecord | null {
  const row = store.db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE kind = 'behavior'
    AND json_extract(payload_json, '$.source') = 'session-finding-policy@1'
    AND json_extract(payload_json, '$.content.trialHash') = ? ORDER BY rowid DESC LIMIT 1`).get(trialHash);
  if (!row) return null;
  const receipt = JSON.parse(String(row.payload_json));
  if (receipt.hash !== hashValue(receipt.content)) throw new Error('invalid finding policy integrity');
  return { id: String(row.trace_id), ...receipt };
}

export function findingTrialReconciliationPort(store: LessonStore): FindingTrialReconciliationPort {
  return {
    observations: trialHash => observations(store, trialHash),
    findingState(findingId) {
      const state = findingState(store.db, findingId);
      return { version: state.version, validity: state.validity };
    },
    verifiersChanged: (paths, expectedHash) => hashValue(findingFiles(paths)) !== expectedHash,
    superseded: trialId => Boolean(store.db.prepare(`SELECT 1 FROM learning_trace WHERE kind = 'behavior'
      AND json_extract(payload_json, '$.source') = 'session-finding-trial@1'
      AND json_extract(payload_json, '$.content.input.supersedes') = ?`).get(trialId)),
    latestPolicy: trialHash => latestPolicy(store, trialHash),
    recordPolicy(record) {
      const { id, ...payload } = record;
      store.recordTrace({ trace_id: id, kind: 'behavior',
        summary: `Scoped finding delivery policy: ${record.content.status}.`, payload });
    },
    hash: hashValue,
  };
}
