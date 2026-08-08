/**
 * OpenRouter HTTP client for the LLM judge. Extracted from trace-consumer.ts
 * so the consumer stays pure orchestration — the network layer is swappable.
 */

import { buildJudgePrompt, parseJudgeResponse } from './trace-consumer.ts';
import type { JudgeFn } from './trace-consumer.ts';

const DEFAULT_JUDGE_MODEL = 'openai/gpt-4o-mini';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const JUDGE_TIMEOUT_MS = 180000;

export { DEFAULT_JUDGE_MODEL, OPENROUTER_URL };

export function createDefaultJudge(model?: string): JudgeFn {
  return async (input) => {
    const resolvedModel =
      model || process.env.OPENROUTER_LYO_JUDGE_MODEL || DEFAULT_JUDGE_MODEL;
    const { messages } = buildJudgePrompt(input);
    const content = await openRouterChat({ model: resolvedModel, messages });
    return parseJudgeResponse(content);
  };
}

export async function openRouterChat({
  model,
  messages,
}: {
  model: string;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
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
    };
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('OpenRouter: empty completion');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
