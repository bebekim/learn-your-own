import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  hashFile,
  runPipeline,
  validateCodeManifest,
  validateTestManifest,
  validateTrace,
  validateVerifierReport,
} from '../src/index.ts';

async function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-pipeline-'));
  try {
    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SPEC = {
  version: 'lyo.spec.v1',
  specId: 'add-spec',
  signatures: ['add(a: number, b: number): number'],
  invariants: ['add(a, b) === add(b, a)'],
  constraints: ['Pure function, no I/O'],
  examples: [{ input: 'add(2, 3)', output: '5' }],
};

function writeSource(dir, { spec = SPEC, tamperSpec = false, weakenBlindness = false } = {}) {
  const specPath = join(dir, 'spec.json');
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  const specRef = { path: 'spec.json', sha256: hashFile(specPath).sha256 };

  const codeStage = {
    stageId: 'stage-code',
    role: 'code-writer',
    executor: { kind: 'kimi-cli', model: 'fake-code-model', temperature: 0.2 },
    authority: {
      read: ['spec.json'],
      write: ['generated/src'],
      forbiddenRead: weakenBlindness ? [] : ['generated/tests'],
      forbiddenWrite: ['generated/tests'],
    },
    inputs: [specRef],
    outputs: ['generated/src'],
  };
  const testStage = {
    stageId: 'stage-test',
    role: 'test-writer',
    executor: { kind: 'openrouter', model: 'fake-test-model', temperature: 0.7 },
    authority: {
      read: ['spec.json'],
      write: ['generated/tests'],
      forbiddenRead: ['generated/src'],
      forbiddenWrite: ['generated/src'],
    },
    inputs: [specRef],
    outputs: ['generated/tests'],
  };
  const verifierStage = {
    stageId: 'stage-verify',
    role: 'verifier',
    authority: {
      read: ['generated/src', 'generated/tests'],
      write: [],
      forbiddenRead: [],
      forbiddenWrite: [],
    },
    inputs: [],
    outputs: [],
  };
  const plan = {
    version: 'lyo.plan.v1',
    planId: 'plan-add-1',
    specRef,
    stages: [codeStage, testStage, verifierStage],
    feedbackPolicy: { codeWriterSees: 'aggregate_only' },
    stateless: true,
  };
  const planPath = join(dir, 'plan.json');
  writeFileSync(planPath, JSON.stringify(plan, null, 2));

  if (tamperSpec) {
    writeFileSync(specPath, JSON.stringify({ ...spec, specId: 'tampered' }, null, 2));
  }
  return { planPath };
}

const CODE_OUTPUT = 'module.exports = { add: (a, b) => a + b };\n';

const TEST_TRANSCRIPT = [
  'Here are the tests:',
  '```js path=generated/tests/add.test.js',
  "const assert = require('node:assert/strict');",
  "const test = require('node:test');",
  "const { add } = require('../src/add.js');",
  "test('adds positive integers', () => assert.equal(add(2, 3), 5));",
  "test('is commutative', () => assert.equal(add(2, 3), add(3, 2)));",
  '```',
].join('\n');

function fakeExecutorFactory(stage) {
  if (stage.role === 'code-writer') {
    return async ({ sandboxDir }) => {
      mkdirSync(join(sandboxDir, 'generated/src'), { recursive: true });
      writeFileSync(join(sandboxDir, 'generated/src/add.js'), CODE_OUTPUT);
      return { transcript: 'wrote generated/src/add.js' };
    };
  }
  return async () => ({ transcript: TEST_TRANSCRIPT });
}

test('runPipeline executes a full blind run and emits valid artifacts', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: fakeExecutorFactory,
    });

    assert.equal(result.report.outcome, 'pass', JSON.stringify(result.report.perTest));
    assert.deepEqual(result.report.counts, { total: 2, passed: 2, failed: 0 });

    const report = JSON.parse(readFileSync(result.reportPath, 'utf8'));
    assert.equal(validateVerifierReport(report).ok, true);

    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    assert.equal(validateTrace(trace).ok, true);
    assert.deepEqual(
      trace.stages.map((stage) => stage.stageId),
      ['stage-code', 'stage-test', 'stage-verify']
    );
    assert.equal(trace.stages[0].model, 'fake-code-model');
    assert.equal(trace.stages[1].model, 'fake-test-model');

    const codeManifest = JSON.parse(
      readFileSync(join(result.runDir, 'artifacts/code/manifest.json'), 'utf8')
    );
    assert.equal(validateCodeManifest(codeManifest).ok, true);
    assert.equal(codeManifest.files.length, 1);
    assert.match(codeManifest.files[0].path, /artifacts\/code\/generated\/src\/add\.js$/);

    const testManifest = JSON.parse(
      readFileSync(join(result.runDir, 'artifacts/tests/manifest.json'), 'utf8')
    );
    assert.equal(validateTestManifest(testManifest).ok, true);
    assert.equal(testManifest.frozen, true);
    assert.equal(testManifest.framework, 'node:test');
  });
});

test('runPipeline refuses a plan that violates blindness', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { weakenBlindness: true });
    await assert.rejects(
      () => runPipeline({ planPath, runsRoot: join(dir, 'runs'), executorFactory: fakeExecutorFactory }),
      /forbidden from reading test output/
    );
  });
});

test('runPipeline rejects a stage that produces no declared outputs', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    const rogueFactory = (stage) =>
      stage.role === 'code-writer'
        ? fakeExecutorFactory(stage)
        : async () => ({ transcript: '```js path=etc/evil.js\nconsole.log(1);\n```' });
    await assert.rejects(
      () => runPipeline({ planPath, runsRoot: join(dir, 'runs'), executorFactory: rogueFactory }),
      /no declared outputs/
    );
  });
});

test('runPipeline verifies the spec hash before executing', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { tamperSpec: true });
    await assert.rejects(
      () => runPipeline({ planPath, runsRoot: join(dir, 'runs'), executorFactory: fakeExecutorFactory }),
      /spec hash mismatch/
    );
  });
});

test('runPipeline isolates the verify tree from an ancestor package.json', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    // Simulates running inside a repo whose package.json says "type": "module"
    // while the generated artifacts are CommonJS.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: fakeExecutorFactory,
    });
    assert.equal(result.report.outcome, 'pass');
    assert.deepEqual(result.report.counts, { total: 2, passed: 2, failed: 0 });
  });
});

test('runPipeline persists stage transcripts for post-run inspection', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: fakeExecutorFactory,
    });
    const codeTranscript = readFileSync(
      join(result.runDir, 'stages/stage-code/transcript.txt'),
      'utf8'
    );
    assert.match(codeTranscript, /wrote generated\/src\/add\.js/);
    const testTranscript = readFileSync(
      join(result.runDir, 'stages/stage-test/transcript.txt'),
      'utf8'
    );
    assert.match(testTranscript, /add\.test\.js/);
  });
});
