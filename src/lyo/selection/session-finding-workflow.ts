import type { HookObservation } from '../../hooks/events.ts';
import { realpathSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { hashValue } from '../../contract/refs.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { captureFindingAction, findingActionEvidence } from './session-finding-capture.ts';
import { findingOpportunity, measureFindingOpportunity } from './session-finding-evidence.ts';
import { inspectFinding, recordFindingFeedback, trialManagedFindings } from './session-findings.ts';
import { findingSemanticReview } from './session-finding-semantics.ts';

export function findingOwnsToolCall(storePath: string | null, runtime: string, event: { session_id?: string; tool_use_id?: string; cwd?: string }): boolean {
  if (!storePath || !event.session_id || !event.tool_use_id || !event.cwd) return false;
  const db = new DatabaseSync(storePath, { readOnly: true });
  try {
    return Boolean(db.prepare(`SELECT 1 FROM learning_trace WHERE kind = 'behavior'
      AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-action@1'
      AND json_extract(payload_json, '$.runtime') = ? AND json_extract(payload_json, '$.sessionId') = ?
      AND json_extract(payload_json, '$.toolUseId') = ? AND json_extract(payload_json, '$.cwd') = ? LIMIT 1`)
      .get(runtime, event.session_id, event.tool_use_id, realpathSync(event.cwd)));
  } finally { db.close(); }
}

/** Runs only at live hook boundaries. Spool replay must never measure today's files as yesterday's result. */
export function observeSessionFindings(event: HookObservation, storePath: string | null): void {
  if (!storePath || !['codex', 'claude'].includes(event.runtime)) return;
  if (!hasFindingOpportunities(storePath)) return;
  const store = new LessonStore(storePath);
  try {
    const rows = opportunityRows(store);
    const registrations: ReturnType<typeof findingOpportunity>[] = [];
    for (const row of rows) {
      try {
        const registered = findingOpportunity(store.db, JSON.parse(String(row.payload_json)).content.input.id);
        const input = registered.content.input;
        if (!input.capture) continue;
        const retained = store.getTrace(`finding-evidence:${input.id}`);
        if (!retained && (input.cwd !== realpathSync(event.cwd) || input.capture.runtime !== event.runtime)) continue;
        captureFindingAction(store, registered, event);
        registrations.push(registered);
      } catch (error) { process.stderr.write(`Lyo finding capture: ${error instanceof Error ? error.message : String(error)}\n`); }
    }
    // Freeze every matching post-action snapshot before any evaluator can run.
    let measured = false;
    for (const registered of registrations) {
      try {
        const id = registered.content.input.id;
        const action = findingActionEvidence(store.db, registered);
        if (!action.after) continue;
        if (!store.getTrace(`finding-evidence:${id}`)) {
          // ponytail: one bounded evaluation per live boundary; later hooks drain retained pending work.
          if (measured) continue;
          measured = true;
        }
        measureFindingOpportunity(store, id);
        const entry = inspectFinding(store, registered.content.input.findingId).opportunities.find(entry => entry.id === id)!;
        if (entry.reviewEvidenceCurrent || !entry.reviewTemplate) continue;
        recordFindingFeedback(store, { ...entry.reviewTemplate,
          rationale: 'Automatic assessment of retained registered checks and live action boundaries; semantic judgment is attributed separately. Incremental benefit remains unknown.' });
      } catch (error) {
        process.stderr.write(`Lyo finding capture: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } finally { store.close(); }
}

function opportunityRows(store: Pick<LessonStore, 'db'>, cwd?: string) {
  const workspace = cwd ? realpathSync(cwd) : null;
  return store.db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END IN ('session-finding-opportunity@1', 'session-finding-opportunity@2')
    AND (? IS NULL OR json_extract(payload_json, '$.content.input.cwd') = ?) ORDER BY rowid`).all(workspace, workspace);
}

function hasFindingOpportunities(storePath: string): boolean {
  const db = new DatabaseSync(storePath, { readOnly: true });
  try { return opportunityRows({ db }).length > 0; }
  finally { db.close(); }
}

export function pendingFindingReviews(store: LessonStore, cwd?: string) {
  return opportunityRows(store, cwd).flatMap(row => {
    const input = JSON.parse(String(row.payload_json)).content.input;
    const identity = { findingId: String(input.findingId), opportunityId: String(input.id), cwd: String(input.cwd) };
    try {
      const registered = findingOpportunity(store.db, input.id);
      // A review prompt would expose advice withheld by the trial. Operators can still inspect the opportunity.
      if (input.prospective) return [];
      const state = inspectFinding(store, input.findingId), entry = state.opportunities.find(item => item.id === input.id)!;
      const semantics = findingSemanticReview(store.db, input.id, registered.payload.hash);
      const status = entry.error ? 'invalid-evidence' : !entry.evidence ? 'awaiting-action'
        : !semantics ? 'needs-semantic-review' : semantics.verdict === 'disputed' ? 'disputed-semantics'
        : !entry.reviewEvidenceCurrent ? 'needs-assessment' : state.validity === 'needs-reassessment' ? 'needs-reassessment'
        : state.validity === 'needs-revision' ? 'needs-content-review'
        : state.scopeReviewFeedbackIds.some(id => state.currentFeedback.some(feedback => feedback.id === id && feedback.opportunityId === input.id))
          ? 'needs-scope-review' : entry.evidence.outcome === 'unknown' ? 'inconclusive' : null;
      return status ? [{ ...identity, status, evidenceRef: entry.evidence?.id ?? null,
        problems: entry.error ? [entry.error] : entry.evidence?.measurement.problems ?? [] }] : [];
    } catch (error) { return [{ ...identity, status: 'invalid-evidence', evidenceRef: null,
      problems: [error instanceof Error ? error.message : String(error)] }]; }
  });
}

export function emitFindingReviewQueue(storePath: string, cwd: string, sessionId: string | null, write: (text: string) => void): void {
  if (!hasFindingOpportunities(storePath)) return;
  const store = new LessonStore(storePath);
  try {
    // Retained measurements can be reviewed anywhere; acquiring missing evidence still requires its own workspace.
    const workspace = realpathSync(cwd);
    const managed = trialManagedFindings(store.db);
    const queue = pendingFindingReviews(store).filter(item => !managed.has(item.findingId) && (item.cwd === workspace || item.evidenceRef !== null))
      .sort((a, b) => Number(b.cwd === workspace) - Number(a.cwd === workspace));
    if (!queue.length) return;
    const id = `finding-review-prompt:${hashValue([sessionId, cwd, queue])}`;
    if (sessionId && store.getTrace(id)) return;
    write(`Pending finding review (${queue.length}); store: ${storePath}:\n` + queue.slice(0, 3).map(item =>
      `- ${item.findingId} / ${item.opportunityId}: ${item.status}${item.cwd === workspace ? '' : ` (retained from ${item.cwd})`}`).join('\n') +
      '\nUse lyo finding pending --all and finding inspect with this --store. Review retained evaluator semantics with finding semantics; preserve unknown when evidence is incomplete. Do not recreate a missed pre-action observation.\n');
    if (sessionId) store.recordTrace({ trace_id: id, run_id: sessionId, kind: 'behavior',
      summary: 'Pending finding review surfaced in ordinary session.', payload: { source: 'session-finding-review-prompt@1', cwd, queue } });
  } finally { store.close(); }
}
