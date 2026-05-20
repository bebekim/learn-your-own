#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { request } from 'node:https';
import { execFileSync } from 'node:child_process';

const root = new URL('..', import.meta.url).pathname;
const token = process.env.NPM_TOKEN;
const otp = process.env.NPM_OTP;
const registry = process.env.NPM_REGISTRY ?? 'https://registry.npmjs.org';
const access = process.env.NPM_ACCESS ?? 'public';
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const tarballPath = join(root, `dist/${packageJson.name}-${packageJson.version}.tgz`);

if (!token) {
  throw new Error('NPM_TOKEN is required to publish');
}

execFileSync(process.execPath, [join(root, 'scripts/pack-npm.mjs')], { stdio: 'inherit' });

const tarball = readFileSync(tarballPath);
const shasum = createHash('sha1').update(tarball).digest('hex');
const integrity = `sha512-${createHash('sha512').update(tarball).digest('base64')}`;
const encodedName = encodeURIComponent(packageJson.name).replace('%40', '@');
const url = new URL(`${registry.replace(/\/$/, '')}/${encodedName}`);
const filename = basename(tarballPath);

const manifest = {
  _id: packageJson.name,
  name: packageJson.name,
  description: packageJson.description,
  'dist-tags': {
    latest: packageJson.version,
  },
  versions: {
    [packageJson.version]: {
      ...packageJson,
      _id: `${packageJson.name}@${packageJson.version}`,
      dist: {
        shasum,
        integrity,
        tarball: `${registry.replace(/\/$/, '')}/${packageJson.name}/-/${filename}`,
      },
    },
  },
  access,
  _attachments: {
    [filename]: {
      content_type: 'application/octet-stream',
      data: tarball.toString('base64'),
      length: tarball.length,
    },
  },
};

const body = JSON.stringify(manifest);

const response = await new Promise((resolve, reject) => {
  const req = request(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      ...(otp ? { 'npm-otp': otp } : {}),
    },
  }, (res) => {
    let data = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      resolve({ statusCode: res.statusCode, data });
    });
  });
  req.on('error', reject);
  req.end(body);
});

const statusCode = response.statusCode ?? 0;
if (statusCode < 200 || statusCode >= 300) {
  throw new Error(`npm publish failed with HTTP ${statusCode}: ${response.data}`);
}

console.log(response.data);
