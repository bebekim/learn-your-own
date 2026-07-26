import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const VERIFIER_REPORT_VERSION = 'lyo.verifier-report.v1';

export const verifierReportCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});

export const verifierPerTestSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['pass', 'fail', 'error']),
  message: z.string().optional(),
});

export const verifierReportSchema = z.object({
  version: z.literal(VERIFIER_REPORT_VERSION),
  specRef: artifactRefSchema,
  codeRef: artifactRefSchema,
  testRef: artifactRefSchema,
  counts: verifierReportCountsSchema,
  outcome: z.enum(['pass', 'fail', 'error']),
  // Full detail lives in the report (the runtime sees all). The aggregate-only
  // restriction on code-writer feedback is plan.feedbackPolicy's job.
  perTest: z.array(verifierPerTestSchema).optional(),
});

export type VerifierReport = z.infer<typeof verifierReportSchema>;
export type VerifierReportCounts = z.infer<typeof verifierReportCountsSchema>;
export type VerifierPerTest = z.infer<typeof verifierPerTestSchema>;

export function validateVerifierReport(value: unknown): ValidationResult<VerifierReport> {
  return validateVersioned(verifierReportSchema, VERIFIER_REPORT_VERSION, value);
}
