import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyMechanically } from '../src/index.ts';

function disagreement(tapExcerpt) {
  return {
    runId: 'run-x',
    testName: 'some test',
    specText: '{}',
    codeFiles: [],
    testFiles: [],
    tapExcerpt,
  };
}

test('ReferenceError in the test file is mechanical test-hallucination', () => {
  const judgment = classifyMechanically(
    disagreement("not ok 1 - antisymmetry\n  error: 'a is not defined'\n  code: 'ERR_TEST_FAILURE'\n  name: 'ReferenceError'\n  location: '/x/generated/tests/semver.test.js:40:34'"
    )
  );
  assert.equal(judgment.classification, 'test-hallucination');
  assert.match(judgment.rationale, /ReferenceError/);
  assert.equal(judgment.source, 'mechanical');
  assert.ok(judgment.falsifiableBy);
});

test('ESM/CJS mismatch is mechanical test-hallucination', () => {
  const judgment = classifyMechanically(
    disagreement("not ok 1 - x\n  error: 'Cannot use import statement outside a module'"
    )
  );
  assert.equal(judgment.classification, 'test-hallucination');
  assert.match(judgment.rationale, /module system|ESM|CommonJS/i);
});

test('the -0/Object.is trap is mechanical test-hallucination', () => {
  const judgment = classifyMechanically(
    disagreement("not ok 1 - antisymmetry\n  error: |-\n    Expected values to be strictly equal:\n    + 0\n    - -0"
    )
  );
  assert.equal(judgment.classification, 'test-hallucination');
  assert.match(judgment.rationale, /-0|Object\.is/);
});

test('semantic disagreements fall through to the judge', () => {
  const judgment = classifyMechanically(
    disagreement("not ok 1 - handles overflow\n  error: |-\n    Expected values to be strictly equal:\n    + 4\n    - 5"
    )
  );
  assert.equal(judgment, null);
});
