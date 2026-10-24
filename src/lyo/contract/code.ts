import { z } from 'zod';

import { artifactRefSchema } from './refs.ts';
import { validateVersioned, type ValidationResult } from './validate.ts';

export const CODE_VERSION = 'lyo.code.v1';

export const codeManifestSchema = z.object({
  version: z.literal(CODE_VERSION),
  specRef: artifactRefSchema,
  files: z.array(artifactRefSchema).min(1),
  language: z.string().min(1),
  entrypoint: z.string().optional(),
});

export type CodeManifest = z.infer<typeof codeManifestSchema>;

export function validateCodeManifest(value: unknown): ValidationResult<CodeManifest> {
  return validateVersioned(codeManifestSchema, CODE_VERSION, value);
}
