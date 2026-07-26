import { z } from 'zod';

import { validateVersioned, type ValidationResult } from './validate.ts';

export const SPEC_VERSION = 'lyo.spec.v1';

export const specExampleSchema = z.object({
  input: z.string(),
  output: z.string(),
  note: z.string().optional(),
});

export const specSchema = z.object({
  version: z.literal(SPEC_VERSION),
  specId: z.string().min(1),
  signatures: z.array(z.string().min(1)),
  invariants: z.array(z.string().min(1)),
  constraints: z.array(z.string().min(1)),
  examples: z.array(specExampleSchema),
  // Domain-level hints only. "No implementation hints" is a documented
  // convention; it cannot be machine-enforced.
  edgeCaseHints: z.array(z.string().min(1)).optional(),
});

export type Spec = z.infer<typeof specSchema>;
export type SpecExample = z.infer<typeof specExampleSchema>;

export function validateSpec(value: unknown): ValidationResult<Spec> {
  return validateVersioned(specSchema, SPEC_VERSION, value);
}
