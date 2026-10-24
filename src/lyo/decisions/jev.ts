/**
 * TypeSafe Jev adapter for typed decisions: POST /v1/systemone and GET /v1/models
 * (https://api.typesafe.ai/openapi.json, version 0.2.0). Requests send their state to
 * TypeSafe; enable it only for content that may leave this machine.
 */

import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import type { TypedDecisionProvider, TypedDecisionRecord, TypedDecisionRequest } from '../application/typed-decisions.ts';

// A versioned model, not the moving `jev-latest` alias, so retained decisions stay comparable.
export const DEFAULT_JEV_MODEL = 'jev-1.14.0';
const BASE_URL = 'https://api.typesafe.ai';
const RETRYABLE = new Set([429, 529]);

const probability = z.number().min(0).max(1);
const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('noul'), noul: probability }),
  z.object({ type: z.literal('choice'), choice: z.string(), confidence: probability, probabilities: z.record(z.string(), probability) }),
  z.object({ type: z.literal('score'), score: z.number(), confidence: probability, probabilities: z.record(z.string(), probability),
    legend: z.record(z.string(), z.unknown()) }),
]);
const responseSchema = z.object({ model: z.string().min(1), answers: z.record(z.string(), answerSchema),
  usage: z.object({ input_tokens: z.number().int().min(0), output_tokens: z.number().int().min(0) }) });
const modelsSchema = z.object({ models: z.array(z.object({ name: z.string(), description: z.string(), release_date: z.string() })) });

export class JevError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) { super(message); this.name = 'JevError'; this.status = status; }
}

export interface JevConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export function jevProvider(config: JevConfig) {
  if (!config.apiKey) throw new JevError('a TypeSafe API key is required');
  const model = config.model ?? DEFAULT_JEV_MODEL, baseUrl = config.baseUrl ?? BASE_URL;
  const fetchImpl = config.fetch ?? fetch, maxRetries = config.maxRetries ?? 3;
  const sleep = config.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));

  async function request(path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs),
          headers: { ...init.headers, Authorization: `Bearer ${config.apiKey}` } });
      } catch (error) {
        throw new JevError(`TypeSafe request failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      if (RETRYABLE.has(response.status) && attempt < maxRetries) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await sleep(Number.isFinite(retryAfter) && retryAfter >= 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new JevError(`TypeSafe returned ${response.status}: ${(await response.text()).slice(0, 500)}`, response.status);
      return response.json();
    }
  }

  const provider: TypedDecisionProvider & { models(): Promise<z.infer<typeof modelsSchema>['models']> } = {
    name: 'typesafe-jev',
    async decide(input: TypedDecisionRequest, options = {}): Promise<TypedDecisionRecord> {
      const body = { model, state: input.state, questions: input.questions };
      const parsed = responseSchema.safeParse(await request('/v1/systemone', { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, options.timeoutMs ?? 10000));
      if (!parsed.success) throw new JevError(`TypeSafe response did not match the API contract: ${parsed.error.message.slice(0, 500)}`);
      for (const [name, question] of Object.entries(input.questions)) {
        if (parsed.data.answers[name]?.type !== question.type) throw new JevError(`TypeSafe returned no ${question.type} answer for ${name}`);
      }
      return { source: 'typed-decision@1', provider: provider.name, requestedModel: model, answeredModel: parsed.data.model,
        requestHash: hashValue(body), answers: parsed.data.answers,
        usage: { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens },
        decidedAt: new Date().toISOString() };
    },
    async models() {
      const parsed = modelsSchema.safeParse(await request('/v1/models', { method: 'GET' }, 10000));
      if (!parsed.success) throw new JevError('TypeSafe model list did not match the API contract');
      return parsed.data.models;
    },
  };
  return provider;
}

/** The configured provider, or null: nothing is sent unless a key is explicitly present. */
export function typedDecisionProviderFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = env.TYPESAFE_API_KEY ?? env.JEV_API_KEY;
  return apiKey ? jevProvider({ apiKey, model: env.LYO_JEV_MODEL }) : null;
}
