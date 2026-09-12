import { evaluateFindingTrialPolicy, type FindingTrialPolicyDefinition } from '../domain/finding-trial-policy.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { hashValue } from '../../contract/refs.ts';
import { findingAssignment, findingOpportunity, resolveFindingEvidence } from './session-finding-evidence.ts';
import { findingState } from './session-findings.ts';
import { findingFiles } from './session-finding-files.ts';

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

function observations(store: LessonStore, trialHash: string) {
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
      return { id, assignment, sessionId: registered.content.sessionId, cwd: registered.content.input.cwd,
        unit: registered.content.input.prospective?.automatic?.unit,
        closed: Boolean(window), outcome: evidence?.observedOutcome ?? 'unknown' as const,
        reference: { id, assignmentHash: assignment.hash, windowHash: window?.hash ?? null, evidenceHash: evidence?.hash ?? null } };
    });
}

function latestPolicy(store: LessonStore, trialHash: string) {
  const row = store.db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE kind = 'behavior'
    AND json_extract(payload_json, '$.source') = 'session-finding-policy@1'
    AND json_extract(payload_json, '$.content.trialHash') = ? ORDER BY rowid DESC LIMIT 1`).get(trialHash);
  if (!row) return null;
  const receipt = JSON.parse(String(row.payload_json));
  if (receipt.hash !== hashValue(receipt.content)) throw new Error('invalid finding policy integrity');
  return { id: String(row.trace_id), ...receipt };
}

export function reconcileFindingTrial(store: LessonStore, trial: FindingTrialPolicyDefinition) {
  const rows = observations(store, trial.hash);
  const state = findingState(store.db, trial.findingId);
  const suspended = state.version !== trial.findingVersion || ['needs-revision', 'needs-reassessment'].includes(state.validity)
    || hashValue(findingFiles(trial.measurement.verifierFiles)) !== hashValue(trial.verifierFiles);
  const superseded = Boolean(store.db.prepare(`SELECT 1 FROM learning_trace WHERE kind = 'behavior'
    AND json_extract(payload_json, '$.source') = 'session-finding-trial@1'
    AND json_extract(payload_json, '$.content.input.supersedes') = ?`).get(trial.id));
  const { status, arms, effectInterval } = evaluateFindingTrialPolicy(rows, trial.evaluation, { suspended, superseded });
  const content = { trialId: trial.id, trialHash: trial.hash, status, arms, effectInterval,
    evidence: rows.map(row => row.reference), definition: { findingVersion: trial.findingVersion, model: trial.model,
      runtime: trial.runtime ?? null, roots: trial.roots, evaluation: trial.evaluation ?? null } };
  const previous = latestPolicy(store, trial.hash), hash = hashValue(content);
  const id = previous?.hash === hash ? previous.id : `finding-policy:${hashValue([hash, previous?.id ?? null])}`;
  const receipt = { source: 'session-finding-policy@1', content, hash,
    supersedes: previous?.hash === hash ? previous.supersedes : previous?.id ?? null };
  if (previous?.hash !== hash) store.recordTrace({ trace_id: id, kind: 'behavior',
    summary: `Scoped finding delivery policy: ${status}.`, payload: receipt });
  return { id, ...receipt };
}

/** Validate again inside assignment's write transaction and immediately before emission. */
export function findingTrialAllocation(store: LessonStore, registered: { content: ReturnType<typeof findingOpportunity>['content'] }, ref: string) {
  const prospective = registered.content.input.prospective;
  const trialHash = prospective?.automatic?.trialHash;
  if (!trialHash) throw new Error('policy allocation requires an automatic trial opportunity');
  const policy = latestPolicy(store, trialHash);
  const current = observations(store, trialHash).filter(row => row.id !== registered.content.input.id);
  if (current.some(row => row.unit === prospective.automatic!.unit)) throw new Error('repository or directory already enrolled in this trial');
  if (policy?.id !== ref || hashValue(current.map(row => row.reference)) !== hashValue(policy.content.evidence))
    throw new Error('finding policy changed; recheck before assignment or delivery');
  return policy.content.status === 'collecting' ? null : policy.content.status === 'promoted' ? 'advice' as const : 'no-advice' as const;
}
