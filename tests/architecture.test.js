import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

test('implementation modules do not import domain types from the public barrel', () => {
  const offenders = sourceFiles(SRC)
    .filter((filePath) => !['src/index.ts', 'src/cli.ts'].includes(relative(ROOT, filePath)))
    .filter((filePath) => /from\s+['"](?:\.\.?\/)+index\.ts['"]/.test(readFileSync(filePath, 'utf8')))
    .map((filePath) => relative(ROOT, filePath));

  assert.deepEqual(offenders, []);
});

test('hook normalization runner is owned by the hooks layer, not the public barrel', () => {
  assert.equal(existsSync(join(SRC, 'hooks', 'normalization-runner.ts')), true);
  assert.equal(readFileSync(join(SRC, 'index.ts'), 'utf8').includes('export function normalizeHooks'), false);
});

test('hook adapters share runtime utilities instead of duplicating hashing and prompt storage', () => {
  assert.equal(existsSync(join(SRC, 'adapters', 'runtime.ts')), true);

  const duplicatedHelpers = [
    'function createHookEventId',
    'function fingerprintHookValue',
    'function writePromptBlob',
  ];
  const adapterFiles = [
    join(SRC, 'adapters', 'codex.ts'),
    join(SRC, 'adapters', 'claude.ts'),
  ];

  const offenders = [];
  for (const filePath of adapterFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const helper of duplicatedHelpers) {
      if (source.includes(helper)) {
        offenders.push(`${relative(ROOT, filePath)}:${helper}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
