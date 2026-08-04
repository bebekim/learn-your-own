import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  consumeTraces,
  extractDisagreements,
  loadLessons,
  loadRunEvidence,
  parseJudgeResponse,
  selectLessons,
  validateLyoUpdate,
  validateSpecProposal,
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

async function makeRunDir(root, runId, { specId = 'add-spec', failing = true, deliveredLessonPaths = [] } = {}) {
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
      { stageId: 'stage-test', inputs: [specRef, ...deliveredLessonPaths.map((path) => ({ path, sha256: 'f'.repeat(64) }))], outputs: [testRef], model: 'upstage/solar-pro-3', startedAt: '2026-07-26T00:00:00.000Z', finishedAt: '2026-07-26T00:01:10.000Z' },
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
  falsifiableBy: 'a frozen test asserting behavior absent from the spec that a judge verifies as correct',
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
    '```json\n{"classification":"spec-gap","rationale":"r","evidence":"e","lesson":"l","spec_edit":"s","falsifiable_by":"f"}\n```'
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
    assert.match(futureRuns[0].rationale, /runs=2/);
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
    assert.match(update.promotions[0].rationale, /specs=1/);
  });
});

test('strict gate promotes across two specs once evidence crosses the boundary', async () => {
  await withTmp(async (dir) => {
    // Four recurrences across two specs: E = 5^4 = 625, well past the strict
    // threshold of 20. Two runs (E=25) also cross; what strict adds is minSpecs.
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
    assert.match(update.promotions[0].rationale, /specs=2/);
    assert.match(update.promotions[0].rationale, /runs=4, clean=0/);
  });
});

test('one weaken event: strict boundary holds, permissive promotes', async () => {
  await withTmp(async (dir) => {
    // [1,1,clean] → E ≈ 13.9: above the permissive threshold (10), below
    // the strict one (20). Clean runs are arithmetic, not a veto.
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
    assert.match(strictUpdate.promotions[0].rationale, /clean=1/);

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

test('judge vehicle and prompt_patch flow into the lesson file', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => ({
        ...JUDGMENT,
        vehicle: 'skeleton-patch',
        promptPatch: 'const num = (x) => x + 0;\nassert.equal(num(f(a,b)), num(-f(b,a)));',
      }),
    });
    const lesson = readFileSync(
      JSON.parse(readFileSync(result.updatePath, 'utf8')).promotions[0].artifactRef.path.startsWith('lyo-lessons')
        ? join(result.updatePath, '..', JSON.parse(readFileSync(result.updatePath, 'utf8')).promotions[0].artifactRef.path)
        : JSON.parse(readFileSync(result.updatePath, 'utf8')).promotions[0].artifactRef.path,
      'utf8'
    );
    assert.match(lesson, /- vehicle: skeleton-patch/);
    assert.match(lesson, /## Prompt patch/);
    assert.match(lesson, /const num = \(x\) => x \+ 0/);
  });
});

test('parseJudgeResponse maps vehicle and prompt_patch, defaulting to prose', () => {
  const parsed = parseJudgeResponse(
    '{"classification":"test-hallucination","rationale":"r","evidence":"e","lesson":"l","vehicle":"skeleton-patch","prompt_patch":"code()","falsifiable_by":"f"}'
  );
  assert.equal(parsed.vehicle, 'skeleton-patch');
  assert.equal(parsed.promptPatch, 'code()');

  const noVehicle = parseJudgeResponse(
    '{"classification":"spec-gap","rationale":"r","evidence":"e","lesson":"l","vehicle":"bogus","falsifiable_by":"f"}'
  );
  assert.equal(noVehicle.vehicle, 'prose');
  assert.equal(noVehicle.promptPatch, undefined);
});

test('judge must state what observation would falsify the lesson', () => {
  const parsed = parseJudgeResponse(
    '{"classification":"test-hallucination","rationale":"r","evidence":"e","lesson":"l","falsifiable_by":"a passing run whose tests assert behavior absent from the spec"}'
  );
  assert.equal(parsed.falsifiableBy, 'a passing run whose tests assert behavior absent from the spec');

  assert.throws(
    () =>
      parseJudgeResponse(
        '{"classification":"test-hallucination","rationale":"r","evidence":"e","lesson":"always be careful"}'
      ),
    /falsifiable/
  );
});

test('unfalsifiable lessons are marked undeliverable and not installed', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const libraryDir = join(dir, 'library');
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => ({ ...JUDGMENT, falsifiableBy: undefined }),
      libraryDir,
    });

    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.equal(update.promotions.length, 1);
    assert.equal(update.promotions[0].scope, 'undeliverable');
    assert.deepEqual(result.installedLessons, []);
  });
});

test('falsifiable lessons are installed; undeliverable ones never load', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const runB = await makeRunDir(dir, 'run-b');
    const libraryDir = join(dir, 'library');
    await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => ({ ...JUDGMENT, falsifiableBy: 'a run where X does Y' }),
      libraryDir,
    });

    const lessons = loadLessons(libraryDir);
    assert.equal(lessons.length, 1);
    assert.equal(lessons[0].falsifiableBy, 'a run where X does Y');
    const selected = selectLessons(lessons, { role: 'test-writer', rng: () => 0.5 });
    assert.equal(selected.length, 1);
  });
});

test('lyo-update pins the judge model and rubric hash into the artifact', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => JUDGMENT,
      judgeModel: 'anthropic/claude-sonnet-5',
    });

    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.equal(validateLyoUpdate(update).ok, true);
    assert.equal(update.producer.judgeModel, 'anthropic/claude-sonnet-5');
    assert.match(update.producer.judgePromptSha256, /^[0-9a-f]{64}$/);
  });
});

test('producer reflects the default judge model when none is passed', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => JUDGMENT,
    });
    const update = JSON.parse(readFileSync(result.updatePath, 'utf8'));
    assert.equal(typeof update.producer.judgeModel, 'string');
    assert.ok(update.producer.judgeModel.length > 0);
  });
});

function lessonFile({ title, classification = 'test-hallucination', helpful = 0, harmful = 0 }) {
  return [
    `# ${title}`,
    '',
    `- classification: ${classification}`,
    `- falsifiable_by: a run contradicting the rule`,
    `- helpful: ${helpful}`,
    `- harmful: ${harmful}`,
    '',
  ].join('\n');
}

test('a delivered lesson whose class recurs is charged harmful', async () => {
  await withTmp(async (dir) => {
    const libraryDir = join(dir, 'library');
    mkdirSync(libraryDir, { recursive: true });
    const lessonPath = join(libraryDir, 'lesson-a.md');
    writeFileSync(lessonPath, lessonFile({ title: 'NO HALLUCINATIONS' }));

    // Both runs fail with the same class the lesson targets → harmful credit.
    const runA = await makeRunDir(dir, 'run-a', { deliveredLessonPaths: [lessonPath] });
    const runB = await makeRunDir(dir, 'run-b', { deliveredLessonPaths: [lessonPath] });
    const result = await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => JUDGMENT,
      libraryDir,
    });

    const lesson = loadLessons(libraryDir).find((entry) => entry.path === lessonPath);
    assert.equal(lesson.harmful, 2);
    assert.equal(lesson.helpful, 0);
    assert.ok(result.appliedCredits.length > 0);
  });
});

test('a delivered lesson whose class stops recurring earns helpful', async () => {
  await withTmp(async (dir) => {
    const libraryDir = join(dir, 'library');
    mkdirSync(libraryDir, { recursive: true });
    const lessonPath = join(libraryDir, 'lesson-a.md');
    writeFileSync(lessonPath, lessonFile({ title: 'NO HALLUCINATIONS' }));

    // run-a establishes the class exists (failing, lesson not delivered);
    // run-b delivers the lesson and passes clean → helpful credit.
    const runA = await makeRunDir(dir, 'run-a', { failing: true });
    const runB = await makeRunDir(dir, 'run-b', { failing: false, deliveredLessonPaths: [lessonPath] });
    await consumeTraces({
      runDirs: [runA, runB],
      judge: async () => JUDGMENT,
      libraryDir,
    });

    const lesson = loadLessons(libraryDir).find((entry) => entry.path === lessonPath);
    assert.equal(lesson.helpful, 1);
    assert.equal(lesson.harmful, 0);
  });
});

test('no credit when the class was never expected or the lesson never delivered', async () => {
  await withTmp(async (dir) => {
    const libraryDir = join(dir, 'library');
    mkdirSync(libraryDir, { recursive: true });
    const lessonPath = join(libraryDir, 'lesson-a.md');
    writeFileSync(lessonPath, lessonFile({ title: 'NO HALLUCINATIONS' }));

    // single clean run: class never seen before, lesson delivered — no credit
    const runA = await makeRunDir(dir, 'run-a', { failing: false, deliveredLessonPaths: [lessonPath] });
    await consumeTraces({ runDirs: [runA], judge: async () => JUDGMENT, libraryDir });
    let [lesson] = loadLessons(libraryDir);
    assert.equal(lesson.helpful, 0);
    assert.equal(lesson.harmful, 0);

    // lesson exists but was never delivered in this failing run — no credit
    const runB = await makeRunDir(dir, 'run-b', { failing: true });
    await consumeTraces({ runDirs: [runB], judge: async () => JUDGMENT, libraryDir });
    [lesson] = loadLessons(libraryDir);
    assert.equal(lesson.helpful + lesson.harmful, 0);
  });
});

test('mechanical disagreements skip the judge; semantic ones still call it', async () => {
  await withTmp(async (dir) => {
    const runDir = await makeRunDir(dir, 'run-a');
    // Plant a mechanical failure in the report + TAP: ReferenceError variant.
    const { readFileSync: read, writeFileSync: write } = await import('node:fs');
    const { join: j } = await import('node:path');
    const reportPath = j(runDir, 'verifier-report.json');
    const report = JSON.parse(read(reportPath, 'utf8'));
    report.perTest[1] = { name: 'handles overflow', status: 'fail' };
    report.perTest[2] = { name: 'is commutative', status: 'fail' };
    write(j(runDir, 'verify-tap', 'tap.round-1.txt'),
      "not ok 1 - handles overflow\n  error: 'a is not defined'\n  name: 'ReferenceError'\nnot ok 2 - is commutative\n  error: |-\n    + 4\n    - 5\n");

    const judgeCalls = [];
    await consumeTraces({
      runDirs: [runDir],
      judge: async (input) => {
        judgeCalls.push(input.testName);
        return JUDGMENT;
      },
    });

    assert.deepEqual(judgeCalls, ['is commutative'],
      'ReferenceError disagreement must not reach the judge');
  });
});

test('spec-gap judgments with spec_edit become proposal artifacts', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => ({
        classification: 'spec-gap',
        rationale: 'spec silent on unquoted quotes',
        evidence: 'mixed quoted and unquoted fields',
        lesson: 'specs must define quote handling in unquoted fields',
        specEdit: 'Add: quote characters inside unquoted fields are literal.',
        falsifiableBy: 'a test on unquoted quote handling that the spec now determines',
      }),
    });

    assert.equal(result.proposals.length, 1);
    const proposal = JSON.parse(
      readFileSync(join(result.proposalsDir, result.proposals[0].proposalId + '.json'), 'utf8')
    );
    assert.equal(validateSpecProposal(proposal).ok, true);
    assert.equal(proposal.status, 'pending');
    assert.equal(proposal.specId, 'add-spec');
    assert.match(proposal.edit, /literal/);
    assert.deepEqual(proposal.sourceRuns, ['run-a']);
  });
});

test('non-spec-gap judgments produce no proposals', async () => {
  await withTmp(async (dir) => {
    const runA = await makeRunDir(dir, 'run-a');
    const result = await consumeTraces({
      runDirs: [runA],
      judge: async () => JUDGMENT, // test-hallucination
    });
    assert.deepEqual(result.proposals, []);
  });
});
