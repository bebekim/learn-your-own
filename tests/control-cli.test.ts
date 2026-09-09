import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runLyoJson } from './helpers/cli.js';

test('separate processes can decide, attach feedback, and inspect the same learning episode', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-control-cli-'));
  try {
    const spec = { domain: 'coding', objective: 'correctness@1', evaluator: 'fixed-check@1',
      stateSchema: 'context@1', actions: ['continue', 'verify'], baselineAction: 'continue' };
    const specPath = join(dir, 'spec.json');
    const inputPath = join(dir, 'input.json');
    writeFileSync(specPath, JSON.stringify(spec));
    writeFileSync(inputPath, JSON.stringify({ episodeId: 'ticket-1', state: { verification: 'missing' },
      observationRef: 'ticket-1/state.json', mode: 'explore' }));
    const common = ['--db', join(dir, 'learning.sqlite'), '--spec', specPath];
    const { decision } = runLyoJson(['control', 'decide', ...common, '--input', inputPath]);
    const feedback = { decisionId: decision.id, executedAction: decision.action, evaluator: spec.evaluator,
      reward: 1, evidenceRef: 'ticket-1/check.json' };
    writeFileSync(inputPath, JSON.stringify(feedback));
    assert.equal(runLyoJson(['control', 'feedback', ...common, '--input', inputPath]).ok, true);
    const { episode } = runLyoJson(['control', 'inspect', ...common, '--episode-id', 'ticket-1']);
    assert.deepEqual(episode.decision, decision);
    assert.equal(episode.feedback.length, 1);
    assert.equal(episode.feedback[0].evidenceRef, feedback.evidenceRef);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
