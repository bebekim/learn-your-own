import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runLyoJson } from './helpers/cli.js';

test('the control experiment learns from real execution and evaluates a frozen policy on new cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-control-experiment-'));
  try {
    const outputDir = join(dir, 'evidence');
    const { report } = runLyoJson(['eval', 'control', '--dir', outputDir, '--seed', '42']);
    assert.equal(report.claim, 'mechanism-only');
    assert.ok(report.baseline.successes > 0, 'the baseline must work on some cases');
    assert.ok(report.learned.successes > report.baseline.successes);
    assert.equal(report.learned.successes, report.learned.episodes);
    assert.ok(report.training.episodes > 0);
    const episodes = JSON.parse(readFileSync(join(outputDir, 'episodes.json'), 'utf8'));
    const training = episodes.filter(episode => episode.split === 'train');
    const evaluation = episodes.filter(episode => episode.split === 'test');
    assert.ok(training.every(episode => episode.decision.propensity === 0.5));
    assert.ok(evaluation.filter(episode => episode.condition === 'learned')
      .every(episode => episode.decision.revision === report.revision));
    assert.ok(evaluation.every(episode => !training.some(prior => prior.caseId === episode.caseId)));
    assert.ok(episodes.every(episode => Number.isInteger(episode.exitCode)));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
