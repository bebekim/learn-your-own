import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_WEIGHT,
  MIN_STRATUM_DECISIONS,
  RATIO_LIFT_ESTIMATOR_ID,
  UNIFORM_FALLBACK_ESTIMATOR_ID,
  computeInjectionWeights,
} from '../src/lyo/credit/ratio-lift.ts';
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

// Drive one fully-logged run through the store: decision with the given
// candidates/selected, one application per selected lesson, then the outcome.
// History runs are credited under whatever estimator their stratum supports
// at the time (sparse history -> uniform fallback), which is exactly how
// production receipts accumulate.
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

// Build a stratum where lesson A appears in every PASSED decision and lesson
// B in every FAILED decision, both with propensity 0.5. Counts: exactly
// MIN_STRATUM_DECISIONS + 1 per outcome cell so the ratio estimator engages.
function seedStratum(store, lessonA, lessonB) {
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
  return n;
}

test('LYO ratio-lift (F3): credits each injection by its hindsight ratio, not the uniform ±1', () => {
  const store = new LessonStore(':memory:');
  const lessonA = makeLesson(store, 'cue good lesson');
  const lessonB = makeLesson(store, 'cue bad lesson');
  const n = seedStratum(store, lessonA, lessonB);

  // Target run: BOTH lessons injected, run PASSED.
  const targetDecision = store.recordDecision({
    run_id: 'run-target',
    failure_class: 'output_generation',
    candidates: [
      { lesson_id: lessonA.lesson_id, alpha: 1, beta: 1, propensity: 0.5 },
      { lesson_id: lessonB.lesson_id, alpha: 1, beta: 1, propensity: 0.5 },
    ],
    selected: [{ lesson_id: lessonA.lesson_id }, { lesson_id: lessonB.lesson_id }],
  });
  for (const lesson of [lessonA, lessonB]) {
    store.recordApplication({
      lesson_id: lesson.lesson_id,
      run_id: 'run-target',
      trigger_message_id: `run-target-${lesson.lesson_id}`,
      decision_id: targetDecision.decision_id,
    });
  }
  store.applyValidationOutcome({ run_id: 'run-target', outcome: 'passed' });

  // A: over-represented among passes. ĥ = (n+1)/(n+2), w = ĥ/0.5 − 1 > 0.
  const expectedA = (n + 1) / (n + 2) / 0.5 - 1;
  const deltasA = store.getDeltas(lessonA.lesson_id);
  const lastMarkA = deltasA[deltasA.length - 1];
  assert.strictEqual(lastMarkA.delta_type, 'MARK_HELPFUL');
  const payloadA = JSON.parse(lastMarkA.payload);
  assert.strictEqual(payloadA.estimator, RATIO_LIFT_ESTIMATOR_ID);
  assert.ok(Math.abs(payloadA.weight - expectedA) < 1e-9, `A weight ${payloadA.weight} != ${expectedA}`);

  // B: never seen on a pass. ĥ = 1/(n+2), w = ĥ/0.5 − 1 < 0 -> harmful on a pass.
  const expectedB = 1 / (n + 2) / 0.5 - 1;
  const deltasB = store.getDeltas(lessonB.lesson_id);
  const lastMarkB = deltasB[deltasB.length - 1];
  assert.strictEqual(lastMarkB.delta_type, 'MARK_HARMFUL');
  const payloadB = JSON.parse(lastMarkB.payload);
  assert.strictEqual(payloadB.estimator, RATIO_LIFT_ESTIMATOR_ID);
  assert.ok(Math.abs(payloadB.weight - -expectedB) < 1e-9, `B weight ${payloadB.weight} != ${-expectedB}`);

  // Fractional counters: the first MIN_STRATUM_DECISIONS history runs credit
  // under the uniform fallback (stratum too sparse); history run n crosses the
  // threshold and credits fractionally; then the target run.
  const histRatioWeight =
    (MIN_STRATUM_DECISIONS + 1) / (MIN_STRATUM_DECISIONS + 2) / 0.5 - 1;
  const expectedTotal = MIN_STRATUM_DECISIONS + histRatioWeight + expectedA;
  const rowA = store.getLesson(lessonA.lesson_id);
  assert.ok(Math.abs(rowA.helpful_count - expectedTotal) < 1e-9);
  const rowB = store.getLesson(lessonB.lesson_id);
  assert.ok(Math.abs(rowB.harmful_count - expectedTotal) < 1e-9);

  // Replay folds the fractional weights back to the same state.
  const replayA = store.replayLesson(lessonA.lesson_id);
  assert.ok(Math.abs(replayA.helpful_count - rowA.helpful_count) < 1e-9);
  const replayB = store.replayLesson(lessonB.lesson_id);
  assert.ok(Math.abs(replayB.harmful_count - rowB.harmful_count) < 1e-9);

  store.close();
});

test('LYO ratio-lift (F3): a lesson uncorrelated with the outcome gets zero counter movement', () => {
  const store = new LessonStore(':memory:');
  const lessonA = makeLesson(store, 'cue correlated lesson');
  const lessonE = makeLesson(store, 'cue uncorrelated lesson');

  // 6 passed decisions in the stratum; E rides along in exactly 3 of them, so
  // ĥ(E|pass) = (3+1)/(6+2) = 0.5 = ρ at the target decision -> w = 0 exactly.
  for (let i = 0; i < MIN_STRATUM_DECISIONS + 1; i++) {
    const withE = i >= 3;
    loggedRun(
      store,
      `hist-zero-${i}`,
      [
        { lesson_id: lessonA.lesson_id, alpha: 1, beta: 1, propensity: 0.5 },
        ...(withE ? [{ lesson_id: lessonE.lesson_id, alpha: 1, beta: 1, propensity: 0.5 }] : []),
      ],
      [{ lesson_id: lessonA.lesson_id }, ...(withE ? [{ lesson_id: lessonE.lesson_id }] : [])],
      'passed'
    );
  }

  const before = store.getLesson(lessonE.lesson_id);
  const deltasBefore = store.getDeltas(lessonE.lesson_id).length;

  const decision = store.recordDecision({
    run_id: 'run-zero',
    failure_class: 'output_generation',
    candidates: [{ lesson_id: lessonE.lesson_id, alpha: 1, beta: 1, propensity: 0.5 }],
    selected: [{ lesson_id: lessonE.lesson_id }],
  });
  store.recordApplication({
    lesson_id: lessonE.lesson_id,
    run_id: 'run-zero',
    trigger_message_id: 'run-zero-msg',
    decision_id: decision.decision_id,
  });
  store.applyValidationOutcome({ run_id: 'run-zero', outcome: 'passed' });

  const after = store.getLesson(lessonE.lesson_id);
  assert.strictEqual(after.helpful_count, before.helpful_count);
  assert.strictEqual(after.harmful_count, before.harmful_count);
  // No MARK delta for a zero-weight injection...
  assert.strictEqual(store.getDeltas(lessonE.lesson_id).length, deltasBefore);
  // ...but the receipt is still resolved (counted, outcome recorded).
  const receipt = store.db
    .prepare('SELECT * FROM lesson_application WHERE run_id = ?')
    .get('run-zero');
  assert.strictEqual(receipt.counted, 1);
  assert.strictEqual(receipt.outcome, 'passed');

  store.close();
});

test('LYO ratio-lift (F3): falls back to uniform ±1 in sparse strata and for decision-less receipts', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, 'cue sparse lesson');

  // Sparse: no history at all.
  const decision = store.recordDecision({
    run_id: 'run-sparse',
    failure_class: 'output_generation',
    candidates: [{ lesson_id: lesson.lesson_id, alpha: 1, beta: 1, propensity: 0.5 }],
    selected: [{ lesson_id: lesson.lesson_id }],
  });
  store.recordApplication({
    lesson_id: lesson.lesson_id,
    run_id: 'run-sparse',
    trigger_message_id: 'run-sparse-msg',
    decision_id: decision.decision_id,
  });
  store.applyValidationOutcome({ run_id: 'run-sparse', outcome: 'passed' });
  const sparsePayload = JSON.parse(
    store.getDeltas(lesson.lesson_id).find((d) => d.delta_type === 'MARK_HELPFUL').payload
  );
  assert.strictEqual(sparsePayload.weight, 1);
  assert.strictEqual(sparsePayload.estimator, UNIFORM_FALLBACK_ESTIMATOR_ID);

  // Legacy receipt: no decision_id at all.
  const legacy = makeLesson(store, 'cue legacy lesson');
  store.recordApplication({
    lesson_id: legacy.lesson_id,
    run_id: 'run-legacy',
    trigger_message_id: 'run-legacy-msg',
  });
  store.applyValidationOutcome({ run_id: 'run-legacy', outcome: 'failed' });
  const legacyPayload = JSON.parse(
    store.getDeltas(legacy.lesson_id).find((d) => d.delta_type === 'MARK_HARMFUL').payload
  );
  assert.strictEqual(legacyPayload.weight, 1);
  assert.strictEqual(legacyPayload.estimator, UNIFORM_FALLBACK_ESTIMATOR_ID);

  store.close();
});

test('LYO ratio-lift (F3): clips extreme weights when propensities are tiny', () => {
  const store = new LessonStore(':memory:');
  const lessonA = makeLesson(store, 'cue clip lesson');
  seedStratum(store, lessonA, makeLesson(store, 'cue other lesson'));

  // A was logged with propensity 0.5 in history; now credit an injection
  // logged with a tiny propensity: w = ĥ/0.01 − 1 explodes -> clip.
  const decision = store.recordDecision({
    run_id: 'run-clip',
    failure_class: 'output_generation',
    candidates: [{ lesson_id: lessonA.lesson_id, alpha: 1, beta: 1, propensity: 0.01 }],
    selected: [{ lesson_id: lessonA.lesson_id }],
  });
  store.recordApplication({
    lesson_id: lessonA.lesson_id,
    run_id: 'run-clip',
    trigger_message_id: 'run-clip-msg',
    decision_id: decision.decision_id,
  });
  const weights = computeInjectionWeights(store.db, 'run-clip', 'passed');
  store.applyValidationOutcome({ run_id: 'run-clip', outcome: 'passed' });

  const marks = store.getDeltas(lessonA.lesson_id).filter((d) => d.delta_type === 'MARK_HELPFUL');
  const last = JSON.parse(marks[marks.length - 1].payload);
  assert.strictEqual(last.estimator, RATIO_LIFT_ESTIMATOR_ID);
  assert.strictEqual(last.weight, MAX_WEIGHT);
  assert.ok(weights.size === 1);

  store.close();
});
