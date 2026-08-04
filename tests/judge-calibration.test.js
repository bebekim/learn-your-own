import assert from 'node:assert/strict';
import test from 'node:test';

import { runJudgeCalibration } from '../src/index.ts';

const CASES = [
  {
    name: 'clear hallucination',
    input: { testName: 't', specText: '{}', codeFiles: [], testFiles: [], tapExcerpt: 'x' },
    expected: 'test-hallucination',
  },
  {
    name: 'clear code bug',
    input: { testName: 't2', specText: '{}', codeFiles: [], testFiles: [], tapExcerpt: 'y' },
    expected: 'code-bug',
  },
  {
    name: 'clear spec gap',
    input: { testName: 't3', specText: '{}', codeFiles: [], testFiles: [], tapExcerpt: 'z' },
    expected: 'spec-gap',
  },
];

const JUDGMENT_FOR = (classification) => ({
  classification,
  rationale: 'r',
  evidence: 'e',
  lesson: 'l',
  falsifiableBy: 'f',
});

test('calibration scores the judge against known verdicts', async () => {
  const result = await runJudgeCalibration({
    cases: CASES,
    judge: async (input) => JUDGMENT_FOR(input.testName === 't3' ? 'code-bug' : CASES.find((c) => c.input.testName === input.testName).expected),
  });

  assert.equal(result.total, 3);
  assert.equal(result.correct, 2);
  assert.ok(Math.abs(result.accuracy - 2 / 3) < 1e-9);
  assert.deepEqual(
    result.perCase.map((entry) => entry.match),
    [true, true, false]
  );
  assert.equal(result.perCase[2].expected, 'spec-gap');
  assert.equal(result.perCase[2].actual, 'code-bug');
});

test('a perfect judge scores 1.0', async () => {
  const result = await runJudgeCalibration({
    cases: CASES,
    judge: async (input) => JUDGMENT_FOR(CASES.find((c) => c.input.testName === input.testName).expected),
  });
  assert.equal(result.accuracy, 1);
});

test('calibration fails loudly on a judge error per case, not silently', async () => {
  const result = await runJudgeCalibration({
    cases: CASES.slice(0, 1),
    judge: async () => {
      throw new Error('judge exploded');
    },
  });
  assert.equal(result.perCase[0].match, false);
  assert.match(result.perCase[0].error, /exploded/);
  assert.equal(result.accuracy, 0);
});
