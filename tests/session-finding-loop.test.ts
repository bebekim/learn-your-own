import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runFeedbackLoop } from '../evidence/finding-feedback-loop-2026-09-10/run.ts';

test('a real parser counterexample revises later guidance through the SQLite feedback loop', () => {
  const directory = mkdtempSync(join(tmpdir(), 'finding-loop-'));
  try {
    const report = runFeedbackLoop(directory);
    assert.equal(report.original.outcome, 'contradicted');
    assert.equal(report.revised.outcome, 'supported');
    assert.equal(report.incrementalBenefit, 'unknown');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
