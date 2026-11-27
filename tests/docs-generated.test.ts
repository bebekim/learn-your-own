import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_TUNING } from '../src/lyo/config/tuning.ts';
import { generateDocs, renderPage } from '../src/lyo/config/docs.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

test('generated documentation matches the configuration schemas (run npm run docs:gen)', () => {
  assert.deepEqual(generateDocs(root, { check: true }), []);
});

test('a generated region renders defaults and ranges from the schema; unknown regions are refused', () => {
  const page = renderPage('intro\n<!-- generated:tuning-settings -->\nstale text\n<!-- /generated:tuning-settings -->\nafter\n');
  assert.match(page, new RegExp(`\\| \`tuning.hooks.checkSeconds\` \\| \`${DEFAULT_TUNING.hooks.checkSeconds}\` \\| 0.2–30 \\|`));
  assert.doesNotMatch(page, /stale text/);
  assert.match(page, /^intro\n/);
  assert.match(page, /after\n$/);
  assert.throws(() => renderPage('<!-- generated:nope -->\n<!-- /generated:nope -->'), /unknown generated region/);
});
