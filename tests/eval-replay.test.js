import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { replayTrace } from '../src/eval/replay.ts';
import { LessonStore } from '../src/lyo/lesson-store.ts';
import { runLyoJson } from './helpers/cli.js';

test('offline replay uses seeded deterministic lesson selection', () => {
  const trace = traceWithCandidates('seeded-run', 'passed', [
    candidate('alpha cue'),
    candidate('beta cue'),
  ]);

  const first = withStore((store) => replayTrace(store, trace, { seed: 42, limit: 1 }));
  const second = withStore((store) => replayTrace(store, trace, { seed: 42, limit: 1 }));

  assert.equal(first.selected.length, 1);
  assert.equal(first.selected[0].triggerCue, second.selected[0].triggerCue);
  assert.equal(first.outcomeUpdate.updated, 1);
});

test('offline replay grounds useful lessons and promotes after repeated passes', () => {
  withStore((store) => {
    let report;
    for (let index = 0; index < 8; index++) {
      report = replayTrace(
        store,
        traceWithCandidates(`pass-run-${index}`, 'passed', [candidate('stable useful cue')]),
        { seed: 1, limit: 1 }
      );
    }

    assert.equal(report.lessons[0].helpfulCount, 8);
    assert.equal(report.lessons[0].harmfulCount, 0);
    assert.equal(report.lessons[0].status, 'active');
  });
});

test('offline replay debits harmful lessons and quarantines after repeated failures', () => {
  withStore((store) => {
    let report;
    for (let index = 0; index < 8; index++) {
      report = replayTrace(
        store,
        traceWithCandidates(`fail-run-${index}`, 'failed', [candidate('stable harmful cue')]),
        { seed: 1, limit: 1 }
      );
    }

    assert.equal(report.lessons[0].helpfulCount, 0);
    assert.equal(report.lessons[0].harmfulCount, 8);
    assert.equal(report.lessons[0].status, 'quarantined');
  });
});

test('lyo eval replay reads a trace file and returns a replay report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-replay-'));
  try {
    const tracePath = join(dir, 'trace.json');
    writeFileSync(
      tracePath,
      JSON.stringify(traceWithCandidates('cli-replay-run', 'passed', [candidate('cli cue')]))
    );

    const parsed = runLyoJson(['eval', 'replay', '--db', ':memory:', '--trace', tracePath]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.replay.runId, 'cli-replay-run');
    assert.equal(parsed.replay.selected.length, 1);
    assert.equal(parsed.replay.outcomeUpdate.updated, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function withStore(work) {
  const store = new LessonStore(':memory:');
  try {
    return work(store);
  } finally {
    store.close();
  }
}

function traceWithCandidates(runId, outcome, candidates) {
  return {
    run_id: runId,
    failure_class: 'output_generation',
    trigger_message_id: `${runId}-trigger`,
    task_cue: 'validator rejected the output',
    outcome,
    candidate_lessons: candidates,
  };
}

function candidate(triggerCue) {
  return {
    failure_class: 'output_generation',
    trigger_cue: triggerCue,
    explanation: `The run failed around ${triggerCue}.`,
    intervention: `Apply the lesson for ${triggerCue}.`,
  };
}
