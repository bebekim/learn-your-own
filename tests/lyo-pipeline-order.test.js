import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PIPELINE_ORDER,
  stageDistance,
  stageIndex,
  upstreamClosure,
} from '../src/lyo/selection/pipeline-order.ts';
import { FAILURE_CLASSES } from '../src/lyo/selection/failure-classifier.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { replayTrace } from '../src/eval/replay.ts';

function makeLesson(store, failureClass, cue) {
  return store.createLesson({
    failure_class: failureClass,
    trigger_cue: cue,
    explanation: 'why',
    intervention: 'do this',
    run_id: 'run-seed',
    actor: 'reflector',
  });
}

test('pipeline order covers exactly the classifier taxonomy', () => {
  assert.deepEqual([...PIPELINE_ORDER].sort(), [...FAILURE_CLASSES].sort());
});

test('stageIndex follows the pipeline causal order', () => {
  assert.equal(stageIndex('goal_deviation'), 0);
  assert.equal(stageIndex('context_handling'), 1);
  assert.equal(stageIndex('output_generation'), 4);
  assert.equal(stageIndex('system_execution'), 5);
  assert.equal(stageIndex('not_a_class'), -1);
});

test('upstreamClosure excludes downstream stages', () => {
  assert.deepEqual(upstreamClosure('output_generation'), [
    'goal_deviation',
    'context_handling',
    'tool_selection',
    'orchestration',
    'output_generation',
  ]);
  assert.deepEqual(upstreamClosure('goal_deviation'), ['goal_deviation']);
  assert.deepEqual(upstreamClosure('system_execution'), [...PIPELINE_ORDER]);
});

test('upstreamClosure degenerates to exact for unknown classes', () => {
  assert.deepEqual(upstreamClosure('not_a_class'), ['not_a_class']);
});

test('stageDistance is non-negative exactly for causally compatible pairs', () => {
  assert.equal(stageDistance('output_generation', 'goal_deviation'), 4);
  assert.equal(stageDistance('output_generation', 'output_generation'), 0);
  assert.equal(stageDistance('output_generation', 'system_execution'), -1);
  assert.equal(stageDistance('output_generation', 'not_a_class'), null);
  assert.equal(stageDistance('not_a_class', 'goal_deviation'), null);
});

test('upstream scope selects from the closure and annotates stage_distance', () => {
  const store = new LessonStore(':memory:');
  const goal = makeLesson(store, 'goal_deviation', 'goal cue');
  const output = makeLesson(store, 'output_generation', 'output cue');
  const system = makeLesson(store, 'system_execution', 'system cue');

  const result = store.selectWithDecision({
    failure_class: 'output_generation',
    limit: 5,
    scope: 'upstream',
    propensityReplicates: 0,
  });

  assert.equal(result.scope, 'upstream');
  const byId = new Map(result.candidates.map((c) => [c.lesson_id, c]));
  assert.equal(byId.size, 2);
  assert.equal(byId.get(goal.lesson_id).stage_distance, 4);
  assert.equal(byId.get(output.lesson_id).stage_distance, 0);
  assert.equal(byId.has(system.lesson_id), false);
});

test('default exact scope is unchanged: single class, no stage_distance', () => {
  const store = new LessonStore(':memory:');
  makeLesson(store, 'goal_deviation', 'goal cue');
  const output = makeLesson(store, 'output_generation', 'output cue');

  const result = store.selectWithDecision({
    failure_class: 'output_generation',
    limit: 5,
    propensityReplicates: 0,
  });

  assert.equal(result.scope, 'exact');
  assert.deepEqual(result.candidates.map((c) => c.lesson_id), [output.lesson_id]);
  assert.equal('stage_distance' in result.candidates[0], false);
});

test('selectLessons honors upstream scope', () => {
  const store = new LessonStore(':memory:');
  makeLesson(store, 'system_execution', 'system cue');
  const goal = makeLesson(store, 'goal_deviation', 'goal cue');

  const selected = store.selectLessons({
    failure_class: 'context_handling',
    limit: 3,
    scope: 'upstream',
  });

  assert.deepEqual(selected.map((row) => row.lesson_id), [goal.lesson_id]);
});

test('replay records the causal scope in the decision context', () => {
  const store = new LessonStore(':memory:');
  const report = replayTrace(
    store,
    {
      run_id: 'run-upstream',
      failure_class: 'output_generation',
      trigger_message_id: 'msg-1',
      task_cue: 'task',
      outcome: 'passed',
      candidate_lessons: [
        {
          failure_class: 'goal_deviation',
          trigger_cue: 'requirement misunderstood',
          explanation: 'why',
          intervention: 'fix',
        },
      ],
    },
    { seed: 7, scope: 'upstream' }
  );

  assert.equal(report.candidates[0].stage_distance, 4);
  const decision = store.getDecision(report.decisionId);
  assert.deepEqual(JSON.parse(decision.context), {
    source: 'eval/offline-replay',
    scope: 'upstream',
  });
});
