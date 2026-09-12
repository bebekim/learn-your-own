export interface ValidationMessage {
  content?: {
    text?: string;
    data?: {
      errors?: unknown[];
      [key: string]: unknown;
    };
  };
}

export interface ReflectionInput {
  message: ValidationMessage;
  failure_class?: string;
  cue?: string;
}

export interface Reflection {
  explanation: string;
  intervention: string;
  /**
   * Specs/6 F1: the reflector's self-rated confidence in [0, 1] that this
   * lesson addresses the failure — the LLM semantic prior π_LLM. Optional:
   * template@1 and pre-F1 models never set it, which stores no prior.
   */
  confidence?: number;
}

export interface Reflector {
  name: string;
  version: number;
  model?: string;
  reflect?(input: ReflectionInput): Reflection;
  reflectAsync?(input: ReflectionInput): Promise<Reflection>;
}

export interface ReflectorContext {
  model?: string;
}

export type ReflectorRef = Reflector | string | null | undefined;

export function formatValidationFeedback(message: ValidationMessage): string {
  const parts: string[] = [];
  const text = message.content?.text;
  const errors = message.content?.data?.errors;

  if (text) {
    parts.push(text);
  }

  if (Array.isArray(errors) && errors.length > 0) {
    parts.push(`Errors:\n${errors.map((error) => `- ${String(error)}`).join('\n')}`);
  }

  return parts.join('\n\n') || 'Validator rejected the last result without details.';
}
