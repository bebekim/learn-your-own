/**
 * OpenRouter HTTP client for the LLM judge. Extracted from trace-consumer.ts
 * so the consumer stays pure orchestration — the network layer is swappable.
 */

import { buildJudgePrompt, parseJudgeResponse } from '../application/judgment.ts';
import type { JudgeFn } from '../application/judgment.ts';
import { loadTuning } from '../config/tuning.ts';

const DEFAULT_JUDGE_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export { DEFAULT_JUDGE_MODEL, OPENROUTER_URL };

export function createDefaultJudge(model?: string): JudgeFn {
  return async (input) => {
    const resolvedModel =
      model || process.env.OPENROUTER_LYO_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
    const { messages } = buildJudgePrompt(input);
    const result = await openRouterChat({ model: resolvedModel, messages });
    return { ...parseJudgeResponse(result.content), usage: result.usage };
  };
}

export async function openRouterChat({
  model,
  messages,
}: {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}): Promise<{ content: string; usage?: { totalTokens: number; cost?: number } }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), loadTuning().lab.judgeMs);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature: 0 }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      throw new Error(`OpenRouter HTTP ${response.status}: ${body}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { total_tokens?: number; cost?: number };
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('OpenRouter: empty completion');
    }
    return {
      content,
      usage: typeof data.usage?.total_tokens === 'number'
        ? { totalTokens: data.usage.total_tokens, cost: data.usage.cost } : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}
