export interface StageExecutionInput {
  prompt: string;
  sandboxDir: string;
}

export interface StageUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** USD when the provider reports it (OpenRouter); absent otherwise. */
  cost?: number;
}

export interface StageExecutionResult {
  transcript: string;
  usage?: StageUsage;
}

/**
 * A stage executor runs one stateless stage: it receives the compiled prompt
 * and a sandbox directory containing only the stage's declared reads, and
 * returns a transcript. Writer outputs either appear inside the sandbox
 * (agentic executors like kimi-cli) or inside the transcript as path-tagged
 * file blocks (single-shot executors like openrouter).
 */
export type StageExecutor = (input: StageExecutionInput) => Promise<StageExecutionResult>;
