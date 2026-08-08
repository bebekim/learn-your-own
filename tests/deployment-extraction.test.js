import assert from 'node:assert/strict';
import test from 'node:test';

import { extractDeployment } from '../src/behavior/deployment-extractor.ts';
import { extractHookFacts } from '../src/hooks/normalizer.ts';

test('extractDeployment: releasectl deploy parses --target as environment', () => {
  const result = extractDeployment('releasectl', 'releasectl deploy --target dev', 'succeeded');
  assert.ok(result);
  assert.equal(result.provider, 'releasectl');
  assert.equal(result.environment, 'dev');
  assert.equal(result.target, null);
  assert.equal(result.status, 'succeeded');
});

test('extractDeployment: terraform apply returns provider only', () => {
  const result = extractDeployment('terraform', 'terraform apply -auto-approve', 'attempted');
  assert.ok(result);
  assert.equal(result.provider, 'terraform');
  assert.equal(result.environment, null);
  assert.equal(result.target, null);
  assert.equal(result.status, 'attempted');
});

test('extractDeployment: kubectl apply returns provider only', () => {
  const result = extractDeployment('kubectl', 'kubectl apply -f deploy.yaml', 'succeeded');
  assert.ok(result);
  assert.equal(result.provider, 'kubectl');
  assert.equal(result.environment, null);
  assert.equal(result.target, null);
  assert.equal(result.status, 'succeeded');
});

test('extractDeployment: docker push parses image as target', () => {
  const result = extractDeployment('docker', 'docker push myimage:latest', 'succeeded');
  assert.ok(result);
  assert.equal(result.provider, 'docker');
  assert.equal(result.target, 'myimage:latest');
  assert.equal(result.environment, null);
  assert.equal(result.status, 'succeeded');
});

test('extractDeployment: docker build returns null (not a deployment)', () => {
  const result = extractDeployment('docker', 'docker build -t app .', 'succeeded');
  assert.equal(result, null);
});

test('extractDeployment: npm test returns null (not a deployment tool)', () => {
  const result = extractDeployment('npm', 'npm test', 'succeeded');
  assert.equal(result, null);
});

test('extractDeployment: aws deploy parses application-name as target', () => {
  const result = extractDeployment('aws', 'aws deploy push --application-name myapp', 'attempted');
  assert.ok(result);
  assert.equal(result.provider, 'aws');
  assert.equal(result.environment, null);
  assert.equal(result.target, 'myapp');
  assert.equal(result.status, 'attempted');
});

test('extractDeployment: gcloud app deploy returns provider only', () => {
  const result = extractDeployment('gcloud', 'gcloud app deploy --version v2', 'succeeded');
  assert.ok(result);
  assert.equal(result.provider, 'gcloud');
  assert.equal(result.environment, null);
  assert.equal(result.target, null);
  assert.equal(result.status, 'succeeded');
});

test('extractDeployment: helm upgrade --install parses release name as target', () => {
  const result = extractDeployment('helm', 'helm upgrade --install myrelease ./charts', 'succeeded');
  assert.ok(result);
  assert.equal(result.provider, 'helm');
  assert.equal(result.environment, null);
  assert.equal(result.target, 'myrelease');
  assert.equal(result.status, 'succeeded');
});

test('extractDeployment: git push returns null (not a deployment)', () => {
  const result = extractDeployment('git', 'git push origin main', 'succeeded');
  assert.equal(result, null);
});

test('extractHookFacts populates deployment for releasectl deploy', () => {
  const facts = extractHookFacts({
    eventId: 'hook-deployment',
    sessionId: 'session-deploy',
    turnId: 'turn-deploy',
    eventName: 'PostToolUse',
    cwd: '/tmp/demo',
    payloadJson: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'releasectl deploy --target prod',
      },
      tool_response: {
        exit_code: 0,
        stdout: 'deployed\n',
      },
    }),
  });

  assert.equal(facts.commands.length, 1);
  assert.ok(facts.commands[0].deployment);
  assert.equal(facts.commands[0].deployment.provider, 'releasectl');
  assert.equal(facts.commands[0].deployment.environment, 'prod');
  assert.equal(facts.commands[0].deployment.status, 'succeeded');
});
