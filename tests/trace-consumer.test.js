import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  consumeTraces,
  extractDisagreements,
  loadRunEvidence,
  parseJudgeResponse,
  validateLyoUpdate,
} from '../src/index.ts';

async function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-learn-'));
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
  constraints: ['CommonJS'],
  examples: [{ input: 'add(2, 3)', output: '5' }],
};

const TAP = [
  'TAP version 13',
  '# Subtest: adds positive integers',
  'ok 1 - adds positive integers',
  '# Subtest: handles overflow',
  'not ok 2 - handles overflow',
  '  ---',
  '  error: |-',
  '    Expected values to be strictly deep-equal:',
  '    + actual - expected',
  '    + 0',
  '    - 9007199254740991',
  '  ...',
  '# Subtest: is commutative',
  'not ok 3 - is commutative',
  '  ---',
  '  error: assertion failed',
  '  ...',
  '# tests 3',
  '# pass 1',
  '# fail 2',
].join('\n');

async function sha256Of(path) {
  const { createHash } = await import('node:crypto');
  const { readFileSync: read } = await import('node:fs');
  return createHash('sha256').update(read(path)).digest('hex');
}

async function makeRunDir(root, runId, { specId = 'add-spec', failing = true } = {}) {
  const runDir = join(root, runId);
  mkdirSync(join(runDir, 'artifacts/code/generated/src'), { recursive: true });
  mkdirSync(join(runDir, 'artifacts/tests/generated/tests'), { recursive: true });
  mkdirSync(join(runDir, 'verify-tap'), { recursive: true });

  writeFileSync(join(runDir, 'spec.json'), JSON.stringify({ ...SPEC, specId }));
  const specRef = { path: 'spec.json', sha256: await sha256Of(join(runDir, 'spec.json')) };

  const plan = {
    version: 'lyo.plan.v1',
    planId: 'plan-1',
    specRef,
    stages: [
      {
        stageId: 'stage-code',
        role: 'code-writer',
        executor: { kind: 'kimi-cli', model: 'kimi-code/kimi-for-coding' },
        authority: { read: ['spec.json'], write: ['generated/src'], forbiddenRead: ['generated/tests'], forbiddenWrite: [] },
        inputs: [specRef],
        outputs: ['generated/src'],
      },
      {
        stageId: 'stage-test',
        role: 'test-writer',
        executor: { kind: 'openrouter', model: 'upstage/solar-pro-3' },
        authority: { read: ['spec.json'], write: ['generated/tests'], forbiddenRead: ['generated/src'], forbiddenWrite: [] },
        inputs: [specRef],
        outputs: ['generated/tests'],
      },
    ],
    feedbackPolicy: { codeWriterSees: 'aggregate_only' },
    stateless: true,
  };
  writeFileSync(join(runDir, 'plan.json'), JSON.stringify(plan));
  const planRef = { path: 'plan.json', sha256: await sha256Of(join(runDir, 'plan.json')) };

  writeFileSync(join(runDir, 'artifacts/code/generated/src/add.js'), 'module.exports = { add: (a,b) => a - b };\n');
  writeFileSync(
    join(runDir, 'artifacts/tests/generated/tests/add.test.js'),
    "const { add } = require('../src/add.js');\n"
  );
  const codeManifest = {
    version: 'lyo.code.v1',
    specRef,
    files: [{ path: 'artifacts/code/generated/src/add.js', sha256: await sha256Of(join(runDir, 'artifacts/code/generated/src/add.js')) }],
    language: 'javascript',
  };
  writeFileSync(join(runDir, 'artifacts/code/manifest.json'), JSON.stringify(codeManifest));
  const testManifest = {
    version: 'lyo.test.v1',
    specRef,
    files: [{ path: 'artifacts/tests/generated/tests/add.test.js', sha256: await sha256Of(join(runDir, 'artifacts/tests/generated/tests/add.test.js')) }],
    language: 'javascript',
    framework: 'node:test',
    frozen: true,
  };
  writeFileSync(join(runDir, 'artifacts/tests/manifest.json'), JSON.stringify(testManifest));

  const codeRef = { path: 'artifacts/code/manifest.json', sha256: await sha256Of(join(runDir, 'artifacts/code/manifest.json')) };
  const testRef = { path: 'artifacts/tests/manifest.json', sha256: await sha256Of(join(runDir, 'artifacts/tests/manifest.json')) };

  writeFileSync(join(runDir, 'verify-tap/tap.round-1.txt'), TAP);
  const report = failing
    ? {
        version: 'lyo.verifier-report.v1',
        specRef,
        codeRef,
        testRef,
        counts: { total: 3, passed: 1, failed: 2 },
        outcome: 'fail',
        perTest: [
          { name: 'adds positive integers', status: 'pass' },
          { name: 'handles overflow', status: 'fail' },
          { name: 'is commutative', status: 'fail' },
        ],
      }
    : {
        version: 'lyo.verifier-report.v1',
        specRef,
        codeRef,
        testRef,
        counts: { total: 3, passed: 3, failed: 0 },
        outcome: 'pass',
        perTest: [
          { name: 'adds positive integers', status: 'pass' },
          { name: 'handles overflow', status: 'pass' },
          { name: 'is commutative', status: 'pass' },
        ],
      };
  writeFileSync(join(runDir, 'verifier-report.json'), JSON.stringify(report));

  const trace = {
    version: 'lyo.trace.v1',
    runId,
    planRef,
    stages: [
      { stageId: 'stage-code', inputs: [specRef], outputs: [codeRef], model: 'kimi-code/kimi-for-coding', startedAt: '2026-07-26T00:00:00.000Z', finishedAt: '2026-07-26T00:01:00.000Z' },
      { stageId: 'stage-test', inputs: [specRef], outputs: [testRef], model: 'upstage/solar-pro-3', startedAt: '2026-07-26T00:00:00.000Z', finishedAt: '2026-07-26T00:01:10.000Z' },
      { stageId: 'stage-verify', inputs: [codeRef, testRef], outputs: [], startedAt: '2026-07-26T00:01:10.000Z', finishedAt: '2026-07-26T00:01:20.000Z' },
    ],
    startedAt: '2026-07-26T00:00:00.000Z',
    finishedAt: '2026-07-26T00:01:20.000Z',
  };
  writeFileSync(join(runDir, 'trace.json'), JSON.stringify(trace));
  return runDir;
}

const JUDGMENT = {
  classification: 'test-hallucination',
  rationale: 'The test asserts behavior the spec never states.',
  evidence: 'assert.deepEqual(add(MAX), 9007199254740991)',
  lesson: 'Test writers must not assert behavior beyond the written spec.',
};

test('loadRunEvidence + extractDisagreements surfaces each failing test with its TAP excerpt', async () => {
  await withTmp(async (dir) => {
    const runDir = await makeRunDir(dir, 'run-a');
    const evidence = await loadRunEvidence(runDir);
    assert.equal(evidence.report.outcome, 'fail');
    assert.equal(evidence.codeFiles.length, 1);

    const disagreements = extractDisagreements(evidence);
    assert.equal(disagreements.length, 2);
    assert.equal(disagreements[0].testName, 'handles overflow');
    assert.match(disagreements[0].tapExcerpt, /9007199254740991/);
    assert.equal(disagreements[1].testName, 'is commutative');
    assert.match(disagreements[1].tapExcerpt, /assertion failed/);
    assert.match(disagreements[0].specText, /add-spec/);
    assert.match(disagreements[0].codeFiles[0].content, /a - b/);
  });
});

test('parseJudgeResponse tolerates fenced JSON', () => {
  const parsed = parseJudgeResponse(
    '```json\n{"classification":"spec-gap","rationale":"r","evidence":"e","lesson":"l","spec_edit":"s"}\n```'
  );
  assert.equal(parsed.classification, 'spec-gap');
  assert.equal(parsed.specEdit, 's');
  assert.throws(() => parseJudgeResponse('{"classification":"weird"}'), /classification/);
});

test('consumeTraces judges each disagreement and emits a valid lyo-update with candidates', async () => {
  await withTmp(async (dir) => {
    const runDir = await makeRunDir(dir, 'run-a');
    const judgeCalls = [];
    const result = await consumeTraces({
      runDirs: [runDir],
      judge: async (input) => {
        judgeCalls.push(input);
        return JUDGMENT;
      },
    });

    assert.equal(judgeCalls.length, 2);
    assert.match(judgeCalls[0].specText, /add-spec/);
    assert.match(judgeCalls[0].tapExcerpt, /9007199254740991/);

    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.equal(validateLyoUpdate(update).ok, true);
    assert.equal(update.basedOnTraces.length, 1);
    assert.equal(update.promotions.length, 1);
    assert.equal(update.promotions[0].scope, 'candidate');
    assert.match(update.promotions[0].rationale, /test-hallucination/);

    const analysis = readFileSync(result.analysisPath, 'utf8');
    assert.match(analysis, /handles overflow/);
    assert.match(analysis, /test-hallucination/);
    assert.match(analysis, /asserts behavior the spec never states/);
  });
});

test('a lesson seen in two runs is promoted to future-runs scope', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => JUDGMENT,
    });

    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.equal(validateLyoUpdate(update).ok, true);
    assert.equal(update.basedOnTraces.length, 2);
    const scopes = update.promotions.map((promotion) => promotion.scope);
    assert.ok(scopes.includes('future-runs'));
  });
});

test('consumeTraces installs promoted lessons into the library dir', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const libraryDir = join(dir, 'library');
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => JUDGMENT,
      libraryDir,
    });

    assert.equal(result.installedLessons.length, 1);
    const installed = readFileSync(result.installedLessons[0], 'utf8');
    assert.match(installed, /must not assert behavior beyond the written spec/);
  });
});

test('consumeTraces does not install single-run candidates into the library', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const libraryDir = join(dir, 'library');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => JUDGMENT,
      libraryDir,
    });
    assert.deepEqual(result.installedLessons, []);
  });
});

test('lessons with the same classification but different phrasing group across runs', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const phrasings = [
      'Test writers must not assert behavior beyond the written spec.',
      'Never freeze an expectation that the spec text does not determine.',
    ];
    let call = 0;
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => {
        call++;
        return { ...JUDGMENT, lesson: phrasings[call <= 2 ? 0 : 1] };
      },
    });

    const promoted = JSON.parse(readFileSync(result.updatePath, 'utf8')).promotions;
    const futureRuns = promoted.filter((promotion) => promotion.scope === 'future-runs');
    assert.equal(futureRuns.length, 1);
    assert.match(futureRuns[0].rationale, /2 run\(s\)/);
  });
});

test('strict gate blocks promotion when observations come from a single spec', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => JUDGMENT,
      gate: { mode: 'strict' },
    });
    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.deepEqual(
      update.promotions.map((promotion) => promotion.scope),
      ['candidate']
    );
    assert.match(update.promotions[0].rationale, /1 spec/);
  });
});

test('strict gate promotes across two specs once Wilson n is sufficient', async () => {
  await withTmp(async (dir) => {
    // Wilson lower bound at 2/2 is ~0.34 < 0.5 — two clean observations are
    // never enough in strict mode. At 4/4 it crosses 0.5.
    const runs = [];
    for (const [index, specId] of ['spec-one', 'spec-one', 'spec-two', 'spec-two'].entries()) {
      runs.push(await makeRunDir(dir, `run-${index}`, { specId }));
    }
    const result = await consumeTraces({
      runDirs: runs,
      judge: async () => JUDGMENT,
      gate: { mode: 'strict' },
    });
    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.deepEqual(
      update.promotions.map((promotion) => promotion.scope),
      ['future-runs']
    );
    assert.match(update.promotions[0].rationale, /2 spec/);
    assert.match(update.promotions[0].rationale, /helpful=4 harmful=0/);
  });
});

test('strict gate hard-blocks on a weaken event; permissive ignores it', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a', { specId: 'spec-one' });
    const runB = await makeRunDir(dir, 'run-b', { specId: 'spec-two' });
    const cleanRun = await makeRunDir(dir, 'run-clean', { specId: 'spec-one', failing: false });

    const strict = await consumeTraces({
      runDirs: [runA, runB, cleanRun],
      judge: async () => JUDGMENT,
      gate: { mode: 'strict' },
    });
    const strictUpdate = JSON.parse(readFileSync(strict.updatePath, 'utf8'));
    assert.deepEqual(
      strictUpdate.promotions.map((promotion) => promotion.scope),
      ['candidate']
    );
    assert.match(strictUpdate.promotions[0].rationale, /harmful=1/);

    const permissive = await consumeTraces({
      runDirs: [runA, runB, cleanRun],
      judge: async () => JUDGMENT,
      gate: { mode: 'permissive' },
    });
    const permissiveUpdate = JSON.parse(readFileSync(permissive.updatePath, 'utf8'));
    assert.deepEqual(
      permissiveUpdate.promotions.map((promotion) => promotion.scope),
      ['future-runs']
    );
  });
});
