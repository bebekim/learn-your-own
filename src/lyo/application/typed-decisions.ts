import type { TypedAnswer, TypedQuestion } from '../domain/typed-decision.ts';

export interface TypedDecisionRequest {
  /** The content every question refers to. Sending it to a hosted provider discloses it. */
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, TypedQuestion>;
}

/** What one provider call observed: the model that actually answered, its answers and its usage. */
export interface TypedDecisionRecord {
  source: 'typed-decision@1';
  provider: string;
  requestedModel: string;
  answeredModel: string;
  requestHash: string;
  answers: Record<string, TypedAnswer>;
  usage: { inputTokens: number; outputTokens: number } | null;
  decidedAt: string;
}

/** One interface for typed decisions; a failed call throws and callers treat the decision as unknown. */
export interface TypedDecisionProvider {
  readonly name: string;
  decide(request: TypedDecisionRequest, options?: { timeoutMs?: number }): Promise<TypedDecisionRecord>;
}
