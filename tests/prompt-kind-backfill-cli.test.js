import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runLyoJson } from './helpers/cli.js';

test('lyo backfill-prompt-kind reports skips for live rows and stays idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-backfill-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    runLyoJson(['init', '--db', dbPath]);
    runLyoJson(['session-start', '--db', dbPath, '--session-id', 's1']);
    runLyoJson([
      'record-prompt', '--db', dbPath, '--session-id', 's1', '--turn-id', 't1',
      '--role', 'user', '--kind', 'question', '--summary', 'how does the cache work',
    ]);
    runLyoJson([
      'record-prompt', '--db', dbPath, '--session-id', 's1', '--turn-id', 't2',
      '--role', 'user', '--kind', 'follow_up', '--summary', 'now check the linter',
    ]);

    const first = runLyoJson(['backfill-prompt-kind', '--db', dbPath]);
    assert.equal(first.ok, true);
    assert.equal(first.promptKindBackfill.promptsScanned, 2);
    assert.equal(first.promptKindBackfill.promptsSkipped, 2);
    assert.equal(first.promptKindBackfill.evidenceInserted, 0);

    const second = runLyoJson(['backfill-prompt-kind', '--db', dbPath]);
    assert.equal(second.promptKindBackfill.evidenceInserted, 0);

    const report = runLyoJson(['prompt-kind-report', '--db', dbPath]);
    assert.equal(report.promptKind.coverage.userPrompts, 2);
    assert.equal(report.promptKind.coverage.withEvidence, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
