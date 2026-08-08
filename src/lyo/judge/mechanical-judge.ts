import type { DisagreementInput, Judgment } from './trace-consumer.ts';

interface MechanicalRule {
  id: string;
  pattern: RegExp;
  rationale: string;
  lesson: string;
  falsifiableBy: string;
}

/**
 * Deterministic pre-classification for failures a machine can decide without
 * an LLM. Each rule is a signature observed in real verifier output. Anything
 * not matching falls through to the LLM judge (semantic disagreements only).
 */
const RULES: MechanicalRule[] = [
  {
    id: 'test-code-error',
    pattern: /ReferenceError|SyntaxError/,
    rationale:
      'The test file itself does not evaluate (ReferenceError/SyntaxError in the test artifact) — a test-authoring error, decidable without a judge.',
    lesson:
      'Freeze only tests that were executed before submission; an unevaluated test is an authoring error, not a verdict on the code.',
    falsifiableBy: 'a frozen suite where every test file evaluates successfully',
  },
  {
    id: 'module-system-mismatch',
    pattern: /Cannot use import statement outside a module|require is not defined in ES module scope/,
    rationale:
      'Module-system mismatch: the test uses ESM or CJS incompatible with the merged tree (an ESM/CJS authoring error, not a semantic disagreement).',
    lesson:
      'Match the spec\u2019s declared module system exactly; verify require vs import before freezing the suite.',
    falsifiableBy: 'a suite that loads under the spec-declared module system',
  },
  {
    id: 'negative-zero-trap',
    pattern: /\+\s*0\s*\n\s*-\s*-0|Object\.is.*-0|-0\s*\n\s*-?\s*\+\s*0/,
    rationale:
      'The -0 trap: assert/strict uses Object.is, which treats -0 and 0 as different; the test manufactured -0 by negating, so it fails against mathematically correct code.',
    lesson:
      'For negation-based properties, avoid creating -0: assert the sum (f(a,b) + f(b,a) === 0) or normalize with (x + 0) after all negation.',
    falsifiableBy: 'an antisymmetry test that passes against code returning plain 0',
  },
];

export function classifyMechanically(input: DisagreementInput): Judgment | null {
  for (const rule of RULES) {
    if (rule.pattern.test(input.tapExcerpt)) {
      return {
        classification: 'test-hallucination',
        rationale: rule.rationale,
        evidence: input.tapExcerpt.trim().split('\n').slice(0, 3).join('\n'),
        lesson: rule.lesson,
        falsifiableBy: rule.falsifiableBy,
        source: 'mechanical',
      };
    }
  }
  return null;
}
