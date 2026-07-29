import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  compareRuns,
  installPromotedLessons,
  isDemoted,
  lessonsForRole,
  loadLessons,
  recordLessonOutcome,
  renderLessonsBlock,
  renderPatchBlock,
  selectLessons,
} from '../src/index.ts';

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-delivery-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const TEST_LESSON_MD = [
  '# Derive expected values by mechanically applying the spec algorithm.',
  '',
  '- classification: test-hallucination',
  '- observed in runs: run-a',
  '- status: promoted',
  '',
  '## Rationale',
  'The test asserted behavior the spec never states.',
  '',
  '## Evidence',
  "assert.deepEqual(parseCsvLine('x'), ['y'])",
  '',
].join('\n');

const CODE_LESSON_MD = [
  '# Export names exactly as the spec signatures declare them.',
  '',
  '- classification: code-bug',
  '- observed in runs: run-a, run-b',
  '- status: promoted',
  '',
  '## Rationale',
  'The implementation deviated from the declared export form.',
  '',
].join('\n');

const SPEC_GAP_LESSON_MD = [
  '# Specs must define quote handling for unquoted fields.',
  '',
  '- classification: spec-gap',
  '- observed in runs: run-a',
  '- status: promoted',
  '',
].join('\n');

function writeLibrary(dir) {
  writeFileSync(join(dir, 'lesson-test.md'), TEST_LESSON_MD);
  writeFileSync(join(dir, 'lesson-code.md'), CODE_LESSON_MD);
  writeFileSync(join(dir, 'lesson-spec.md'), SPEC_GAP_LESSON_MD);
}

test('loadLessons parses title, classification, and hash from lesson files', () => {
  withTmp((dir) => {
    writeLibrary(dir);
    const lessons = loadLessons(dir);
    assert.equal(lessons.length, 3);
    const testLesson = lessons.find((lesson) => lesson.classification === 'test-hallucination');
    assert.equal(
      testLesson.title,
      'Derive expected values by mechanically applying the spec algorithm.'
    );
    assert.match(testLesson.sha256, /^[0-9a-f]{64}$/);
  });
});

test('lessonsForRole routes lessons to the blind-safe stage only', () => {
  withTmp((dir) => {
    writeLibrary(dir);
    const lessons = loadLessons(dir);

    const forTestWriter = lessonsForRole(lessons, 'test-writer');
    assert.deepEqual(
      forTestWriter.map((lesson) => lesson.classification),
      ['test-hallucination']
    );

    const forCodeWriter = lessonsForRole(lessons, 'code-writer');
    assert.deepEqual(
      forCodeWriter.map((lesson) => lesson.classification),
      ['code-bug']
    );

    // spec-gap lessons are never injected — the spec belongs to humans.
    assert.deepEqual(lessonsForRole(lessons, 'verifier'), []);
  });
});

test('renderLessonsBlock renders titles only, never evidence', () => {
  withTmp((dir) => {
    writeLibrary(dir);
    const lessons = lessonsForRole(loadLessons(dir), 'test-writer');
    const block = renderLessonsBlock(lessons);
    assert.match(block, /Promoted lessons/);
    assert.match(block, /mechanically applying the spec algorithm/);
    assert.equal(block.includes('assert.deepEqual'), false);
    assert.equal(renderLessonsBlock([]), '');
  });
});

test('installPromotedLessons copies only future-runs lessons into the library', () => {
  withTmp((dir) => {
    const runDir = join(dir, 'run-a');
    mkdirSync(join(runDir, 'lyo-lessons'), { recursive: true });
    writeFileSync(join(runDir, 'lyo-lessons/promoted.md'), TEST_LESSON_MD);
    writeFileSync(join(runDir, 'lyo-lessons/candidate.md'), CODE_LESSON_MD);
    const ref = (path) => ({
      path,
      sha256: createHash('sha256').update(readFileSync(join(runDir, path))).digest('hex'),
    });
    const update = {
      version: 'lyo.lyo-update.v0',
      basedOnTraces: [],
      promotions: [
        { artifactRef: ref('lyo-lessons/promoted.md'), scope: 'future-runs', rationale: 'seen twice' },
        { artifactRef: ref('lyo-lessons/candidate.md'), scope: 'candidate', rationale: 'seen once' },
      ],
    };

    const libraryDir = join(dir, 'library');
    const installed = installPromotedLessons({ update, sourceDir: runDir, libraryDir });

    assert.deepEqual(installed.map((path) => path.split('/').pop()), ['promoted.md']);
    assert.match(readFileSync(join(libraryDir, 'promoted.md'), 'utf8'), /mechanically applying/);
    assert.equal(
      existsSyncSafe(join(libraryDir, 'candidate.md')),
      false
    );
  });
});

function existsSyncSafe(path) {
  try {
    readFileSync(path);
    return true;
  } catch {
    return false;
  }
}

function writeReport(runDir, { outcome, passed, failed }) {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, 'verifier-report.json'),
    JSON.stringify({
      version: 'lyo.verifier-report.v1',
      specRef: { path: 'spec.json', sha256: 'a'.repeat(64) },
      codeRef: { path: 'c', sha256: 'b'.repeat(64) },
      testRef: { path: 't', sha256: 'c'.repeat(64) },
      counts: { total: passed + failed, passed, failed },
      outcome,
    })
  );
}

test('compareRuns renders improved, regressed, and unchanged verdicts', () => {
  withTmp((dir) => {
    writeReport(join(dir, 'fail-run'), { outcome: 'fail', passed: 8, failed: 4 });
    writeReport(join(dir, 'pass-run'), { outcome: 'pass', passed: 12, failed: 0 });

    const improved = compareRuns({
      baselineDir: join(dir, 'fail-run'),
      treatmentDir: join(dir, 'pass-run'),
    });
    assert.equal(improved.verdict, 'improved');
    assert.equal(improved.failedDelta, -4);
    assert.deepEqual(improved.baseline.counts, { total: 12, passed: 8, failed: 4 });
    assert.deepEqual(improved.treatment.counts, { total: 12, passed: 12, failed: 0 });

    const regressed = compareRuns({
      baselineDir: join(dir, 'pass-run'),
      treatmentDir: join(dir, 'fail-run'),
    });
    assert.equal(regressed.verdict, 'regressed');

    const unchanged = compareRuns({
      baselineDir: join(dir, 'pass-run'),
      treatmentDir: join(dir, 'pass-run'),
    });
    assert.equal(unchanged.verdict, 'unchanged');
  });
});

test('selectLessons caps delivery per role and excludes other roles', () => {
  withTmp((dir) => {
    const mk = (name, classification, runs, title) =>
      writeFileSync(
        join(dir, name),
        `# ${title}\n\n- classification: ${classification}\n- observed in runs: ${runs.join(', ')}\n`
      );
    mk('a.md', 'test-hallucination', ['r1'], 'LESSON A');
    mk('b.md', 'test-hallucination', ['r1', 'r2', 'r3'], 'LESSON B');
    mk('c.md', 'test-hallucination', ['r1', 'r2'], 'LESSON C');
    mk('d.md', 'test-hallucination', ['r1'], 'LESSON D');
    mk('e.md', 'code-bug', ['r1'], 'CODE LESSON E');

    const selected = selectLessons(loadLessons(dir), { role: 'test-writer', limit: 3, rng: () => 0.5 });
    assert.equal(selected.length, 3);
    assert.ok(selected.every((lesson) => lesson.classification === 'test-hallucination'));

    const codeSelected = selectLessons(loadLessons(dir), { role: 'code-writer', rng: () => 0.5 });
    assert.deepEqual(codeSelected.map((lesson) => lesson.title), ['CODE LESSON E']);
  });
});

test('compareRuns compares failure counts, not suite sizes', () => {
  withTmp((dir) => {
    // Both runs pass 100%, but the suites differ in size — a larger suite is
    // not an improvement.
    writeReport(join(dir, 'small-suite'), { outcome: 'pass', passed: 25, failed: 0 });
    writeReport(join(dir, 'large-suite'), { outcome: 'pass', passed: 27, failed: 0 });
    const comparison = compareRuns({
      baselineDir: join(dir, 'small-suite'),
      treatmentDir: join(dir, 'large-suite'),
    });
    assert.equal(comparison.verdict, 'unchanged');
    assert.equal(comparison.failedDelta, 0);
  });
});

const PATCH_LESSON_MD = [
  '# Normalize numeric assertions with +0 after all negation.',
  '',
  '- classification: test-hallucination',
  '- vehicle: skeleton-patch',
  '- observed in runs: r1, r2',
  '',
  '## Prompt patch',
  '```js',
  'const num = (x) => x + 0;',
  '',
  "test('antisymmetry: f(a,b) === -f(b,a)', () => {",
  '  assert.equal(num(f(a, b)), num(-f(b, a)));',
  '});',
  '```',
  '',
].join('\n');

test('loadLessons parses vehicle and prompt patch, defaulting to prose', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, 'patch.md'), PATCH_LESSON_MD);
    writeFileSync(join(dir, 'plain.md'), TEST_LESSON_MD);
    const lessons = loadLessons(dir);

    const patch = lessons.find((lesson) => lesson.title.includes('Normalize'));
    assert.equal(patch.vehicle, 'skeleton-patch');
    assert.match(patch.promptPatch, /const num = \(x\) => x \+ 0/);

    const plain = lessons.find((lesson) => lesson.title.includes('mechanically'));
    assert.equal(plain.vehicle, 'prose');
    assert.equal(plain.promptPatch, undefined);
  });
});

test('renderPatchBlock renders imitable code, not advice', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, 'patch.md'), PATCH_LESSON_MD);
    const patch = loadLessons(dir)[0];
    const block = renderPatchBlock([patch]);
    assert.match(block, /Promoted lesson patterns/);
    assert.match(block, /const num = \(x\) => x \+ 0/);
    assert.match(block, /num\(f\(a, b\)\)/);
    assert.equal(renderPatchBlock([]), '');
  });
});

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function lessonMd({ title, classification = 'test-hallucination', helpful = 0, harmful = 0, runs = ['r1'] }) {
  return [
    `# ${title}`,
    '',
    `- classification: ${classification}`,
    `- helpful: ${helpful}`,
    `- harmful: ${harmful}`,
    `- observed in runs: ${runs.join(', ')}`,
    '',
  ].join('\n');
}

test('loadLessons parses helpful and harmful counters', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, 'a.md'), lessonMd({ title: 'LESSON A', helpful: 3, harmful: 1 }));
    const [lesson] = loadLessons(dir);
    assert.equal(lesson.helpful, 3);
    assert.equal(lesson.harmful, 1);
  });
});

test('selectLessons is a posterior policy: outcomes beat observation counts', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, 'a.md'), lessonMd({ title: 'OFTEN SEEN ALWAYS WRONG', helpful: 0, harmful: 4, runs: ['r1', 'r2', 'r3', 'r4', 'r5'] }));
    writeFileSync(join(dir, 'b.md'), lessonMd({ title: 'RARELY SEEN ALWAYS RIGHT', helpful: 3, harmful: 0, runs: ['r1'] }));
    const lessons = loadLessons(dir);
    for (const seed of [1, 42, 1337]) {
      const selected = selectLessons(lessons, { role: 'test-writer', limit: 2, rng: lcg(seed) });
      assert.equal(selected[0].title, 'RARELY SEEN ALWAYS RIGHT', `seed ${seed}`);
    }
  });
});

test('selectLessons demotes lessons that only ever failed', () => {
  withTmp((dir) => {
    writeFileSync(join(dir, 'a.md'), lessonMd({ title: 'HARMFUL LESSON', helpful: 0, harmful: 2 }));
    writeFileSync(join(dir, 'b.md'), lessonMd({ title: 'UNPROVEN LESSON', helpful: 0, harmful: 0 }));
    const selected = selectLessons(loadLessons(dir), { role: 'test-writer', limit: 3, rng: lcg(7) });
    assert.deepEqual(selected.map((lesson) => lesson.title), ['UNPROVEN LESSON']);
  });
});

test('recordLessonOutcome bumps counters in the lesson file', () => {
  withTmp((dir) => {
    const lessonPath = join(dir, 'a.md');
    writeFileSync(lessonPath, lessonMd({ title: 'LESSON A' }));
    let lesson = recordLessonOutcome({ lessonPath, outcome: 'helpful' });
    assert.equal(lesson.helpful, 1);
    lesson = recordLessonOutcome({ lessonPath, outcome: 'harmful' });
    lesson = recordLessonOutcome({ lessonPath, outcome: 'harmful' });
    assert.equal(lesson.harmful, 2);
    assert.equal(isDemoted(lesson), false, 'helped once, so not demoted');

    const demotedPath = join(dir, 'b.md');
    writeFileSync(demotedPath, lessonMd({ title: 'LESSON B' }));
    recordLessonOutcome({ lessonPath: demotedPath, outcome: 'harmful' });
    const demoted = recordLessonOutcome({ lessonPath: demotedPath, outcome: 'harmful' });
    assert.equal(isDemoted(demoted), true);
  });
});
