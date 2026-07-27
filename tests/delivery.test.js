import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  compareRuns,
  installPromotedLessons,
  lessonsForRole,
  loadLessons,
  renderLessonsBlock,
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

test('selectLessons caps delivery and orders by evidence then recency', () => {
  withTmp((dir) => {
    const mk = (name, classification, runs, title) =>
      writeFileSync(
        join(dir, name),
        `# ${title}\n\n- classification: ${classification}\n- observed in runs: ${runs.join(', ')}\n`
      );
    mk('a.md', 'test-hallucination', ['r1'], 'LESSON A one run');
    mk('b.md', 'test-hallucination', ['r1', 'r2', 'r3'], 'LESSON B three runs');
    mk('c.md', 'test-hallucination', ['r1', 'r2'], 'LESSON C two runs');
    mk('d.md', 'test-hallucination', ['r1'], 'LESSON D one run');
    mk('e.md', 'code-bug', ['r1'], 'CODE LESSON E');

    const selected = selectLessons(loadLessons(dir), { role: 'test-writer', limit: 3 });
    assert.deepEqual(
      selected.map((lesson) => lesson.title),
      ['LESSON B three runs', 'LESSON C two runs', 'LESSON A one run']
    );

    const codeSelected = selectLessons(loadLessons(dir), { role: 'code-writer' });
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
