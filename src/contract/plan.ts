import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const PLAN_VERSION = 'lyo.plan.v1';

export const planStageRoleSchema = z.enum(['code-writer', 'test-writer', 'verifier']);

export const planStageAuthoritySchema = z.object({
  read: z.array(z.string().min(1)),
  write: z.array(z.string().min(1)),
  forbiddenRead: z.array(z.string().min(1)),
  forbiddenWrite: z.array(z.string().min(1)),
});

export const planStageExecutorSchema = z.object({
  kind: z.enum(['kimi-cli', 'openrouter']),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
});

export const planStageSchema = z.object({
  stageId: z.string().min(1),
  role: planStageRoleSchema,
  executor: planStageExecutorSchema.optional(),
  authority: planStageAuthoritySchema,
  inputs: z.array(artifactRefSchema),
  outputs: z.array(z.string().min(1)),
});

export const planSchema = z.object({
  version: z.literal(PLAN_VERSION),
  planId: z.string().min(1),
  specRef: artifactRefSchema,
  stages: z.array(planStageSchema).min(1),
  feedbackPolicy: z.object({
    codeWriterSees: z.literal('aggregate_only'),
  }),
  stateless: z.literal(true),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanStage = z.infer<typeof planStageSchema>;
export type PlanStageExecutor = z.infer<typeof planStageExecutorSchema>;
export type PlanStageRole = z.infer<typeof planStageRoleSchema>;
export type PlanStageAuthority = z.infer<typeof planStageAuthoritySchema>;

export interface BlindnessResult {
  ok: boolean;
  violations: string[];
}

export function validatePlan(value: unknown): ValidationResult<Plan> {
  return validateVersioned(planSchema, PLAN_VERSION, value);
}

export function checkBlindness(plan: Plan): BlindnessResult {
  const violations: string[] = [];
  const codeWriters = plan.stages.filter((stage) => stage.role === 'code-writer');
  const testWriters = plan.stages.filter((stage) => stage.role === 'test-writer');
  const specPath = plan.specRef.path;

  if (codeWriters.length === 0) {
    violations.push('plan has no code-writer stage');
  }
  if (testWriters.length === 0) {
    violations.push('plan has no test-writer stage');
  }

  for (const codeWriter of codeWriters) {
    if (!codeWriter.authority.read.includes(specPath)) {
      violations.push(`code-writer stage '${codeWriter.stageId}' does not read the shared spec '${specPath}'`);
    }
    for (const testWriter of testWriters) {
      for (const output of testWriter.outputs) {
        if (!codeWriter.authority.forbiddenRead.includes(output)) {
          violations.push(
            `code-writer stage '${codeWriter.stageId}' is not forbidden from reading test output '${output}'`
          );
        }
      }
    }
  }

  for (const testWriter of testWriters) {
    if (!testWriter.authority.read.includes(specPath)) {
      violations.push(`test-writer stage '${testWriter.stageId}' does not read the shared spec '${specPath}'`);
    }
    for (const codeWriter of codeWriters) {
      for (const output of codeWriter.outputs) {
        if (!testWriter.authority.forbiddenRead.includes(output)) {
          violations.push(
            `test-writer stage '${testWriter.stageId}' is not forbidden from reading code output '${output}'`
          );
        }
      }
    }
  }

  return { ok: violations.length === 0, violations };
}
