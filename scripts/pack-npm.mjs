#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const staging = join(root, 'dist/npm/package');
const tarball = join(root, `dist/${packageJson.name}-${packageJson.version}.tgz`);

rmSync(join(root, 'dist/npm'), { recursive: true, force: true });
mkdirSync(join(staging, 'src'), { recursive: true });
mkdirSync(join(staging, 'docs'), { recursive: true });

const publishedPackageJson = {
  ...packageJson,
  bin: {
    lyo: './src/cli.js',
  },
  exports: {
    '.': './src/index.js',
  },
  scripts: undefined,
  devDependencies: undefined,
};

writeFileSync(
  join(staging, 'package.json'),
  `${JSON.stringify(publishedPackageJson, null, 2)}\n`
);
for (const file of ['README.md', 'CHANGELOG.md', 'LICENSE.md']) {
  writeFileSync(join(staging, file), readFileSync(join(root, file)));
}
writeFileSync(
  join(staging, 'docs/deterministic-classification.md'),
  readFileSync(join(root, 'docs/deterministic-classification.md'))
);

execFileSync('npm', ['run', 'build:npm'], { cwd: root, stdio: 'inherit' });

execFileSync('tar', [
  '-czf',
  tarball,
  '-C',
  join(root, 'dist/npm'),
  ...packageFiles(staging).map((filePath) => `package/${relative(staging, filePath)}`),
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

function packageFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      files.push(...packageFiles(path));
    } else {
      files.push(path);
    }
  }
  return files.sort();
}
