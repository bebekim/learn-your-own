import { readFileSync } from 'node:fs';
import { z } from 'zod';

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: ValidationIssue[] };

export function validateVersioned<Schema extends z.ZodType>(
  schema: Schema,
  expectedVersion: string,
  value: unknown
): ValidationResult<z.infer<Schema>> {
  const actualVersion =
    typeof value === 'object' && value !== null && 'version' in value
      ? (value as { version: unknown }).version
      : undefined;

  if (actualVersion !== expectedVersion) {
    return {
      ok: false,
      errors: [
        {
          path: 'version',
          message: `expected version '${expectedVersion}', got ${JSON.stringify(actualVersion)}`,
        },
      ],
    };
  }

  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  return { ok: true, value: parsed.data };
}

export function mustValidate<T>(result: ValidationResult<T>, artifact: string): T {
  if (!result.ok) {
    const details = result.errors.map((error) => `${error.path}: ${error.message}`).join('; ');
    throw new Error(`invalid ${artifact}: ${details}`);
  }
  return result.value;
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}
