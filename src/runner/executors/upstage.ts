import { createOpenAiCompatibleExecutor, type ChatFn } from './openai-compatible.ts';
import type { StageExecutor } from './stage-executor.ts';

export const UPSTAGE_URL = 'https://api.upstage.ai/v1/chat/completions';

export interface UpstageExecutorOptions {
  model: string;
  temperature?: number;
  /** Upstage reasoning_effort: minimal|low|medium|high. Default low. */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high';
  chat?: ChatFn;
  timeoutMs?: number;
}

/**
 * Single-shot executor for Upstage's own API (Solar models). Uses
 * UPSTAGE_API_KEY and native model names (e.g. solar-pro3). Reasoning
 * effort defaults to low: file blocks, not deliberation.
 */
export function createUpstageExecutor({
  model,
  temperature,
  reasoningEffort = 'low',
  chat,
  timeoutMs,
}: UpstageExecutorOptions): StageExecutor {
  return createOpenAiCompatibleExecutor({
    baseUrl: UPSTAGE_URL,
    apiKeyEnv: 'UPSTAGE_API_KEY',
    model,
    temperature,
    extraBody: { reasoning_effort: reasoningEffort },
    chat,
    timeoutMs,
  });
}
