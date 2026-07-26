import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const TEST_VERSION = 'lyo.test.v1';

export const testManifestSchema = z.object({
  version: z.literal(TEST_VERSION),
  specRef: artifactRefSchema,
  files: z.array(artifactRefSchema).min(1),
  language: z.string().min(1),
  framework: z.string().min(1),
  frozen: z.literal(true),
});

export type TestManifest = z.infer<typeof testManifestSchema>;

export function validateTestManifest(value: unknown): ValidationResult<TestManifest> {
  return validateVersioned(testManifestSchema, TEST_VERSION, value);
}
