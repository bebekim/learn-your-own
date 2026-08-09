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
