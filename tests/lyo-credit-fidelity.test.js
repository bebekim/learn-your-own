import assert from 'node:assert/strict';
import test from 'node:test';

import { MIN_STRATUM_DECISIONS } from '../src/lyo/credit/ratio-lift.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

function makeLesson(store, cue) {
  return store.createLesson({
    failure_class: 'output_generation',
    trigger_cue: cue,
    explanation: 'why',
    intervention: 'do this',
    run_id: 'run-seed',
    actor: 'reflector',
  });
}

// One fully-logged run: decision -> one application per selected lesson ->
// outcome. Mirrors the ratio-lift tests' seeding helper.
function loggedRun(store, runId, candidates, selected, outcome) {
  const decision = store.recordDecision({
    run_id: runId,
    failure_class: 'output_generation',
    candidates,
    selected,
  });
  for (const entry of selected) {
    store.recordApplication({
      lesson_id: entry.lesson_id,
      run_id: runId,
      trigger_message_id: `${runId}-${entry.lesson_id}`,
      task_cue: 'cue',
      decision_id: decision.decision_id,
    });
  }
  store.applyValidationOutcome({ run_id: runId, outcome });
}

test('empty store reports zeros and null means', () => {
  const store = new LessonStore(':memory:');
  const report = store.getCreditFidelityReport();

  assert.deepEqual(report.strata, []);
  assert.deepEqual(report.overall, {
    stratum: '(overall)',
    receipts: 0,
    legacy: 0,
    uniformFallback: 0,
    ratioLift: 0,
    gated: 0,
    signFlips: 0,
    meanAbsDerivativeError: null,
    meanAbsWeight: null,
  });
});

test('fidelity report quantifies the derivative error of uniform crediting', () => {
  const store = new LessonStore(':memory:');
  const lessonA = makeLesson(store, 'cue a');
  const lessonB = makeLesson(store, 'cue b');

  // History: A in every PASSED decision, B in every FAILED one (rho = 0.5).
  // Runs 1..MIN credit under the uniform fallback (sparse stratum); the last
  // run in each outcome cell engages ratio-lift.
  const n = MIN_STRATUM_DECISIONS + 1;
  for (let i = 0; i < n; i++) {
    loggedRun(
      store,
      `hist-pass-${i}`,
      [{ lesson_id: lessonA.lesson_id, alpha: 1, beta: 1, propensity: 0.5 }],
      [{ lesson_id: lessonA.lesson_id }],
      'passed'
    );
    loggedRun(
      store,
      `hist-fail-${i}`,
      [{ lesson_id: lessonB.lesson_id, alpha: 1, beta: 1, propensity: 0.5 }],
      [{ lesson_id: lessonB.lesson_id }],
      'failed'
    );
  }

  // Target run: both lessons, outcome passed. w_A = (7/8)/0.5 - 1 = +0.75
  // (helpful, aligned); w_B = (1/8)/0.5 - 1 = -0.75 (harmful on a pass —
  // a sign flip vs the uniform rule).
  loggedRun(
    store,
    'target',
    [
      { lesson_id: lessonA.lesson_id, alpha: 1, beta: 1, propensity: 0.5 },
      { lesson_id: lessonB.lesson_id, alpha: 1, beta: 1, propensity: 0.5 },
    ],
    [{ lesson_id: lessonA.lesson_id }, { lesson_id: lessonB.lesson_id }],
    'passed'
  );

  const report = store.getCreditFidelityReport();
  const stratum = report.strata.find((row) => row.stratum === 'output_generation');

  // 2n history receipts + 2 target receipts.
  assert.equal(stratum.receipts, 2 * n + 2);
  assert.equal(stratum.uniformFallback, 2 * MIN_STRATUM_DECISIONS);
  assert.equal(stratum.ratioLift, 4);
  assert.equal(stratum.gated, 0);
  assert.equal(stratum.signFlips, 1);
  // Errors: 2 x |5/7 - 1| + |0.75 - 1| + |-0.75 - 1| = 4/7 + 2 = 18/7.
  assert.ok(Math.abs(stratum.meanAbsDerivativeError - 18 / 7 / 4) < 1e-9);
  // Weights: 2 x 5/7 + 0.75 + 0.75 = 10/7 + 3/2.
  assert.ok(Math.abs(stratum.meanAbsWeight - (10 / 7 + 1.5) / 4) < 1e-9);

  // The overall row aggregates the same receipts.
  assert.equal(report.overall.receipts, stratum.receipts);
  assert.equal(report.overall.ratioLift, stratum.ratioLift);
});

test('pre-F3 receipts are reported as legacy; w = 0 receipts as gated', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, 'cue');

  // Legacy receipt: a pre-F3 MARK delta has application_id + outcome but no
  // weight/estimator. Hand-build it (the pre-F3 code path no longer exists).
  store.recordApplication({
    lesson_id: lesson.lesson_id,
    run_id: 'legacy-run',
    trigger_message_id: 'msg-legacy',
    task_cue: 'cue',
  });
  const legacyApp = store.db
    .prepare("SELECT application_id FROM lesson_application WHERE run_id = 'legacy-run'")
    .get();
  store.db
    .prepare(
      `INSERT INTO lesson_delta (lesson_id, run_id, actor, delta_type, payload)
       VALUES (?, 'legacy-run', 'validator-rule', 'MARK_HELPFUL', ?)`
    )
    .run(
      lesson.lesson_id,
      JSON.stringify({ application_id: legacyApp.application_id, outcome: 'passed' })
    );
  store.db
    .prepare("UPDATE lesson_application SET counted = 1, outcome = 'passed' WHERE application_id = ?")
    .run(legacyApp.application_id);

  // Gated receipt: resolved with NO MARK delta (ratio-lift judged w = 0).
  store.recordApplication({
    lesson_id: lesson.lesson_id,
    run_id: 'gated-run',
    trigger_message_id: 'msg-gated',
    task_cue: 'cue',
  });
  store.db
    .prepare(
      "UPDATE lesson_application SET counted = 1, outcome = 'failed' WHERE run_id = 'gated-run'"
    )
    .run();

  const report = store.getCreditFidelityReport();
  assert.equal(report.overall.receipts, 2);
  assert.equal(report.overall.legacy, 1);
  assert.equal(report.overall.gated, 1);
  assert.equal(report.overall.ratioLift, 0);
  assert.equal(report.overall.meanAbsDerivativeError, null);
});
