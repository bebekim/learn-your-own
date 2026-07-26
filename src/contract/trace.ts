import { z } from 'zod';

import { artifactRefSchema, SHA256_PATTERN } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const TRACE_VERSION = 'lyo.trace.v1';

export const traceStageSchema = z.object({
  stageId: z.string().min(1),
  // Iteration number for stages re-run under the feedback loop.
  round: z.number().int().min(1).optional(),
  inputs: z.array(artifactRefSchema),
  outputs: z.array(artifactRefSchema),
  model: z.string().optional(),
  promptSha256: z.string().regex(SHA256_PATTERN).optional(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
});

export const traceFeedbackSchema = z.object({
  rounds: z.number().int().min(1),
  stopReason: z.enum(['pass', 'max_rounds', 'stuck', 'no_change']),
});

export const traceSchema = z.object({
  version: z.literal(TRACE_VERSION),
  runId: z.string().min(1),
  planRef: artifactRefSchema,
  stages: z.array(traceStageSchema),
  feedback: traceFeedbackSchema.optional(),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
});

export type Trace = z.infer<typeof traceSchema>;
export type TraceStage = z.infer<typeof traceStageSchema>;
export type TraceFeedback = z.infer<typeof traceFeedbackSchema>;

export function validateTrace(value: unknown): ValidationResult<Trace> {
  return validateVersioned(traceSchema, TRACE_VERSION, value);
}
