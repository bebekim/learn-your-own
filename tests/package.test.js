import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

test('packed npm package includes every runtime module needed by the CLI', () => {
  rmSync(join(ROOT, 'dist'), { recursive: true, force: true });

  execFileSync(process.execPath, ['scripts/pack-npm.mjs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });

  const output = execFileSync(
    process.execPath,
    ['dist/npm/package/src/cli.js', 'report', '--db', ':memory:'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
});
