import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { parseReflectionJson } from '../src/lyo/reflection/elaborator-reflector.ts';
import {
  DEFAULT_PRIOR_STRENGTH,
  MAX_PRIOR_STRENGTH,
  normalizePrior,
  parsePriorJson,
  priorPseudoCounts,
} from '../src/lyo/selection/semantic-prior.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

function makeLesson(store, prior, cue = 'cue') {
  return store.createLesson({
    failure_class: 'output_generation',
    trigger_cue: cue,
    explanation: 'why',
    intervention: 'do this',
    run_id: 'run-seed',
    actor: 'reflector',
    prior,
  });
}

test('normalizePrior accepts valid input and applies the default strength', () => {
  assert.deepEqual(normalizePrior({ confidence: 0.7, source: 'elaborator@1:m' }), {
    confidence: 0.7,
    strength: DEFAULT_PRIOR_STRENGTH,
    source: 'elaborator@1:m',
  });
});

test('normalizePrior rejects unusable confidence instead of failing', () => {
  assert.equal(normalizePrior(null), null);
  assert.equal(normalizePrior({ confidence: NaN }), null);
  assert.equal(normalizePrior({ confidence: -0.1 }), null);
  assert.equal(normalizePrior({ confidence: 1.1 }), null);
  assert.equal(normalizePrior({ confidence: 'high' }), null);
  assert.equal(normalizePrior({ confidence: 0.5, strength: 0 }), null);
});

test('normalizePrior caps strength so a confident LLM cannot dominate', () => {
  assert.equal(normalizePrior({ confidence: 0.9, strength: 1000 }).strength, MAX_PRIOR_STRENGTH);
});

test('parsePriorJson degrades NULL and garbage to no prior', () => {
  assert.equal(parsePriorJson(null), null);
  assert.equal(parsePriorJson('not json'), null);
  assert.deepEqual(parsePriorJson('{"confidence":0.5}'), {
    confidence: 0.5,
    strength: DEFAULT_PRIOR_STRENGTH,
    source: null,
  });
});

test('priorPseudoCounts is zero without a prior and conjugate with one', () => {
  assert.deepEqual(priorPseudoCounts(null), { alpha: 0, beta: 0 });
  const counts = priorPseudoCounts({ confidence: 0.8, strength: 5, source: null });
  assert.equal(counts.alpha, 4);
  assert.ok(Math.abs(counts.beta - 1) < 1e-9);
});

test('createLesson persists the prior and records it in the CREATE delta', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, { confidence: 0.8, strength: 5, source: 'elaborator@1:m' });

  assert.deepEqual(JSON.parse(lesson.prior_json), {
    confidence: 0.8,
    strength: 5,
    source: 'elaborator@1:m',
  });
  const createDelta = store.getDeltas(lesson.lesson_id).find((d) => d.delta_type === 'CREATE');
  assert.deepEqual(JSON.parse(createDelta.payload).prior, {
    confidence: 0.8,
    strength: 5,
    source: 'elaborator@1:m',
  });
});

test('createLesson with an unusable prior stores no prior but still creates', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, { confidence: 42 });
  assert.equal(lesson.prior_json, null);
});

test('selection fuses the prior as Beta pseudo-counts (BEL ∝ λ·π)', () => {
  const store = new LessonStore(':memory:');
  const withPrior = makeLesson(store, { confidence: 0.8, strength: 5 }, 'cue a');
  const withoutPrior = makeLesson(store, null, 'cue b');

  const { candidates } = store.selectWithDecision({
    failure_class: 'output_generation',
    limit: 5,
    propensityReplicates: 0,
  });
  const byId = new Map(candidates.map((c) => [c.lesson_id, c]));

  assert.equal(byId.get(withPrior.lesson_id).alpha, 1 + 4);
  assert.ok(Math.abs(byId.get(withPrior.lesson_id).beta - 2) < 1e-9);
  assert.deepEqual(
    { alpha: byId.get(withoutPrior.lesson_id).alpha, beta: byId.get(withoutPrior.lesson_id).beta },
    { alpha: 1, beta: 1 }
  );
});

test('the prior stays out of grounded counts and the reported posterior', () => {
  const store = new LessonStore(':memory:');
  const lesson = makeLesson(store, { confidence: 1, strength: MAX_PRIOR_STRENGTH });
  const row = store.getLesson(lesson.lesson_id);
  assert.equal(row.helpful_count, 0);
  assert.equal(row.harmful_count, 0);
  const view = store.db
    .prepare('SELECT posterior_mean FROM v_lesson_library WHERE lesson_id = ?')
    .get(lesson.lesson_id);
  assert.equal(view.posterior_mean, 0.5);
});

test('EDIT merge keeps the first prior; adopts one only when none exists', () => {
  const store = new LessonStore(':memory:');
  const first = makeLesson(store, { confidence: 0.6 }, 'same cue');
  const merged = makeLesson(store, { confidence: 0.9 }, 'same cue');
  assert.equal(merged.lesson_id, first.lesson_id);
  assert.deepEqual(JSON.parse(merged.prior_json), {
    confidence: 0.6,
    strength: DEFAULT_PRIOR_STRENGTH,
    source: null,
  });

  const bare = makeLesson(store, null, 'bare cue');
  const adopted = makeLesson(store, { confidence: 0.7 }, 'bare cue');
  assert.equal(adopted.lesson_id, bare.lesson_id);
  assert.deepEqual(JSON.parse(adopted.prior_json), {
    confidence: 0.7,
    strength: DEFAULT_PRIOR_STRENGTH,
    source: null,
  });
});

test('prior survives close/reopen on a file-backed store (schema v6)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-prior-'));
  try {
    const path = join(dir, 'lessons.db');
    const store = new LessonStore(path);
    const lesson = makeLesson(store, { confidence: 0.66, source: 'elaborator@1:m' });
    store.close();

    const reopened = new LessonStore(path);
    assert.deepEqual(JSON.parse(reopened.getLesson(lesson.lesson_id).prior_json), {
      confidence: 0.66,
      strength: DEFAULT_PRIOR_STRENGTH,
      source: 'elaborator@1:m',
    });
    const version = reopened.db
      .prepare("SELECT value FROM lyo_meta WHERE key = 'schema_version'")
      .get();
    assert.equal(version.value, '6');
    const viewRow = reopened.db
      .prepare('SELECT prior_json FROM v_lesson_library WHERE lesson_id = ?')
      .get(lesson.lesson_id);
    assert.ok(viewRow.prior_json);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('elaborator parser extracts, clamps, and tolerates confidence', () => {
  assert.equal(
    parseReflectionJson('{"explanation":"why","intervention":"do","confidence":0.35}').confidence,
    0.35
  );
  assert.equal(
    parseReflectionJson('{"explanation":"why","intervention":"do","confidence":1.7}').confidence,
    1
  );
  assert.equal(
    parseReflectionJson('{"explanation":"why","intervention":"do"}').confidence,
    undefined
  );
  assert.equal(
    parseReflectionJson('{"explanation":"why","intervention":"do","confidence":"high"}').confidence,
    undefined
  );
});
