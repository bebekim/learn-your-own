import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  checkBlindness,
  hashValue,
  validateCodeManifest,
  validateLyoUpdate,
  validatePlan,
  validateSpec,
  validateTestManifest,
  validateTrace,
  validateVerifierReport,
} from '../src/index.ts';

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/contract/${name}`, import.meta.url), 'utf8'));
}

const VALID_SHA256 = 'a'.repeat(64);

test('valid spec fixture round-trips through validateSpec', () => {
  const result = validateSpec(fixture('spec.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.specId, 'spec-example-1');
});

test('validateSpec rejects a missing version with a dedicated message', () => {
  const value = fixture('spec.json');
  delete value.version;
  const result = validateSpec(value);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'version');
  assert.match(result.errors[0].message, /lyo\.spec\.v1/);
});

test('validateSpec rejects a wrong version naming expected and got', () => {
  const result = validateSpec({ ...fixture('spec.json'), version: 'lyo.spec.v0' });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /lyo\.spec\.v1/);
  assert.match(result.errors[0].message, /lyo\.spec\.v0/);
});

test('artifact refs reject malformed sha256', () => {
  const value = fixture('spec.json');
  const plan = fixture('plan.json');
  plan.specRef.sha256 = 'not-a-hash';
  const result = validatePlan(plan);
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].path, 'specRef.sha256');
  assert.equal(value.version, 'lyo.spec.v1');
});

test('valid plan fixture round-trips and checkBlindness passes', () => {
  const result = validatePlan(fixture('plan.json'));
  assert.equal(result.ok, true);
  const blindness = checkBlindness(result.value);
  assert.equal(blindness.ok, true);
  assert.deepEqual(blindness.violations, []);
});

test('plan rejects non-literal stateless and feedbackPolicy values', () => {
  const plan = fixture('plan.json');
  const statelessResult = validatePlan({ ...plan, stateless: false });
  assert.equal(statelessResult.ok, false);

  const feedbackResult = validatePlan({
    ...plan,
    feedbackPolicy: { codeWriterSees: 'full_report' },
  });
  assert.equal(feedbackResult.ok, false);
});

test('checkBlindness flags a code-writer that may read test outputs', () => {
  const plan = fixture('plan.json');
  plan.stages[0].authority.forbiddenRead = [];
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  const blindness = checkBlindness(result.value);
  assert.equal(blindness.ok, false);
  assert.ok(blindness.violations.some((violation) => violation.includes('generated/tests')));
});

test('checkBlindness flags a test-writer that may read code outputs', () => {
  const plan = fixture('plan.json');
  plan.stages[1].authority.forbiddenRead = [];
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  const blindness = checkBlindness(result.value);
  assert.equal(blindness.ok, false);
  assert.ok(blindness.violations.some((violation) => violation.includes('generated/src')));
});

test('checkBlindness flags a stage that does not read the shared spec', () => {
  const plan = fixture('plan.json');
  plan.stages[1].authority.read = [];
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  const blindness = checkBlindness(result.value);
  assert.equal(blindness.ok, false);
  assert.ok(blindness.violations.some((violation) => violation.includes('spec')));
});

test('checkBlindness flags a plan without a code-writer stage', () => {
  const plan = fixture('plan.json');
  plan.stages = plan.stages.filter((stage) => stage.role !== 'code-writer');
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  const blindness = checkBlindness(result.value);
  assert.equal(blindness.ok, false);
  assert.ok(blindness.violations.some((violation) => violation.includes('code-writer')));
});

test('plan stages carry an optional executor binding', () => {
  const result = validatePlan(fixture('plan.json'));
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.stages[0].executor, {
    kind: 'kimi-cli',
    model: 'kimi-code/kimi-for-coding',
    temperature: 0.2,
  });
  assert.equal(result.value.stages[1].executor.kind, 'openrouter');
});

test('plan rejects an unknown executor kind', () => {
  const plan = fixture('plan.json');
  plan.stages[0].executor = { kind: 'docker', model: 'x' };
  assert.equal(validatePlan(plan).ok, false);
});

test('plan without an executor binding remains valid', () => {
  const plan = fixture('plan.json');
  delete plan.stages[0].executor;
  const result = validatePlan(plan);
  assert.equal(result.ok, true);
  assert.equal(result.value.stages[0].executor, undefined);
});

test('valid code manifest fixture round-trips', () => {
  const result = validateCodeManifest(fixture('code-manifest.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.language, 'typescript');
});

test('code manifest rejects an empty files array', () => {
  const result = validateCodeManifest({ ...fixture('code-manifest.json'), files: [] });
  assert.equal(result.ok, false);
});

test('valid test manifest fixture round-trips and requires frozen literal', () => {
  const result = validateTestManifest(fixture('test-manifest.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.frozen, true);

  const unfrozen = validateTestManifest({ ...fixture('test-manifest.json'), frozen: false });
  assert.equal(unfrozen.ok, false);
});

test('valid verifier report fixture round-trips', () => {
  const result = validateVerifierReport(fixture('verifier-report.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.outcome, 'fail');
  assert.equal(result.value.counts.total, 4);
});

test('verifier report rejects an unknown outcome', () => {
  const result = validateVerifierReport({ ...fixture('verifier-report.json'), outcome: 'maybe' });
  assert.equal(result.ok, false);
});

test('valid trace fixture round-trips', () => {
  const result = validateTrace(fixture('trace.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.stages.length, 2);
});

test('trace rejects a malformed promptSha256', () => {
  const trace = fixture('trace.json');
  trace.stages[0].promptSha256 = 'xyz';
  const result = validateTrace(trace);
  assert.equal(result.ok, false);
});

test('valid lyo-update fixture round-trips as experimental v0', () => {
  const result = validateLyoUpdate(fixture('lyo-update.json'));
  assert.equal(result.ok, true);
  assert.equal(result.value.version, 'lyo.lyo-update.v0');
  assert.equal(result.value.promotions.length, 1);
});

test('hashValue is deterministic and key-order independent', () => {
  const left = hashValue({ a: 1, b: [2, 3] });
  const right = hashValue({ b: [2, 3], a: 1 });
  assert.equal(left, right);
  assert.match(left, /^[0-9a-f]{64}$/);
  assert.notEqual(left, VALID_SHA256.replace(/a/g, 'b'));
});
