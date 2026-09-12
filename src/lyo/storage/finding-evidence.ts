import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import { assessFindingObservation } from '../domain/finding-assessment.ts';

const captureText = z.string().min(1);
export const captureSchema = z.object({ runtime: z.enum(['codex', 'claude']), toolName: captureText,
  toolInput: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(), next: z.literal(true).optional() }).strict()
  .refine(value => (value.toolInput !== undefined) !== Boolean(value.next), 'declare an exact input or the next matching tool action');
const capturedFilesSchema = z.array(z.object({ path: captureText, content: z.string().nullable() }).strict());
const modelSchema = z.object({ source: z.literal('session-finding-model@1'), runtime: captureText, sessionId: captureText,
  model: captureText, eventName: captureText, hash: captureText }).strict();

export function findingSessionModel(db: DatabaseSync, runtime: string, sessionId: string) {
  const row = db.prepare(`SELECT trace_id, payload_json FROM learning_trace WHERE run_id = ? AND kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-model@1'
    AND json_extract(payload_json, '$.runtime') = ? ORDER BY rowid DESC LIMIT 1`).get(sessionId, runtime);
  if (!row) return null;
  const receipt = modelSchema.parse(JSON.parse(String(row.payload_json))), { hash, ...content } = receipt;
  if (hash !== hashValue(content) || content.sessionId !== sessionId) throw new Error('invalid session model observation');
  return { id: String(row.trace_id), ...receipt };
}
const boundarySchema = z.object({ source: z.literal('session-finding-action@1'), opportunityId: captureText, opportunityHash: captureText,
  eventId: captureText, runtime: captureText, sessionId: captureText, cwd: captureText, toolUseId: captureText, toolName: captureText, toolInputHash: captureText,
  eventName: captureText, sourceFiles: capturedFilesSchema, verifierFiles: capturedFilesSchema, responseHash: captureText.nullable(), hash: captureText,
  model: captureText.nullable().optional(),
  findingState: z.object({ version: captureText, validity: z.enum(['unvalidated', 'supported', 'needs-revision', 'needs-reassessment']) }).strict().optional() }).strict();
export type Registered = { content: { sessionId: string; version: string;
  input: { id: string; findingId: string; cwd: string; sourceFiles: string[]; verifierFiles: string[]; capture?: z.infer<typeof captureSchema>;
    prospective?: { model: string; automatic?: unknown } };
  sourceBefore: z.infer<typeof capturedFilesSchema>; verifierFiles: z.infer<typeof capturedFilesSchema> };
  payload: { hash: string } };

export function findingActionBoundary(db: DatabaseSync, id: string, phase: 'before' | 'after') {
  const row = db.prepare('SELECT rowid, payload_json FROM learning_trace WHERE trace_id = ?')
    .get(`finding-action:${id}:${phase}`);
  if (!row) return null;
  const receipt = boundarySchema.parse(JSON.parse(String(row.payload_json)));
  const { hash, ...content } = receipt;
  if (hash !== hashValue(content)) throw new Error('finding action integrity mismatch');
  return { ...receipt, rowid: Number(row.rowid) };
}

export function findingActionEvidence(db: DatabaseSync, registered: Registered) {
  const { input } = registered.content;
  const before = findingActionBoundary(db, input.id, 'before'), after = findingActionBoundary(db, input.id, 'after');
  const problems: string[] = [];
  const registeredRow = db.prepare('SELECT rowid FROM learning_trace WHERE trace_id = ?').get(`finding-opportunity:${input.id}`)!;
  if (!before || !after || before.rowid <= Number(registeredRow.rowid) || before.rowid >= after.rowid)
    problems.push('missing or out-of-order live action boundaries');
  for (const receipt of [before, after]) {
    if (!receipt) continue;
    if (receipt.opportunityId !== input.id || receipt.opportunityHash !== registered.payload.hash
      || receipt.runtime !== input.capture?.runtime || receipt.sessionId !== registered.content.sessionId || receipt.cwd !== input.cwd
      || receipt.toolName !== input.capture.toolName || (input.capture.toolInput !== undefined && receipt.toolInputHash !== hashValue(input.capture.toolInput)))
      problems.push('action belongs to another opportunity');
    if (hashValue(receipt.verifierFiles) !== hashValue(registered.content.verifierFiles)) problems.push('verifier changed at action boundary');
    if (input.prospective?.automatic && receipt.model !== input.prospective.model) problems.push('model changed or became unknown at action boundary');
  }
  if (before && hashValue(before.sourceFiles) !== hashValue(registered.content.sourceBefore)) problems.push('source changed before the declared action');
  if (before?.findingState) {
    if (before.findingState.version !== registered.content.version) problems.push('finding version changed before the declared action');
    if (before.findingState.validity === 'needs-revision' || before.findingState.validity === 'needs-reassessment')
      problems.push('finding was suspended before the declared action');
  }
  if (before && after && before.toolUseId !== after.toolUseId) problems.push('action call identity mismatch');
  if (after && after.eventName !== 'PostToolUse') problems.push('action did not complete normally');
  return { before, after, problems, hash: hashValue([before?.hash ?? null, after?.hash ?? null]) };
}

const text = z.string().trim().min(1).max(2000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const envelopeSchema = z.object({ source: text, content: z.record(z.string(), z.unknown()), hash }).strict();
const contextSchema = z.object({ repository: z.string().nullable(), activity: text, match: z.enum(['repository', 'activity']) }).strict();
export const inputSchema = z.object({
  capture: captureSchema.optional(),
  id: text, findingId: text, deliveryId: text.optional(), taskId: text, cwd: text,
  prospective: z.object({ sessionId: text, trialId: text, model: text, findingVersion: hash, context: contextSchema,
    automatic: z.object({ trialHash: hash, unit: text, modelRef: text, trigger: z.object({ eventName: text, toolUseId: text, inputHash: hash, responseHash: hash }).strict() }).strict().optional(),
  }).strict().optional(),
  claim: z.object({ kind: z.enum(['deterministic', 'improvement', 'unspecified']).default('unspecified'),
    conditions: text, action: text, prediction: text, falsifiedBy: text }).strict(),
  checks: z.object({ applicability: text, adherence: text, prediction: text }).strict(),
  verifierFiles: z.array(text).min(1), sourceFiles: z.array(text).min(1),
  evaluator: z.object({ id: text, version: text }).strict(), timeoutSeconds: z.number().int().min(1).max(10).default(5),
}).strict().refine(input => Boolean(input.deliveryId) !== Boolean(input.prospective),
  'supply either a prior delivery or a prospective session, never both')
  .refine(input => !input.prospective || Boolean(input.capture), 'prospective opportunities require live action capture');
const filesSchema = z.array(z.object({ path: text, content: z.string().nullable() }).strict());
const checkSchema = z.object({ command: text, exit_code: z.number().int().nullable(), stdout: z.string(), stderr: z.string(),
  satisfied: z.boolean().nullable() }).strict();
export const opportunitySchema = z.object({ input: inputSchema, version: hash, context: contextSchema, sessionId: text,
  verifierFiles: filesSchema, sourceBefore: filesSchema, applicability: checkSchema, adherenceBefore: checkSchema,
  problems: z.array(z.string()) }).strict();
export const measurementSchema = z.object({ opportunityId: text, opportunityHash: hash, sourceMeasured: filesSchema,
  adherence: checkSchema.nullable(), prediction: checkSchema.nullable(), problems: z.array(z.string()) }).strict();
export type Opportunity = z.infer<typeof opportunitySchema>;

export function findingEvidenceTrace(db: DatabaseSync, id: string) {
  const row = db.prepare('SELECT rowid, * FROM learning_trace WHERE trace_id = ?').get(id);
  if (!row || row.kind !== 'behavior') throw new Error('unknown finding evidence or opportunity');
  const parsed = envelopeSchema.safeParse(JSON.parse(String(row.payload_json)));
  if (!parsed.success) throw new Error('invalid finding evidence envelope');
  const payload = parsed.data;
  if (payload.hash !== hashValue(payload.content)) throw new Error('finding evidence integrity mismatch');
  return { row, payload };
}

export function findingOpportunity(db: DatabaseSync, id: string) {
  const entry = findingEvidenceTrace(db, `finding-opportunity:${id}`);
  const content = opportunitySchema.parse(entry.payload.content);
  if (content.input.id !== id || entry.row.run_id !== content.sessionId) throw new Error('finding opportunity identity mismatch');
  if (content.input.prospective) {
    const prospective = content.input.prospective;
    if (entry.payload.source !== 'session-finding-opportunity@2' || content.sessionId !== prospective.sessionId
      || content.version !== prospective.findingVersion || hashValue(content.context) !== hashValue(prospective.context))
      throw new Error('prospective finding opportunity identity mismatch');
    return { ...entry, content };
  }
  if (entry.payload.source !== 'session-finding-opportunity@1') throw new Error('wrong finding opportunity type');
  const delivery = db.prepare('SELECT rowid, * FROM learning_trace WHERE trace_id = ?').get(content.input.deliveryId!);
  const snapshot = delivery && JSON.parse(String(delivery.payload_json)).findings?.find((f: { id: string }) => f.id === content.input.findingId);
  if (delivery?.kind !== 'protocol_application' || delivery.run_id !== content.sessionId || !snapshot
    || snapshot.version !== content.version || snapshot.intervention !== content.input.claim.action || hashValue(snapshot.context) !== hashValue(content.context)
    || Number(delivery.rowid) >= Number(entry.row.rowid)) throw new Error('finding opportunity does not match prior delivery');
  return { ...entry, content };
}


const assignmentSchema = z.object({ source: z.literal('session-finding-assignment@1'),
  opportunityId: z.string(), opportunityHash: z.string(), action: z.enum(['advice', 'no-advice']),
  probability: z.union([z.literal(0.5), z.literal(1)]), policyRef: z.string().optional(), hash: z.string() }).strict()
  .refine(value => value.probability === 0.5 || Boolean(value.policyRef), 'deterministic allocation requires a retained policy');

export function findingAssignment(db: DatabaseSync, id: string) {
  const row = db.prepare('SELECT rowid, payload_json FROM learning_trace WHERE trace_id = ?').get(`finding-assignment:${id}`);
  if (!row) return null;
  const receipt = assignmentSchema.parse(JSON.parse(String(row.payload_json)));
  const { hash, ...content } = receipt;
  const opportunity = findingOpportunity(db, id);
  if (!opportunity.content.input.prospective || receipt.opportunityId !== id || hash !== hashValue(content)
    || receipt.opportunityHash !== opportunity.payload.hash || Number(row.rowid) <= Number(opportunity.row.rowid))
    throw new Error('invalid prospective assignment');
  return receipt;
}

export function findingOpportunityDelivery(db: DatabaseSync, id: string): string | undefined {
  const traceId = `finding-delivery:${id}`;
  const row = db.prepare('SELECT rowid, kind, run_id, payload_json FROM learning_trace WHERE trace_id = ?').get(traceId);
  if (!row) return undefined;
  const opportunity = findingOpportunity(db, id), assignment = findingAssignment(db, id);
  const payload = JSON.parse(String(row.payload_json)), finding = payload.findings?.[0];
  if (row.kind !== 'protocol_application' || row.run_id !== opportunity.content.sessionId || assignment?.action !== 'advice'
    || payload.opportunityHash !== opportunity.payload.hash || finding?.id !== opportunity.content.input.findingId
    || finding.version !== opportunity.content.version || finding.intervention !== opportunity.content.input.claim.action
    || hashValue(finding.context) !== hashValue(opportunity.content.context)) throw new Error('invalid prospective delivery');
  return traceId;
}

const basis = z.object({ rationale: text, verifierPaths: z.array(text).min(1) }).strict();
export const semanticReviewSchema = z.object({
  id: text, opportunityId: text, supersedes: text.optional(),
  reviewer: z.object({ id: text, kind: z.enum(['human', 'agent']) }).strict(),
  verdict: z.enum(['accepted', 'disputed']), claimKind: z.enum(['deterministic', 'improvement']),
  applicability: basis, adherence: basis, prediction: basis, limitations: text,
}).strict();
const semanticReceiptSchema = semanticReviewSchema.extend({ source: z.literal('session-finding-semantics@1'),
  opportunityHash: text, hash: text });

export function findingSemanticReview(db: DatabaseSync, opportunityId: string, opportunityHash: string) {
  const rows = db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-semantics@1'
    AND json_extract(payload_json, '$.opportunityId') = ? ORDER BY rowid`).all(opportunityId);
  let current: z.infer<typeof semanticReceiptSchema> | null = null;
  for (const row of rows) {
    const receipt = semanticReceiptSchema.parse(JSON.parse(String(row.payload_json)));
    const { hash, ...content } = receipt;
    if (hash !== hashValue(content) || receipt.opportunityHash !== opportunityHash
      || receipt.supersedes !== current?.id) throw new Error('invalid finding semantic review chain');
    current = receipt;
  }
  return current;
}

export function resolveFindingEvidence(db: DatabaseSync, id: string) {
  const entry = findingEvidenceTrace(db, id);
  if (entry.payload.source !== 'session-finding-evidence@1') throw new Error('not registered finding evidence');
  const measurement = measurementSchema.parse(entry.payload.content);
  const registered = findingOpportunity(db, measurement.opportunityId);
  const { content } = registered;
  if (id !== `finding-evidence:${measurement.opportunityId}` || measurement.opportunityHash !== registered.payload.hash
    || entry.row.run_id !== content.sessionId || Number(entry.row.rowid) <= Number(registered.row.rowid)) throw new Error('finding evidence binding mismatch');
  const withdrawalId = `finding-evidence-withdrawal:${id}`;
  const withdrawal = db.prepare('SELECT 1 FROM learning_trace WHERE trace_id = ?').get(withdrawalId) ? findingEvidenceTrace(db, withdrawalId) : null;
  if (withdrawal && (withdrawal.payload.source !== 'session-finding-evidence-withdrawal@1'
    || withdrawal.payload.content.evidenceRef !== id || withdrawal.payload.content.evidenceHash !== entry.payload.hash))
    throw new Error('finding evidence withdrawal binding mismatch');
  const action = content.input.capture ? findingActionEvidence(db, registered) : null;
  const semantics = findingSemanticReview(db, content.input.id, registered.payload.hash);
  const deliveryId = content.input.deliveryId ?? findingOpportunityDelivery(db, content.input.id);
  const { incrementalBenefit, ...assessment } = assessFindingObservation({ withdrawn: Boolean(withdrawal),
    claimKind: content.input.claim.kind, semantics, action, registration: content, measurement, deliveryId });
  return { id, hash: hashValue([entry.payload.hash, semantics?.hash ?? null, withdrawal?.payload.hash ?? null, action?.hash ?? null]),
    withdrawn: Boolean(withdrawal), opportunityId: content.input.id, opportunity: content, measurement, semantics, action,
    observationId: action?.after ? hashValue([action.after.runtime, action.after.sessionId, action.after.toolUseId]) : content.input.id,
    incrementalBenefit,
    deliveryId, assignment: content.input.prospective ? findingAssignment(db, content.input.id) : null,
    ...assessment };
}

export function inspectFindingOpportunities(db: DatabaseSync, findingId: string) {
  return db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END IN ('session-finding-opportunity@1', 'session-finding-opportunity@2')
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
