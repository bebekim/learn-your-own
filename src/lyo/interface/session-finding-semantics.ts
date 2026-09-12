import { hashValue } from '../../contract/refs.ts';
import type { LessonStore } from '../storage/lesson-store.ts';
import { findingSemanticReview, semanticReviewSchema } from '../storage/finding-evidence.ts';

export { findingSemanticReview, semanticReviewSchema } from '../storage/finding-evidence.ts';

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
