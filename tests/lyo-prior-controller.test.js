import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MIN_CALIBRATION_SAMPLES,
  priorCalibration,
} from '../src/lyo/selection/semantic-prior.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

function makeLesson(store, { cue, confidence, helpful = 0, harmful = 0 }) {
  const lesson = store.createLesson({
    failure_class: 'output_generation',
    trigger_cue: cue,
    explanation: 'why',
    intervention: 'do this',
    run_id: 'run-seed',
    actor: 'reflector',
    prior: { confidence },
  });
  if (helpful || harmful) {
    store.db
      .prepare('UPDATE lesson SET helpful_count = ?, harmful_count = ? WHERE lesson_id = ?')
      .run(helpful, harmful, lesson.lesson_id);
  }
  return lesson;
}

test('priorCalibration is 1 at cold start (no calibratable lessons)', () => {
  assert.deepEqual(priorCalibration([]), { gamma: 1, lessons: [] });
  // A prior lesson without enough grounded outcomes does not vote.
  const sparse = priorCalibration([
    { lesson_id: 'a', helpful_count: 0, harmful_count: 1, prior_json: '{"confidence":0.9}' },
  ]);
  assert.equal(sparse.gamma, 1);
  assert.equal(sparse.lessons.length, 0);
});

test('priorCalibration measures agreement between confidence and grounded rate', () => {
  const { gamma, lessons } = priorCalibration([
    // Confident and right: rate 0.8 vs c 0.9 -> agreement 0.9.
    { lesson_id: 'right', helpful_count: 8, harmful_count: 2, prior_json: '{"confidence":0.9}' },
    // Confident and wrong: rate 0 vs c 0.9 -> agreement 0.1.
    { lesson_id: 'wrong', helpful_count: 0, harmful_count: 10, prior_json: '{"confidence":0.9}' },
    // No prior -> no vote.
    { lesson_id: 'none', helpful_count: 9, harmful_count: 1, prior_json: null },
  ]);
  assert.equal(lessons.length, 2);
  assert.ok(Math.abs(gamma - 0.5) < 1e-9);
  const wrong = lessons.find((entry) => entry.lesson_id === 'wrong');
  assert.equal(wrong.samples, 10);
  assert.ok(Math.abs(wrong.agreement - 0.1) < 1e-9);
});

test('the controller tempers selection pseudo-counts by the observed calibration', () => {
  const store = new LessonStore(':memory:');
  // Calibration set: 5 confident-and-wrong lessons -> agreement 0.1 each.
  for (let i = 0; i < 5; i++) {
    makeLesson(store, { cue: `wrong ${i}`, confidence: 0.9, helpful: 0, harmful: 10 });
  }
  // A fresh prior lesson with no outcomes of its own: its prior is tempered
  // by the global gamma even though it never voted.
  const fresh = makeLesson(store, { cue: 'fresh', confidence: 0.8 });

  const calibration = store.getPriorCalibration();
  assert.ok(Math.abs(calibration.gamma - 0.1) < 1e-9);
  assert.equal(calibration.lessons.length, 5);

  const { candidates } = store.selectWithDecision({
    failure_class: 'output_generation',
    limit: 10,
    propensityReplicates: 0,
  });
  const entry = candidates.find((c) => c.lesson_id === fresh.lesson_id);
  // Untempered: alpha = 1 + 2 * 0.8 = 2.6. Tempered by gamma 0.1: 1.16.
  assert.ok(Math.abs(entry.alpha - (1 + 2 * 0.1 * 0.8)) < 1e-9);
  assert.ok(Math.abs(entry.beta - (1 + 2 * 0.1 * 0.2)) < 1e-9);
});

test('cold start keeps F1 fusion unchanged (gamma = 1)', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, {
    cue: 'cue',
    confidence: 0.8,
    helpful: MIN_CALIBRATION_SAMPLES - 2,
    harmful: 0,
  });

  assert.equal(store.getPriorCalibration().gamma, 1);
  const { candidates } = store.selectWithDecision({
    failure_class: 'output_generation',
    limit: 5,
    propensityReplicates: 0,
  });
  const entry = candidates.find((c) => c.lesson_id === lesson.lesson_id);
  assert.ok(Math.abs(entry.alpha - (MIN_CALIBRATION_SAMPLES - 1 + 2 * 0.8)) < 1e-9);
});
