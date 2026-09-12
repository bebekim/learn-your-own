import { z } from 'zod';

export function findingReviewStatus(input: {
  error: string | null; hasEvidence: boolean; semanticVerdict: 'accepted' | 'disputed' | null;
  reviewCurrent: boolean; validity: string; scopeReview: boolean; outcome: string | undefined;
}) {
  return input.error ? 'invalid-evidence' : !input.hasEvidence ? 'awaiting-action'
    : !input.semanticVerdict ? 'needs-semantic-review' : input.semanticVerdict === 'disputed' ? 'disputed-semantics'
    : !input.reviewCurrent ? 'needs-assessment' : input.validity === 'needs-reassessment' ? 'needs-reassessment'
    : input.validity === 'needs-revision' ? 'needs-content-review'
    : input.scopeReview ? 'needs-scope-review' : input.outcome === 'unknown' ? 'inconclusive' : null;
}

const text = z.string().trim().min(1).max(500);
export const contextSchema = z.object({ repository: z.string().nullable(), activity: text,
  match: z.enum(['repository', 'activity']) }).strict();
const feedbackSchema = z.object({
  id: text, findingId: text, deliveryId: text, supersedes: text.optional(),
  applicability: z.enum(['applicable', 'inapplicable', 'unknown']),
  adherence: z.enum(['followed', 'not-followed', 'unknown']),
  outcome: z.enum(['supported', 'contradicted', 'unknown']),
  verifier: text, evidenceRef: text, rationale: text,
}).strict();
export const receiptSchema = feedbackSchema.extend({ source: z.enum(['session-finding-feedback@1', 'session-finding-feedback@2']),
  version: text, context: contextSchema, opportunityId: text.optional(), observationId: text.optional(), evidenceHash: text.optional() });
const revisionSchema = z.object({ id: text, findingId: text, previousVersion: text,
  intervention: z.string().trim().min(1).max(220), feedbackIds: z.array(text).min(1), author: text, rationale: text }).strict();
export const revisionReceiptSchema = revisionSchema.extend({ source: z.literal('session-finding-revision@1'), version: text,
  scopeFeedbackIds: z.array(text).default([]) });
export type Feedback = z.infer<typeof receiptSchema>;

export interface AssessmentEvidence {
  id: string; hash: string; withdrawn: boolean; opportunityId: string; observationId: string; deliveryId?: string;
  opportunity: { version: string; context: z.infer<typeof contextSchema>;
    input: { findingId: string; evaluator: { id: string; version: string } } };
  applicability: Feedback['applicability']; adherence: Feedback['adherence']; outcome: Feedback['outcome'];
}
export interface FindingAssessmentPort {
  hash(value: unknown): string;
  evidence(ref: string): AssessmentEvidence;
  state(id: string): { version: string; finding: { intervention: string };
    latestFeedback: Array<{ receipt: Feedback; current: boolean }>; currentFeedback: Feedback[] };
  delivery(id: string): { kind: string; sessionId: string | null;
    findings?: Array<{ id: string; version?: string; context?: z.infer<typeof contextSchema> }> } | null;
  prior(kind: 'feedback' | 'revision', id: string): { value: unknown } | null;
  transaction<T>(work: () => T): T;
  append(receipt: Feedback | z.infer<typeof revisionReceiptSchema>, sessionId?: string | null): void;
}

export function assessmentInput(hash: FindingAssessmentPort['hash'], evidence: AssessmentEvidence, previous?: Feedback) {
  if (!evidence.deliveryId) return null;
  return {
    id: `review-${hash([evidence.opportunityId, previous?.id ?? null, evidence.hash]).slice(0, 20)}`,
    findingId: evidence.opportunity.input.findingId, deliveryId: evidence.deliveryId,
    ...(previous ? { supersedes: previous.id } : {}),
    applicability: evidence.applicability, adherence: evidence.adherence, outcome: evidence.outcome,
    verifier: `${evidence.opportunity.input.evaluator.id}@${evidence.opportunity.input.evaluator.version}`,
    evidenceRef: evidence.id, rationale: '',
  };
}

/** Record the current checked assessment; callers supply evidence identity, not a verdict. */
export function assessFindingEvidence(port: FindingAssessmentPort, evidenceRef: string): Feedback | null {
  const evidence = port.evidence(evidenceRef);
  const findingId = evidence.opportunity.input.findingId;
  const state = port.state(findingId);
  const previous = state.latestFeedback.find(row => row.receipt.opportunityId === evidence.opportunityId);
  if (previous?.current) return null;
  const input = assessmentInput(port.hash, evidence, previous?.receipt);
  return input ? recordFindingFeedback(port, { ...input,
    rationale: 'Automatic assessment of retained registered checks and live action boundaries; semantic judgment is attributed separately. Incremental benefit remains unknown.',
  }) : null;
}

export function recordFindingFeedback(port: FindingAssessmentPort, value: unknown): Feedback {
  const input = feedbackSchema.parse(value);
  if (input.outcome !== 'unknown' && (input.applicability !== 'applicable' || input.adherence !== 'followed'))
    throw new Error('a validity judgment requires evidence that the finding was applicable and followed');
  const delivery = port.delivery(input.deliveryId);
  if (!delivery || delivery.kind !== 'protocol_application') throw new Error('unknown finding delivery');
  const finding = delivery.findings?.find(row => row.id === input.findingId);
  if (!finding?.version || !finding.context) throw new Error('delivery lacks this finding with versioned context');
  return port.transaction(() => {
    const evidence = port.evidence(input.evidenceRef);
    if (evidence.deliveryId !== input.deliveryId || evidence.opportunity.input.findingId !== input.findingId
      || evidence.opportunity.version !== finding.version) throw new Error('finding evidence belongs to another delivery or version');
    if (input.applicability !== evidence.applicability || input.adherence !== evidence.adherence || input.outcome !== evidence.outcome)
      throw new Error('review judgments must match registered finding evidence');
    const receipt = receiptSchema.parse({ ...input, source: 'session-finding-feedback@2',
      version: finding.version, context: finding.context, opportunityId: evidence.opportunityId, observationId: evidence.observationId, evidenceHash: evidence.hash });
    const prior = port.prior('feedback', input.id);
    if (prior) {
      if (port.hash(prior.value) !== port.hash(receipt)) throw new Error('conflicting feedback identity');
    } else {
      const reviewed = port.state(input.findingId).latestFeedback.find(({ receipt: row }) => row.opportunityId === evidence.opportunityId
        || (row.source === 'session-finding-feedback@1' && row.deliveryId === input.deliveryId))?.receipt;
      if (input.supersedes && input.supersedes !== reviewed?.id) throw new Error('supersedes must name the current review of this delivery');
      if (reviewed && !input.supersedes) throw new Error('delivery already reviewed; use supersedes to correct its evidence');
      port.append(receipt, delivery.sessionId);
    }
    return receipt;
  });
}

export function reviseFinding(port: FindingAssessmentPort, value: unknown) {
  const input = revisionSchema.parse(value);
  let receipt: z.infer<typeof revisionReceiptSchema>;
  return port.transaction(() => {
    const prior = port.prior('revision', input.id);
    if (prior) {
      receipt = revisionReceiptSchema.parse(prior.value);
      const { source: _source, version: _version, scopeFeedbackIds: _scope, ...priorInput } = receipt;
      if (port.hash(priorInput) !== port.hash(input)) throw new Error('conflicting revision identity');
    } else {
      const state = port.state(input.findingId);
      if (input.previousVersion !== state.version) throw new Error('stale finding version');
      if (input.intervention === state.finding.intervention) throw new Error('revision must change the advice');
      if (!input.feedbackIds.every(id => state.currentFeedback.some(row => row.id === id && row.version === state.version && row.outcome === 'contradicted')))
        throw new Error('revision requires checked contradiction on the current finding version');
      const snapshot = { ...input, scopeFeedbackIds: [] };
      receipt = { ...snapshot, source: 'session-finding-revision@1', version: port.hash(snapshot) };
      port.append(receipt);
    }
    return receipt;
  });
}
