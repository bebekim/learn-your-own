import type { PromptKind } from '../types/observation.ts';

const DEBUGGING_PATTERN = /\b(error|fail\w*|crash\w*|broken|bug|exception|traceback|stack\s?trace|not\s+working)\b/i;
const CORRECTION_PATTERN = /\b(no,?\s+i\s+meant|that'?s\s+wrong|not\s+what\s+i\s+asked|incorrect|you\s+misunderstood)\b/i;
const REFACTORING_PATTERN = /\b(refactor|rename|extract|move|reorganize|restructure|clean\s?up)\b/i;
const QUESTION_PATTERN = /^(what|why|how|where|when|which|can\s+you\s+explain|explain)\b/i;

export function classifyPromptKind(text: string): PromptKind {
  if (!text || text.trim() === '') return 'follow_up';
  if (DEBUGGING_PATTERN.test(text)) return 'debugging_request';
  if (CORRECTION_PATTERN.test(text)) return 'correction';
  if (REFACTORING_PATTERN.test(text)) return 'refactoring_request';
  if (QUESTION_PATTERN.test(text.trim())) return 'question';
  return 'follow_up';
}

// Likelihood ratios per evidence method: how many times more likely the
// observation is when the prompt truly is the evidenced kind than when it is
// not. Stored as log LR so beliefs combine by summing (odds-form Bayes).
export const PROMPT_KIND_LOG_LR = {
  positional: Math.log(99),
  heuristic: Math.log(3),
  contextual: Math.log(4),
} as const;

const RESPONSE_DEBUGGING_PATTERN = /\b(fix\w*|bug|error|fail\w*|crash\w*|broken|root\s+cause|regression)\b/i;
const RESPONSE_REFACTORING_PATTERN = /\b(refactor\w*|renam\w*|extract\w*|reorganiz\w*|restructur\w*|clean(?:ed)?\s?up)\b/i;
const RESPONSE_QUESTION_PATTERN = /\b(explain\w*|because|means|works?\s+by|refers?\s+to)\b/i;

export function classifyResponseContext(responseSummary: string): PromptKind | null {
  if (!responseSummary || responseSummary.trim() === '') return null;
  if (RESPONSE_DEBUGGING_PATTERN.test(responseSummary)) return 'debugging_request';
  if (RESPONSE_REFACTORING_PATTERN.test(responseSummary)) return 'refactoring_request';
  if (RESPONSE_QUESTION_PATTERN.test(responseSummary)) return 'question';
  return null;
}
