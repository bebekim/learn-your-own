import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCommand,
  familyForCommand,
} from '../src/behavior/command-classifier.ts';

test('classifyCommand: npm commands', () => {
  assert.equal(classifyCommand('npm', 'npm test'), 'test');
  assert.equal(classifyCommand('npm', 'npm run build'), 'build');
  assert.equal(classifyCommand('npm', 'npm run lint'), 'lint');
  assert.equal(classifyCommand('npm', 'npm run format'), 'format');
  assert.equal(classifyCommand('npm', 'npm install'), 'package');
});

test('classifyCommand: npx commands', () => {
  assert.equal(classifyCommand('npx', 'npx tsc --noEmit'), 'build');
});

test('classifyCommand: pnpm commands', () => {
  assert.equal(classifyCommand('pnpm', 'pnpm exec vitest run'), 'test');
});

test('classifyCommand: git commands', () => {
  assert.equal(classifyCommand('git', 'git commit -m "msg"'), 'git');
  assert.equal(classifyCommand('git', 'git push'), 'git');
});

test('classifyCommand: test runners', () => {
  assert.equal(classifyCommand('pytest', 'pytest -x'), 'test');
  assert.equal(classifyCommand('vitest', 'vitest run'), 'test');
  assert.equal(classifyCommand('jest', 'jest --coverage'), 'test');
});

test('classifyCommand: build tools', () => {
  assert.equal(classifyCommand('tsc', 'tsc --noEmit'), 'build');
  assert.equal(classifyCommand('docker', 'docker build -t app .'), 'build');
});

test('classifyCommand: docker compose up --build is not build', () => {
  assert.equal(classifyCommand('docker', 'docker compose up --build -d'), 'unknown');
});

test('classifyCommand: lint and format', () => {
  assert.equal(classifyCommand('eslint', 'eslint src/'), 'lint');
  assert.equal(classifyCommand('prettier', 'prettier --write .'), 'format');
});

test('classifyCommand: deploy commands', () => {
  assert.equal(classifyCommand('docker', 'docker push myimage'), 'deploy');
  assert.equal(classifyCommand('kubectl', 'kubectl apply -f deploy.yaml'), 'deploy');
  assert.equal(classifyCommand('terraform', 'terraform apply'), 'deploy');
  assert.equal(classifyCommand('releasectl', 'releasectl deploy --target dev'), 'deploy');
  assert.equal(classifyCommand('gcloud', 'gcloud app deploy'), 'deploy');
});

test('classifyCommand: git and gh commands', () => {
  assert.equal(classifyCommand('gh', 'gh pr create'), 'git');
});

test('classifyCommand: database commands', () => {
  assert.equal(classifyCommand('sqlite3', 'sqlite3 db.sqlite .dump'), 'database');
  assert.equal(classifyCommand('psql', 'psql -c "SELECT 1"'), 'database');
});

test('classifyCommand: cloud commands', () => {
  assert.equal(classifyCommand('aws', 'aws s3 ls'), 'cloud');
});

test('classifyCommand: inspect commands', () => {
  assert.equal(classifyCommand('ls', 'ls -la'), 'inspect');
  assert.equal(classifyCommand('cat', 'cat file.txt'), 'inspect');
  assert.equal(classifyCommand('grep', 'grep -r pattern .'), 'inspect');
  assert.equal(classifyCommand('find', 'find . -name "*.ts"'), 'inspect');
});

test('classifyCommand: local dev commands', () => {
  assert.equal(classifyCommand('node', 'node server.js'), 'local_dev');
  assert.equal(classifyCommand('vite', 'vite dev'), 'local_dev');
});

test('classifyCommand: unknown commands', () => {
  assert.equal(classifyCommand('unknowncmd', 'unknowncmd --flag'), 'unknown');
});

test('familyForCommand: npm family', () => {
  assert.equal(familyForCommand('npm'), 'npm');
  assert.equal(familyForCommand('npx'), 'npm');
  assert.equal(familyForCommand('pnpm'), 'npm');
  assert.equal(familyForCommand('yarn'), 'npm');
});

test('familyForCommand: other families', () => {
  assert.equal(familyForCommand('git'), 'git');
  assert.equal(familyForCommand('docker'), 'docker');
  assert.equal(familyForCommand('kubectl'), 'k8s');
  assert.equal(familyForCommand('terraform'), 'terraform');
  assert.equal(familyForCommand('pytest'), 'pytest');
  assert.equal(familyForCommand('customtool'), 'customtool');
});
