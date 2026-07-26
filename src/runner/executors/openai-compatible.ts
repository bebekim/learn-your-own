import type { StageExecutor } from './stage-executor.ts';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatArgs {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}

export type ChatFn = (args: ChatArgs) => Promise<string>;

export interface OpenAiCompatibleExecutorOptions {
  baseUrl: string;
  apiKeyEnv: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** Vendor-specific request body additions (reasoning controls, etc). */
  extraBody?: Record<string, unknown>;
  chat?: ChatFn;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 16384;

/**
 * Single-shot executor for any OpenAI-compatible chat completions API
 * (OpenRouter, Upstage, ...). The model gets NO tools, so it cannot read
 * anything beyond what the prompt inlines — blindness is structural.
 */
export function createOpenAiCompatibleExecutor({
  baseUrl,
  apiKeyEnv,
  model,
  temperature,
  maxTokens = DEFAULT_MAX_TOKENS,
  extraBody,
  chat,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OpenAiCompatibleExecutorOptions): StageExecutor {
  const chatFn: ChatFn =
    chat ||
    ((args) =>
      postChat({ baseUrl, apiKeyEnv, maxTokens, extraBody, timeoutMs, ...args }));
  return async ({ prompt }) => ({
    transcript: await chatFn({
      model,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
}

async function postChat({
  baseUrl,
  apiKeyEnv,
  model,
  messages,
  temperature,
  maxTokens,
  extraBody,
  timeoutMs,
}: ChatArgs & {
  baseUrl: string;
  apiKeyEnv: string;
  maxTokens: number;
  extraBody?: Record<string, unknown>;
  timeoutMs: number;
}): Promise<string> {
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) {
    throw new Error(`${apiKeyEnv} is not set`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...extraBody }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      throw new Error(`${baseUrl} HTTP ${response.status}: ${body}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    };
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(
        `completion truncated (finish_reason=length, max_tokens=${maxTokens})`
      );
    }
    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('empty completion');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
