import type { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { hashValue } from '../../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';

const text = z.string().trim().min(1).max(2000);
const basis = z.object({ rationale: text, verifierPaths: z.array(text).min(1) }).strict();
export const semanticReviewSchema = z.object({
  id: text, opportunityId: text, supersedes: text.optional(),
  reviewer: z.object({ id: text, kind: z.enum(['human', 'agent']) }).strict(),
  verdict: z.enum(['accepted', 'disputed']), claimKind: z.enum(['deterministic', 'improvement']),
  applicability: basis, adherence: basis, prediction: basis, limitations: text,
}).strict();
const receiptSchema = semanticReviewSchema.extend({ source: z.literal('session-finding-semantics@1'),
  opportunityHash: text, hash: text });

export function findingSemanticReview(db: DatabaseSync, opportunityId: string, opportunityHash: string) {
  const rows = db.prepare(`SELECT payload_json FROM learning_trace WHERE kind = 'behavior'
    AND CASE WHEN json_valid(payload_json) THEN json_extract(payload_json, '$.source') END = 'session-finding-semantics@1'
    AND json_extract(payload_json, '$.opportunityId') = ? ORDER BY rowid`).all(opportunityId);
  let current: z.infer<typeof receiptSchema> | null = null;
  for (const row of rows) {
    const receipt = receiptSchema.parse(JSON.parse(String(row.payload_json)));
    const { hash, ...content } = receipt;
    if (hash !== hashValue(content) || receipt.opportunityHash !== opportunityHash
      || receipt.supersedes !== current?.id) throw new Error('invalid finding semantic review chain');
    current = receipt;
  }
  return current;
}

/** An attributed semantic judgment, never an independent causal verifier. */
export function reviewFindingSemantics(store: LessonStore, value: unknown) {
  const input = semanticReviewSchema.parse(value);
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const opportunity = store.getTrace(`finding-opportunity:${input.opportunityId}`);
    const envelope = JSON.parse(opportunity?.payload_json ?? '{}');
    if (!['session-finding-opportunity@1', 'session-finding-opportunity@2'].includes(envelope.source) || envelope.hash !== hashValue(envelope.content)
      || envelope.content.input.id !== input.opportunityId) throw new Error('unknown or invalid finding opportunity');
    if (input.claimKind !== envelope.content.input.claim.kind) throw new Error('review must preserve the prospectively declared claim kind');
    for (const check of [input.applicability, input.adherence, input.prediction]) {
      if (!check.verifierPaths.every(path => envelope.content.verifierFiles.some((file: { path: string; content: unknown }) =>
        file.path === path && typeof file.content === 'string'))) throw new Error('semantic review must cite retained verifier files');
    }
    const content = { ...input, source: 'session-finding-semantics@1' as const, opportunityHash: envelope.hash };
    const receipt = { ...content, hash: hashValue(content) };
    const prior = store.getTrace(`finding-semantics:${input.id}`);
    if (prior) {
      if (hashValue(JSON.parse(prior.payload_json!)) !== hashValue(receipt)) throw new Error('conflicting semantic review identity');
    } else {
      const current = findingSemanticReview(store.db, input.opportunityId, envelope.hash);
      if (input.supersedes !== current?.id) throw new Error('supersedes must name the current semantic review');
      store.recordTrace({ trace_id: `finding-semantics:${input.id}`, run_id: opportunity!.run_id, kind: 'behavior',
        summary: 'Attributed review of finding evaluator semantics.', payload: receipt });
    }
    store.db.exec('COMMIT');
    return receipt;
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}
