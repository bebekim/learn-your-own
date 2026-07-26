import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

function writeSource(dir, { spec = SPEC, tamperSpec = false, weakenBlindness = false, maxRounds } = {}) {
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
    feedbackPolicy: {
      codeWriterSees: 'aggregate_only',
      ...(maxRounds === undefined ? {} : { maxRounds }),
    },
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

function iteratingCodeFactory(codePrompts, contentByRound) {
  return (stage) => {
    if (stage.role !== 'code-writer') {
      return fakeExecutorFactory(stage);
    }
    return async ({ prompt, sandboxDir }) => {
      codePrompts.push(prompt);
      const content = contentByRound[Math.min(codePrompts.length, contentByRound.length) - 1];
      mkdirSync(join(sandboxDir, 'generated/src'), { recursive: true });
      writeFileSync(join(sandboxDir, 'generated/src/add.js'), content);
      return { transcript: 'done' };
    };
  };
}

test('runPipeline iterates the code writer with aggregate-only feedback until pass', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 3 });
    const codePrompts = [];
    const factory = iteratingCodeFactory(codePrompts, [
      'module.exports = { add: (a, b) => a - b };\n',
      'module.exports = { add: (a, b) => a + b };\n',
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });

    assert.equal(result.report.outcome, 'pass');
    assert.equal(codePrompts.length, 2);

    assert.equal(codePrompts[0].includes('ITERATION FEEDBACK'), false);
    // The feedback channel carries counts and the writer's own code — nothing else.
    assert.match(codePrompts[1], /0 of 2 checks passed; 2 failed/);
    assert.match(codePrompts[1], /a - b/);
    assert.equal(codePrompts[1].includes('adds positive integers'), false);
    assert.equal(codePrompts[1].includes('add.test.js'), false);

    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    assert.deepEqual(trace.feedback, { rounds: 2, stopReason: 'pass' });
    assert.deepEqual(
      trace.stages.filter((stage) => stage.stageId === 'stage-code').map((stage) => stage.round),
      [1, 2]
    );
  });
});

test('runPipeline stops at maxRounds while still failing', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 2 });
    const codePrompts = [];
    const factory = iteratingCodeFactory(codePrompts, [
      'module.exports = { add: (a, b) => a - b };\n',
      'module.exports = { add: (a, b) => b - a };\n',
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });

    assert.equal(result.report.outcome, 'fail');
    assert.equal(codePrompts.length, 2);
    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    assert.deepEqual(trace.feedback, { rounds: 2, stopReason: 'max_rounds' });
  });
});

test('runPipeline stops early when the code does not change', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 4 });
    const codePrompts = [];
    const broken = 'module.exports = { add: (a, b) => a - b };\n';
    const factory = iteratingCodeFactory(codePrompts, [broken, broken, broken, broken]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });

    assert.equal(result.report.outcome, 'fail');
    assert.equal(codePrompts.length, 2);
    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    assert.deepEqual(trace.feedback, { rounds: 2, stopReason: 'no_change' });
  });
});

test('runPipeline stops when counts do not improve across rounds', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 5 });
    const codePrompts = [];
    const factory = iteratingCodeFactory(codePrompts, [
      'module.exports = { add: (a, b) => a - b };\n',
      'module.exports = { add: (a, b) => b - a };\n',
      'module.exports = { add: (a, b) => a - b + 0 };\n',
      'module.exports = { add: (a, b) => a + b };\n',
      'module.exports = { add: (a, b) => a + b };\n',
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });

    assert.equal(result.report.outcome, 'fail');
    assert.equal(codePrompts.length, 3);
    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    assert.deepEqual(trace.feedback, { rounds: 3, stopReason: 'stuck' });
  });
});

function scriptedCodeFactory(codePrompts, rounds) {
  return (stage) => {
    if (stage.role !== 'code-writer') {
      return fakeExecutorFactory(stage);
    }
    return async ({ prompt, sandboxDir }) => {
      codePrompts.push(prompt);
      const files = rounds[Math.min(codePrompts.length, rounds.length) - 1];
      for (const file of files) {
        const target = join(sandboxDir, file.path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, file.content);
      }
      return { transcript: `round ${codePrompts.length} transcript` };
    };
  };
}

test('runPipeline preserves per-round transcripts and output files', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 3 });
    const codePrompts = [];
    const factory = scriptedCodeFactory(codePrompts, [
      [{ path: 'generated/src/add.js', content: 'module.exports = { add: (a, b) => a - b };\n' }],
      [{ path: 'generated/src/add.js', content: 'module.exports = { add: (a, b) => a + b };\n' }],
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });
    assert.equal(result.report.outcome, 'pass');

    const stageDir = join(result.runDir, 'stages/stage-code');
    assert.match(readFileSync(join(stageDir, 'transcript.round-1.txt'), 'utf8'), /round 1/);
    assert.match(readFileSync(join(stageDir, 'transcript.round-2.txt'), 'utf8'), /round 2/);

    const round1 = readFileSync(
      join(result.runDir, 'artifacts/code/files.round-1/generated/src/add.js'),
      'utf8'
    );
    const round2 = readFileSync(
      join(result.runDir, 'artifacts/code/files.round-2/generated/src/add.js'),
      'utf8'
    );
    assert.match(round1, /a - b/);
    assert.match(round2, /a \+ b/);
  });
});

test('runPipeline removes stale outputs from earlier rounds', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 3 });
    const codePrompts = [];
    const factory = scriptedCodeFactory(codePrompts, [
      [
        { path: 'generated/src/add.js', content: 'module.exports = { add: (a, b) => a - b };\n' },
        { path: 'generated/src/stale.js', content: '// left over from round 1\n' },
      ],
      [{ path: 'generated/src/add.js', content: 'module.exports = { add: (a, b) => a + b };\n' }],
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });
    assert.equal(result.report.outcome, 'pass');

    const manifest = JSON.parse(
      readFileSync(join(result.runDir, 'artifacts/code/manifest.json'), 'utf8')
    );
    assert.equal(manifest.files.length, 1);
    assert.match(manifest.files[0].path, /add\.js$/);
    assert.equal(
      existsSync(join(result.runDir, 'artifacts/code/generated/src/stale.js')),
      false
    );
    assert.equal(existsSync(join(result.runDir, 'verify/generated/src/stale.js')), false);
  });
});

test('runPipeline persists raw verifier TAP output per round', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir, { maxRounds: 3 });
    const codePrompts = [];
    const factory = iteratingCodeFactory(codePrompts, [
      'module.exports = { add: (a, b) => a - b };\n',
      'module.exports = { add: (a, b) => a + b };\n',
    ]);
    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
    });
    const tap1 = readFileSync(join(result.runDir, 'verify-tap/tap.round-1.txt'), 'utf8');
    assert.match(tap1, /not ok \d+ - adds positive integers/);
    const tap2 = readFileSync(join(result.runDir, 'verify-tap/tap.round-2.txt'), 'utf8');
    assert.match(tap2, /ok \d+ - adds positive integers/);
  });
});

test('runPipeline delivers library lessons to the blind-safe stage prompts only', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    const libraryDir = join(dir, 'lessons');
    mkdirSync(libraryDir, { recursive: true });
    writeFileSync(
      join(libraryDir, 'lesson-test.md'),
      '# TEST LESSON TITLE XYZZY\n\n- classification: test-hallucination\n\n## Evidence\nassert.deepEqual(secretTestCode)\n'
    );
    writeFileSync(
      join(libraryDir, 'lesson-code.md'),
      '# CODE LESSON TITLE PLUGH\n\n- classification: code-bug\n'
    );

    const prompts = {};
    const factory = (stage) => async ({ prompt, sandboxDir }) => {
      prompts[stage.role] = prompt;
      if (stage.role === 'code-writer') {
        mkdirSync(join(sandboxDir, 'generated/src'), { recursive: true });
        writeFileSync(
          join(sandboxDir, 'generated/src/add.js'),
          'module.exports = { add: (a, b) => a + b };\n'
        );
        return { transcript: 'code done' };
      }
      return { transcript: TEST_TRANSCRIPT };
    };

    const result = await runPipeline({
      planPath,
      runsRoot: join(dir, 'runs'),
      executorFactory: factory,
      lessonsDir: libraryDir,
    });

    // Each stage receives only its own lesson, as a title, never the evidence.
    assert.match(prompts['code-writer'], /CODE LESSON TITLE PLUGH/);
    assert.equal(prompts['code-writer'].includes('TEST LESSON TITLE XYZZY'), false);
    assert.equal(prompts['code-writer'].includes('secretTestCode'), false);
    assert.match(prompts['test-writer'], /TEST LESSON TITLE XYZZY/);
    assert.equal(prompts['test-writer'].includes('CODE LESSON TITLE PLUGH'), false);
    assert.equal(prompts['test-writer'].includes('secretTestCode'), false);

    // Delivered lessons are declared, hashed trace inputs.
    const trace = JSON.parse(readFileSync(result.tracePath, 'utf8'));
    const codeInputs = trace.stages.find((stage) => stage.stageId === 'stage-code').inputs;
    const testInputs = trace.stages.find((stage) => stage.stageId === 'stage-test').inputs;
    assert.ok(codeInputs.some((input) => input.path.endsWith('lesson-code.md')));
    assert.ok(testInputs.some((input) => input.path.endsWith('lesson-test.md')));
    assert.equal(codeInputs.some((input) => input.path.endsWith('lesson-test.md')), false);
  });
});

test('runPipeline preserves the transcript when a stage fails', async () => {
  await withTmp(async (dir) => {
    const { planPath } = writeSource(dir);
    const factory = (stage) => async () => {
      throw new Error(`${stage.stageId} exploded mid-request`);
    };
    await assert.rejects(
      () => runPipeline({ planPath, runsRoot: join(dir, 'runs'), executorFactory: factory }),
      /exploded mid-request/
    );
    const runsDir = join(dir, 'runs');
    const runDir = join(runsDir, readdirSync(runsDir)[0]);
    const transcript = readFileSync(join(runDir, 'stages/stage-code/transcript.txt'), 'utf8');
    assert.match(transcript, /exploded mid-request/);
  });
});
