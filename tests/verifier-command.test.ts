import assert from 'node:assert/strict';
import test from 'node:test';
import { verifierCommand } from '../src/lyo/bridge/verifier-command.ts';
import { extractTestSummary, hookValueShape } from '../src/lyo/hooks/test-summary.ts';

// Shapes taken from real captured agent commands (paths shortened).
test('verifier is extracted from cd chains, runners, redirects and filter pipes', () => {
  const cases: Array<[string, string, string, boolean]> = [
    ['npm test', 'npm test', 'test', false],
    ['uv run pytest tests/test_rep675_view.py -v', 'pytest tests/test_rep675_view.py -v', 'test', false],
    ['cd /repo/.worktrees/rep-848 && uv run pytest tests/a.py 2>&1', 'pytest tests/a.py', 'test', false],
    ['node --test tests/delivery.test.js 2>&1 | grep -E "✖|ℹ (pass|fail)"', 'node --test tests/delivery.test.js', 'test', true],
    ['pytest tests/test_ipf.py -q 2>&1 | head -n 120', 'pytest tests/test_ipf.py -q', 'test', true],
    ['CI=1 timeout 300 python -m pytest -q', 'pytest -q', 'test', false],
    ['npm run typecheck && npm test 2>&1 | tail -5', 'npm run typecheck && npm test', 'test', true],
    ['rtk npm test', 'rtk npm test', 'test', false],
    ['npx tsc --noEmit > /tmp/tsc.log', 'npx tsc --noEmit', 'build', false],
  ];
  for (const [line, command, classification, piped] of cases) {
    assert.deepEqual(verifierCommand(line), { command, classification, piped }, line);
  }
});

test('lines whose status cannot be attributed to the verifier are rejected', () => {
  for (const line of [
    'npm test || true',
    'npm test; echo done',
    'npm test &',
    'npm test | wc -l', // not a pass-through filter
    'npm test | tail -1 && echo ok',
    'cd /repo && npm test && git push',
    'npm test | tail -1 && npm run lint', // a pipe before the last && segment
    'grep -n "pytest|jest" notes.md',
    'echo $(npm test)',
    'pytest -q\npytest -q',
    'cd /repo',
    "pytest -k 'unterminated",
  ]) {
    assert.equal(verifierCommand(line), null, line);
  }
});

test('quoted operators do not split or reject the line', () => {
  assert.deepEqual(verifierCommand("pytest -k 'a and not b|c'"), { command: "pytest -k 'a and not b|c'", classification: 'test', piped: false });
});

test('runner summary lines yield counts; anything else yields none', () => {
  const cases: Array<[string, ReturnType<typeof extractTestSummary>]> = [
    ['...\n======= 3 failed, 40 passed, 2 skipped in 1.23s =======\n', { runner: 'pytest', passed: 40, failed: 3 }],
    ['12 passed in 0.41s', { runner: 'pytest', passed: 12, failed: 0 }],
    ['==== 5 passed, 1 error in 2.00s ====', { runner: 'pytest', passed: 5, failed: 1 }],
    ['ℹ tests 736\nℹ pass 736\nℹ fail 0\nℹ skipped 0', { runner: 'node-test', passed: 736, failed: 0 }],
    ['# pass 3\n# fail 1', { runner: 'node-test', passed: 3, failed: 1 }],
    ['Tests:       1 failed, 5 passed, 6 total', { runner: 'jest', passed: 5, failed: 1 }],
    ['      Tests  2 failed | 10 passed (12)', { runner: 'vitest', passed: 10, failed: 2 }],
    ['first run\n2 failed in 1.0s\nsecond run\n4 passed in 1.0s', { runner: 'pytest', passed: 4, failed: 0 }],
    ['ℹ pass 4', null], // a fail line is required
    ['the docs say "3 passed in 1s" somewhere', null], // not a whole line
    ['no tests ran in 0.01s', null],
    ['', null],
  ];
  for (const [text, expected] of cases) assert.deepEqual(extractTestSummary(text), expected, text);
});

test('value shape keeps key names and types, never contents', () => {
  assert.deepEqual(hookValueShape({ output: 'secret', exit_code: 0, meta: { lines: ['a'] } }),
    { output: 'string', exit_code: 'number', meta: { lines: ['string'] } });
  assert.equal(hookValueShape('secret'), 'string');
});
