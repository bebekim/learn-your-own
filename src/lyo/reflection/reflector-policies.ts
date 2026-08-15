/**
 * Reflector policies (design doc §2). A reflector is ANY object:
 *
 *   {
 *     name: string,
 *     version: integer,
 *     reflect({ message, failure_class, cue }) -> { explanation, intervention }
 *   }
 *
 * `message` is the rejected VALIDATION_RESULT ledger message. `failure_class`
 * and `cue` come from the deterministic failure classifier — the grounding
 * anchor; a reflector may NOT move them (they key retrieval and attribution).
 * `explanation` is WHY the failure happened, abstracted; `intervention` is
 * WHAT TO DO DIFFERENTLY, transferable. The observer uses `intervention`
 * verbatim as the base guidance text sent to the implementation agent, so a
 * reflector controls both what is stored and what is delivered.
 *
 * Peirce: the reflector is the loop's ABDUCTION step (hypothesis generation).
 * Deduction (decision log) and induction (Beta-Bernoulli counters, Wilson
 * gate) live elsewhere and grade whatever the reflector proposes — so the
 * reflector may be speculative, but must never be trusted. See
 * docs/lyo-reflector-design (when written) for the elaborator contract:
 * free-text elaboration as intermediary, derived (never elicited) scores.
 *
 * Swapping the reflector is a config change, never an observer/store change:
 * cluster.config.lyo.reflector = '<name>@<version>' (registry id) or an
 * injected object via attachLyoObserver({ reflector }). The CREATE/EDIT delta
 * payload records the authoring reflector id, so outcome lift can be compared
 * per reflector (A/B: template@1 vs elaborator@1) through the existing
 * decision/outcome join.
 *
 * Containment (Appendix B.4): a reflector runs inside the observer's
 * try/catch; ANY failure — unknown id, throw, malformed return — falls back
 * to template@1, which is pure and never throws. Learning never blocks a run.
 */

import { createElaboratorReflector } from './elaborator-reflector.ts';

export const EXPLANATION_MAX_LENGTH = 500;

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

function truncate(text: unknown, maxLength: number): string {
  const value = String(text || '');
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

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

export function buildGuidanceText(message: ValidationMessage): string {
  return `Address the validator feedback before retrying.\n\nLatest validation:\n${formatValidationFeedback(message)}`;
}

// template@1 — the v0 reflector: raw validator feedback, truncated, wrapped
// in a fixed instruction. No abstraction; it exists so the loop runs and so
// future reflectors have a baseline to beat (and a safe fallback).
export const TEMPLATE_REFLECTOR: Reflector = {
  name: 'template',
  version: 1,
  reflect({ message }) {
    return {
      explanation: truncate(formatValidationFeedback(message), EXPLANATION_MAX_LENGTH),
      intervention: buildGuidanceText(message),
    };
  },
};

export const DEFAULT_REFLECTOR = TEMPLATE_REFLECTOR;

export function reflectorId(reflector: Reflector): string {
  return `${reflector.name}@${reflector.version}`;
}

// A reflection is only admissible if both fields are strings — anything else
// (missing fields, numbers, null) is a reflector bug and falls back.
export function isValidReflection(reflection: unknown): reflection is Reflection {
  return (
    !!reflection &&
    typeof (reflection as Reflection).explanation === 'string' &&
    typeof (reflection as Reflection).intervention === 'string'
  );
}

type ReflectorRegistryEntry = Reflector | ((ctx?: ReflectorContext) => Reflector);

// String-addressable reflectors ('name@version'); object reflectors can
// always be injected directly without registration. Registry values are
// either reflector objects or zero-arg factories (used by 'elaborator@1' so
// the OpenRouter client is only constructed when actually configured).
export const REFLECTOR_REGISTRY = new Map<string, ReflectorRegistryEntry>([
  [reflectorId(TEMPLATE_REFLECTOR), TEMPLATE_REFLECTOR],
  ['elaborator@1', (ctx?: ReflectorContext) => createElaboratorReflector({ model: ctx?.model })],
]);

// Accepts a reflector object (sync `reflect` and/or async `reflectAsync`),
// a registry id string, or null (default). `ctx` is forwarded to registry
// factories — e.g. { model } selects the elaborator's model (per-cluster
// cluster.config.lyo.reflectorModel for model-inversion A/B).
export function resolveReflector(ref: ReflectorRef, ctx?: ReflectorContext): Reflector {
  if (!ref) {
    return DEFAULT_REFLECTOR;
  }
  if (typeof ref !== 'string' && (typeof ref.reflect === 'function' || typeof ref.reflectAsync === 'function')) {
    return ref;
  }
  const entry = REFLECTOR_REGISTRY.get(String(ref));
  if (!entry) {
    throw new Error(`unknown reflector: ${ref}`);
  }
  return typeof entry === 'function' ? entry(ctx) : entry;
}
