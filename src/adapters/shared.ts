import type {
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types/observation.ts';
import {
  sha256,
  summarizeText,
  writePromptBlob,
} from './runtime.ts';

export function buildSession(input: {
  sessionId: string;
  repoPath: string;
  platform: string;
  model: string | null;
}): RecordSessionStartedInput {
  return {
    sessionId: input.sessionId,
    workspaceScope: 'local',
    repoPath: input.repoPath,
    platform: input.platform,
    model: input.model,
  };
}

export function buildUserPromptBoundary(input: {
  sessionId: string;
  turnId: string | null;
  promptText: string;
  model: string | null;
  includeRawPrompt: boolean;
  promptDir?: string;
}): RecordPromptBoundaryInput {
  const promptRef = input.promptDir
    ? writePromptBlob(input.promptDir, input.turnId ?? input.sessionId, 'user', input.promptText)
    : undefined;
  return {
    sessionId: input.sessionId,
    turnId: input.turnId,
    role: 'user',
    kind: 'user_prompt',
    promptText: input.includeRawPrompt ? input.promptText : undefined,
    promptHash: input.includeRawPrompt ? undefined : sha256(input.promptText),
    promptLength: input.includeRawPrompt ? undefined : input.promptText.length,
    promptRef,
    summary: input.includeRawPrompt ? undefined : summarizeText(input.promptText),
    model: input.model,
  };
}

export function buildAssistantPromptBoundary(input: {
  sessionId: string;
  turnId: string | null;
  responseMessage: string;
  model: string | null;
}): RecordPromptBoundaryInput {
  return {
    sessionId: input.sessionId,
    turnId: input.turnId,
    role: 'assistant',
    kind: 'assistant_response',
    responseSummary: summarizeText(input.responseMessage),
    model: input.model,
  };
}
