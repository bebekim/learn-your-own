import type {
  RecordPromptBoundaryInput,
  RecordSessionStartedInput,
} from '../types/observation.ts';
import {
  sha256,
  summarizeText,
  writePromptBlob,
} from './runtime.ts';

const DEBUGGING_PATTERN = /\b(error|fail\w*|crash\w*|broken|bug|exception|traceback|stack\s?trace|not\s+working)\b/i;
const CORRECTION_PATTERN = /\b(no,?\s+i\s+meant|that'?s\s+wrong|not\s+what\s+i\s+asked|incorrect|you\s+misunderstood)\b/i;
const REFACTORING_PATTERN = /\b(refactor|rename|extract|move|reorganize|restructure|clean\s?up)\b/i;
const QUESTION_PATTERN = /^(what|why|how|where|when|which|can\s+you\s+explain|explain)\b/i;

export function classifyPromptKind(text: string): string {
  if (!text || text.trim() === '') return 'follow_up';
  if (DEBUGGING_PATTERN.test(text)) return 'debugging_request';
  if (CORRECTION_PATTERN.test(text)) return 'correction';
  if (REFACTORING_PATTERN.test(text)) return 'refactoring_request';
  if (QUESTION_PATTERN.test(text.trim())) return 'question';
  return 'follow_up';
}

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
    kind: classifyPromptKind(input.promptText),
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
