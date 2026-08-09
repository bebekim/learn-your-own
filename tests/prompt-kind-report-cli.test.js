import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runLyoJson } from './helpers/cli.js';

test('lyo prompt-kind-report emits classification measurement over recorded prompts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-prompt-kind-report-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    runLyoJson(['init', '--db', dbPath]);
    runLyoJson(['session-start', '--db', dbPath, '--session-id', 's1']);
    runLyoJson([
      'record-prompt', '--db', dbPath, '--session-id', 's1', '--turn-id', 't1',
      '--role', 'user', '--kind', 'follow_up', '--summary', 'start on the billing feature',
    ]);
    runLyoJson([
      'record-prompt', '--db', dbPath, '--session-id', 's1', '--turn-id', 't2',
      '--role', 'user', '--kind', 'follow_up', '--summary', 'now look at the login flow',
    ]);
    runLyoJson([
      'record-prompt', '--db', dbPath, '--session-id', 's1', '--turn-id', 't2',
      '--role', 'assistant', '--kind', 'assistant_response',
      '--response', 'Found the root cause and fixed the bug.',
    ]);

    const parsed = runLyoJson(['prompt-kind-report', '--db', dbPath]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.promptKind.coverage.userPrompts, 2);
    assert.equal(parsed.promptKind.coverage.withEvidence, 2);
    assert.equal(parsed.promptKind.coverage.withMultipleMethods, 1);
    assert.equal(parsed.promptKind.flips.flipped, 1);
    assert.equal(parsed.promptKind.flips.byKind.debugging_request, 1);
    const pair = parsed.promptKind.methodConcordance['contextual×heuristic'];
    assert.equal(pair.prompts, 1);
    assert.equal(pair.agreeing, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
