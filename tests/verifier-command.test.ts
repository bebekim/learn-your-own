import assert from 'node:assert/strict';
import test from 'node:test';
import { verifierCommand } from '../src/lyo/bridge/verifier-command.ts';

// Shapes taken from real captured agent commands (paths shortened).
test('verifier is extracted from cd chains, runners and redirects', () => {
  const cases: Array<[string, string, string]> = [
    ['npm test', 'npm test', 'test'],
    ['uv run pytest tests/test_rep675_view.py -v', 'pytest tests/test_rep675_view.py -v', 'test'],
    ['cd /repo/.worktrees/rep-848 && uv run pytest tests/a.py 2>&1', 'pytest tests/a.py', 'test'],
    ['node --test tests/delivery.test.js 2>&1', 'node --test tests/delivery.test.js', 'test'],
    ['CI=1 timeout 300 python -m pytest -q', 'pytest -q', 'test'],
    ['npm run typecheck && npm test', 'npm run typecheck && npm test', 'test'],
    ['rtk npm test', 'rtk npm test', 'test'],
    ['npx tsc --noEmit > /tmp/tsc.log', 'npx tsc --noEmit', 'build'],
  ];
  for (const [line, command, classification] of cases) {
    assert.deepEqual(verifierCommand(line), { command, classification }, line);
  }
});

test('lines whose exit status belongs to another command are rejected', () => {
  for (const line of [
    'pytest tests/test_ipf.py -q 2>&1 | head -n 120', // exits 0 when tests fail
    'npm run typecheck 2>&1 | tail -40',
    'npm test || true',
    'npm test; echo done',
    'npm test &',
    'cd /repo && npm test && git push', // git push is not a verifier
    'grep -n "pytest|jest" notes.md',
    'echo $(npm test)',
    'pytest -q\npytest -q',
    'cd /repo',
    'ls tests',
    "pytest -k 'unterminated",
  ]) {
    assert.equal(verifierCommand(line), null, line);
  }
});

test('quoted operators do not split or reject the line', () => {
  assert.deepEqual(verifierCommand("pytest -k 'a and not b|c'"), { command: "pytest -k 'a and not b|c'", classification: 'test' });
});
