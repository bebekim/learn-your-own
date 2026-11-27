#!/usr/bin/env node
// Regenerates documentation regions from configuration schemas (src/lyo/config/docs.ts).
// Usage: node scripts/gen-docs.mjs [--check]
import { fileURLToPath } from 'node:url';
import { generateDocs } from '../src/lyo/config/docs.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const check = process.argv.includes('--check');
const stale = generateDocs(root, { check });
if (check && stale.length) {
  process.stderr.write(`stale generated docs: ${stale.join(', ')}; run npm run docs:gen\n`);
  process.exit(1);
}
process.stdout.write(stale.length ? `${check ? 'stale' : 'updated'}: ${stale.join(', ')}\n` : 'docs up to date\n');
