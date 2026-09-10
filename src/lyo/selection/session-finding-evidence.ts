import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import { runLocalEpisode } from '../../eval/live-runner.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingSemanticReview } from './session-finding-semantics.ts';
import { findingFiles as files } from './session-finding-files.ts';
import { captureSchema, findingActionEvidence } from './session-finding-capture.ts';
import { findingState } from './session-findings.ts';

const text = z.string().trim().min(1).max(2000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const envelopeSchema = z.object({ source: text, content: z.record(z.string(), z.unknown()), hash }).strict();
const contextSchema = z.object({ repository: z.string().nullable(), activity: text, match: z.enum(['repository', 'activity']) }).strict();
const inputSchema = z.object({
  capture: captureSchema.optional(),
  id: text, findingId: text, deliveryId: text, taskId: text, cwd: text,
  claim: z.object({ kind: z.enum(['deterministic', 'improvement', 'unspecified']).default('unspecified'),
    conditions: text, action: text, prediction: text, falsifiedBy: text }).strict(),
  checks: z.object({ applicability: text, adherence: text, prediction: text }).strict(),
  verifierFiles: z.array(text).min(1), sourceFiles: z.array(text).min(1),
  evaluator: z.object({ id: text, version: text }).strict(), timeoutSeconds: z.number().int().min(1).max(10).default(5),
}).strict();
const filesSchema = z.array(z.object({ path: text, content: z.string().nullable() }).strict());
const checkSchema = z.object({ command: text, exit_code: z.number().int().nullable(), stdout: z.string(), stderr: z.string(),
  satisfied: z.boolean().nullable() }).strict();
const opportunitySchema = z.object({ input: inputSchema, version: hash, context: contextSchema, sessionId: text,
  verifierFiles: filesSchema, sourceBefore: filesSchema, applicability: checkSchema, adherenceBefore: checkSchema,
  problems: z.array(z.string()) }).strict();
const measurementSchema = z.object({ opportunityId: text, opportunityHash: hash, sourceMeasured: filesSchema,
  adherence: checkSchema.nullable(), prediction: checkSchema.nullable(), problems: z.array(z.string()) }).strict();
export type Opportunity = z.infer<typeof opportunitySchema>;

function trace(db: DatabaseSync, id: string) {
  const row = db.prepare('SELECT rowid, * FROM learning_trace WHERE trace_id = ?').get(id);
  if (!row || row.kind !== 'behavior') throw new Error('unknown finding evidence or opportunity');
  const parsed = envelopeSchema.safeParse(JSON.parse(String(row.payload_json)));
  if (!parsed.success) throw new Error('invalid finding evidence envelope');
  const payload = parsed.data;
  if (payload.hash !== hashValue(payload.content)) throw new Error('finding evidence integrity mismatch');
  return { row, payload };
}

export function findingOpportunity(db: DatabaseSync, id: string) {
  const entry = trace(db, `finding-opportunity:${id}`);
  if (entry.payload.source !== 'session-finding-opportunity@1') throw new Error('wrong finding opportunity type');
  const content = opportunitySchema.parse(entry.payload.content);
  if (content.input.id !== id || entry.row.run_id !== content.sessionId) throw new Error('finding opportunity identity mismatch');
  const delivery = db.prepare('SELECT rowid, * FROM learning_trace WHERE trace_id = ?').get(content.input.deliveryId);
  const snapshot = delivery && JSON.parse(String(delivery.payload_json)).findings?.find((f: { id: string }) => f.id === content.input.findingId);
  if (delivery?.kind !== 'protocol_application' || delivery.run_id !== content.sessionId || !snapshot
    || snapshot.version !== content.version || snapshot.intervention !== content.input.claim.action || hashValue(snapshot.context) !== hashValue(content.context)
    || Number(delivery.rowid) >= Number(entry.row.rowid)) throw new Error('finding opportunity does not match prior delivery');
  return { ...entry, content };
}


function check(input: Opportunity['input'], command: string) {
  const result = runLocalEpisode({ cwd: input.cwd, baselineId: 'B0', model: 'none', harness: 'finding-evidence@1', task: {
    task_id: input.taskId, split: 'train', repo_ref: { kind: 'declared-files', ref: input.id }, prompt: input.claim.prediction,
    allowed_tools: ['shell'], expected_touched_paths: [], tags: [],
    budget: { max_tokens: 1, max_turns: 1, max_wall_time_seconds: input.capture ? Math.min(input.timeoutSeconds, 1) : input.timeoutSeconds }, success_check: { kind: 'command', command },
  } });
  let satisfied: boolean | null = null;
  // A failed command is a broken evaluator, not a counterexample to the advice.
  if (result.verifier_evidence.exit_code === 0) {
    try { satisfied = z.object({ satisfied: z.boolean().nullable() }).strict().parse(JSON.parse(result.verifier_evidence.stdout)).satisfied; }
    catch { /* Malformed or incomplete evaluator output remains unknown. */ }
  }
  const { kind: _kind, ...evidence } = result.verifier_evidence;
  return { ...evidence, satisfied };
}

function retain(store: LessonStore, id: string, sessionId: string, source: string, content: unknown) {
  store.recordTrace({ trace_id: id, run_id: sessionId, kind: 'behavior', summary: 'Registered finding check evidence.',
    payload: { source, content, hash: hashValue(content) } });
}

export function registerFindingOpportunity(store: LessonStore, value: unknown) {
  const input = inputSchema.parse(value);
  input.cwd = realpathSync(input.cwd);
  input.verifierFiles = [...new Set(input.verifierFiles.map(path => resolve(input.cwd, path)))];
  input.sourceFiles = [...new Set(input.sourceFiles.map(path => resolve(input.cwd, path)))];
  store.db.exec('BEGIN IMMEDIATE');
  try {
    if (store.getTrace(`finding-opportunity:${input.id}`)) {
      const prior = findingOpportunity(store.db, input.id);
      if (hashValue(prior.content.input) !== hashValue(input)) throw new Error('conflicting finding opportunity identity');
      store.db.exec('COMMIT');
      return prior.content;
    }
    const delivery = store.getTrace(input.deliveryId);
    const payload = JSON.parse(delivery?.payload_json ?? '{}');
    const finding = payload.findings?.find((f: { id: string }) => f.id === input.findingId);
    if (delivery?.kind !== 'protocol_application' || !delivery.run_id || !finding?.version || !finding.context
      || !payload.cwd || realpathSync(payload.cwd) !== input.cwd) throw new Error('opportunity requires this finding delivery in the same workspace');
    const current = findingState(store.db, input.findingId);
    if (current.validity === 'needs-revision' || current.validity === 'needs-reassessment')
      throw new Error('finding is suspended; review current evidence before starting another application');
    if (current.version !== finding.version) throw new Error('application requires a delivery of the current finding version');
    if (input.claim.action !== finding.intervention) throw new Error('registered action must match the delivered advice');
    const verifierFiles = files(input.verifierFiles), sourceBefore = files(input.sourceFiles);
    if (verifierFiles.some(file => file.content === null)) throw new Error('registered verifier file is missing');
    const applicability = check(input, input.checks.applicability), adherenceBefore = check(input, input.checks.adherence);
    const problems = hashValue([verifierFiles, sourceBefore]) === hashValue([files(input.verifierFiles), files(input.sourceFiles)])
      ? [] : ['source or verifier changed during registration checks'];
    const content = opportunitySchema.parse({ input, version: finding.version, context: finding.context, sessionId: delivery.run_id,
      verifierFiles, sourceBefore, applicability, adherenceBefore, problems });
    retain(store, `finding-opportunity:${input.id}`, delivery.run_id, 'session-finding-opportunity@1', content);
    store.db.exec('COMMIT');
    return content;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function measureFindingOpportunity(store: LessonStore, id: string) {
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const registered = findingOpportunity(store.db, id);
    const evidenceId = `finding-evidence:${id}`;
    if (!store.getTrace(evidenceId)) {
      const { input } = registered.content;
      const sourceMeasured = files(input.sourceFiles), problems = [...registered.content.problems];
      const action = input.capture ? findingActionEvidence(store.db, registered) : null;
      if (action) {
        problems.push(...action.problems);
        if (hashValue(action.after?.sourceFiles) !== hashValue(sourceMeasured)) problems.push('source changed since the captured action');
      }
      if (hashValue(files(input.verifierFiles)) !== hashValue(registered.content.verifierFiles)) problems.push('registered verifier changed or disappeared');
      const adherence = problems.length ? null : check(input, input.checks.adherence);
      const prediction = problems.length ? null : check(input, input.checks.prediction);
      if (hashValue(files(input.verifierFiles)) !== hashValue(registered.content.verifierFiles)
        || hashValue(files(input.sourceFiles)) !== hashValue(sourceMeasured)) problems.push('source or verifier changed during measurement');
      const content = measurementSchema.parse({ opportunityId: id, opportunityHash: registered.payload.hash,
        sourceMeasured, adherence, prediction, problems });
      retain(store, evidenceId, registered.content.sessionId, 'session-finding-evidence@1', content);
    }
    const result = resolveFindingEvidence(store.db, evidenceId);
    store.db.exec('COMMIT');
    return result;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function resolveFindingEvidence(db: DatabaseSync, id: string) {
  const entry = trace(db, id);
  if (entry.payload.source !== 'session-finding-evidence@1') throw new Error('not registered finding evidence');
  const measurement = measurementSchema.parse(entry.payload.content);
  const registered = findingOpportunity(db, measurement.opportunityId);
  const { content } = registered;
  if (id !== `finding-evidence:${measurement.opportunityId}` || measurement.opportunityHash !== registered.payload.hash
    || entry.row.run_id !== content.sessionId || Number(entry.row.rowid) <= Number(registered.row.rowid)) throw new Error('finding evidence binding mismatch');
  const withdrawalId = `finding-evidence-withdrawal:${id}`;
  const withdrawal = db.prepare('SELECT 1 FROM learning_trace WHERE trace_id = ?').get(withdrawalId) ? trace(db, withdrawalId) : null;
  if (withdrawal && (withdrawal.payload.source !== 'session-finding-evidence-withdrawal@1'
    || withdrawal.payload.content.evidenceRef !== id || withdrawal.payload.content.evidenceHash !== entry.payload.hash))
    throw new Error('finding evidence withdrawal binding mismatch');
  const action = content.input.capture ? findingActionEvidence(db, registered) : null;
  const semantics = findingSemanticReview(db, content.input.id, registered.payload.hash);
  const usable = !withdrawal && semantics?.verdict === 'accepted' && semantics.claimKind === content.input.claim.kind
    && !action?.problems.length && !measurement.problems.length && !content.problems.length;
  const applicable = usable ? content.applicability.satisfied : null;
  const followed = usable && content.adherenceBefore.satisfied === false ? measurement.adherence?.satisfied ?? null : null;
  const predicted = applicable === true && followed === true && semantics?.claimKind === 'deterministic'
    ? measurement.prediction?.satisfied ?? null : null;
  return { id, hash: hashValue([entry.payload.hash, semantics?.hash ?? null, withdrawal?.payload.hash ?? null, action?.hash ?? null]),
    withdrawn: Boolean(withdrawal), opportunityId: content.input.id, opportunity: content, measurement, semantics, action,
    observationId: action?.after ? hashValue([action.after.runtime, action.after.sessionId, action.after.toolUseId]) : content.input.id,
    incrementalBenefit: 'unknown' as const,
    applicability: applicable === null ? 'unknown' : applicable ? 'applicable' : 'inapplicable',
    adherence: followed === null ? 'unknown' : followed ? 'followed' : 'not-followed',
    outcome: predicted === null ? 'unknown' : predicted ? 'supported' : 'contradicted' };
}

export function withdrawFindingEvidence(store: LessonStore, value: unknown) {
  const input = z.object({ evidenceRef: text, author: text, rationale: text }).strict().parse(value);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const evidence = resolveFindingEvidence(store.db, input.evidenceRef);
    const id = `finding-evidence-withdrawal:${input.evidenceRef}`;
    const content = { ...input, evidenceHash: trace(store.db, input.evidenceRef).payload.hash };
    if (store.getTrace(id)) {
      if (hashValue(content) !== trace(store.db, id).payload.hash) throw new Error('conflicting finding evidence withdrawal');
    } else retain(store, id, evidence.opportunity.sessionId, 'session-finding-evidence-withdrawal@1', content);
    store.db.exec('COMMIT');
    return { id, ...content };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function inspectFindingOpportunities(db: DatabaseSync, findingId: string) {
  return db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-opportunity@1'
    AND json_extract(payload_json, '$.content.input.findingId') = ? ORDER BY rowid`).all(findingId).map(row => {
    const id = JSON.parse(String(row.payload_json)).content.input.id as string;
    try {
      const receipt = findingOpportunity(db, id), registered = receipt.content;
      const semantics = findingSemanticReview(db, id, receipt.payload.hash);
      const evidenceId = `finding-evidence:${id}`;
      const evidence = db.prepare('SELECT 1 FROM learning_trace WHERE trace_id = ?').get(evidenceId) ? resolveFindingEvidence(db, evidenceId) : null;
      return { id, registered, evidence, semantics, error: null };
    } catch (error) { return { id, registered: null, evidence: null, semantics: null, error: error instanceof Error ? error.message : String(error) }; }
  });
}
