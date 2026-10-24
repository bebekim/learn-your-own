import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { z } from 'zod';

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const artifactRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(SHA256_PATTERN),
});

export type ArtifactRef = z.infer<typeof artifactRefSchema>;

export function hashValue(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function hashFile(path: string): ArtifactRef {
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex');
  return { path, sha256 };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
