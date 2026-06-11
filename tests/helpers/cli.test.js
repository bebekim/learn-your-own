import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runLyo,
  runLyoJson,
} from './cli.js';

test('CLI test helper runs lyo and parses JSON output', () => {
  const raw = runLyo(['demo', 'fixture-replay', '--db', ':memory:']);
  assert.match(raw, /"ok": true/);

  const parsed = runLyoJson(['demo', 'fixture-replay', '--db', ':memory:']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.promoted.status, 'active');
});

test('CLI test helper passes stdin and can return expected command failures', () => {
  const parsed = runLyoJson(
    ['codex-hook', '--db', ':memory:'],
    {
      input: JSON.stringify({
        session_id: 'helper-session',
        cwd: process.cwd(),
        hook_event_name: 'SessionStart',
        model: 'gpt-test',
        source: 'startup',
      }),
    }
  );
  assert.equal(parsed.continue, true);

  const failed = runLyo(
    ['learn', 'associations'],
    { expectFailure: true }
  );
  assert.match(failed, /learn associations is currently dry-run only/);
});
