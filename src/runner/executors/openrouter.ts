import type { StageExecutor } from './stage-executor.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_TOKENS = 16384;

export interface OpenRouterChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface OpenRouterChatArgs {
  model: string;
  messages: OpenRouterChatMessage[];
  temperature?: number;
}

export type OpenRouterChatFn = (args: OpenRouterChatArgs) => Promise<string>;

export interface OpenRouterExecutorOptions {
  model: string;
  temperature?: number;
  chat?: OpenRouterChatFn;
  timeoutMs?: number;
}

/**
 * Single-shot executor: the whole compiled prompt goes out as one user
 * message. The model gets NO tools, so it cannot read anything beyond what
 * the prompt inlines — blindness is structural. Files come back as
 * path-tagged fenced blocks in the transcript.
 */
export function createOpenRouterExecutor({
  model,
  temperature,
  chat,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: OpenRouterExecutorOptions): StageExecutor {
  const chatFn: OpenRouterChatFn =
    chat || ((args) => openRouterChat({ ...args, timeoutMs }));
  return async ({ prompt }) => ({
    transcript: await chatFn({
      model,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
}

async function openRouterChat({
  model,
  messages,
  temperature,
  timeoutMs,
}: OpenRouterChatArgs & { timeoutMs: number }): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Single-shot stages want file blocks, not deliberation: exclude
      // reasoning output and give the completion a real budget so a chatty
      // model cannot burn the whole response on chain-of-thought.
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: DEFAULT_MAX_TOKENS,
        reasoning: { exclude: true },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text()).slice(0, 200);
      throw new Error(`OpenRouter HTTP ${response.status}: ${body}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
    };
    const choice = data?.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(
        `OpenRouter: completion truncated (finish_reason=length, max_tokens=${DEFAULT_MAX_TOKENS})`
      );
    }
    const content = choice?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') {
      throw new Error('OpenRouter: empty completion');
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}
