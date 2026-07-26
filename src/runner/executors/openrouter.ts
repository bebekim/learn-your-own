import {
  createOpenAiCompatibleExecutor,
  type ChatFn,
  type ChatMessage,
} from './openai-compatible.ts';
import type { StageExecutor } from './stage-executor.ts';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export type OpenRouterChatFn = ChatFn;
export type OpenRouterChatMessage = ChatMessage;

export interface OpenRouterExecutorOptions {
  model: string;
  temperature?: number;
  chat?: OpenRouterChatFn;
  timeoutMs?: number;
}

/**
 * Single-shot OpenRouter executor. Reasoning output is excluded: single-shot
 * stages want file blocks, not deliberation, and a chatty model can
 * otherwise burn the whole completion budget on chain-of-thought.
 */
export function createOpenRouterExecutor({
  model,
  temperature,
  chat,
  timeoutMs,
}: OpenRouterExecutorOptions): StageExecutor {
  return createOpenAiCompatibleExecutor({
    baseUrl: OPENROUTER_URL,
    apiKeyEnv: 'OPENROUTER_API_KEY',
    model,
    temperature,
    extraBody: { reasoning: { exclude: true } },
    chat,
    timeoutMs,
  });
}
