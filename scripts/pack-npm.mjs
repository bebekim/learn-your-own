#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const staging = join(root, 'dist/npm/package');
const tarball = join(root, `dist/${packageJson.name}-${packageJson.version}.tgz`);

rmSync(join(root, 'dist/npm'), { recursive: true, force: true });
mkdirSync(join(staging, 'src'), { recursive: true });

for (const file of ['package.json', 'README.md', 'LICENSE.md']) {
  writeFileSync(join(staging, file), readFileSync(join(root, file)));
}
for (const file of ['cli.ts', 'index.ts']) {
  writeFileSync(join(staging, 'src', file), readFileSync(join(root, 'src', file)));
}

execFileSync('tar', [
  '-czf',
  tarball,
  '-C',
  join(root, 'dist/npm'),
  'package/package.json',
  'package/README.md',
  'package/LICENSE.md',
  'package/src/index.ts',
  'package/src/cli.ts',
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    COPYFILE_DISABLE: '1',
    LC_ALL: 'C',
  },
});

const bytes = readFileSync(tarball);
const shasum = createHash('sha1').update(bytes).digest('hex');
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

console.log(JSON.stringify({
  ok: true,
  name: packageJson.name,
  version: packageJson.version,
  tarball: `dist/${basename(tarball)}`,
  size: bytes.length,
  shasum,
  integrity,
}, null, 2));
