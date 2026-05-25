import { readFileSync } from 'node:fs';

let cachedLyoVersion: string | null = null;

export function getLyoVersion(): string {
  if (cachedLyoVersion) return cachedLyoVersion;

  try {
    const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      version?: unknown;
    };
    cachedLyoVersion = typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    cachedLyoVersion = 'unknown';
  }

  return cachedLyoVersion;
}
