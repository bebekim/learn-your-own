import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateEvalTaskDirectory } from '../src/eval/tasks.ts';
import { runLyoJson } from './helpers/cli.js';

test('committed eval task set validates with explicit train selection and test splits', () => {
  const parsed = runLyoJson(['eval', 'validate']);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.validation.taskCount, 3);
  assert.deepEqual(parsed.validation.splitCounts, {
    train: 1,
    selection: 1,
    test: 1,
  });
  assert.deepEqual(
    parsed.validation.tasks.map((task) => task.split),
    ['test', 'selection', 'train']
  );
});

test('eval task validation rejects split metadata mismatches', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-tasks-'));
  try {
    mkdirSync(join(dir, 'tasks'));
    writeJson(join(dir, 'splits.json'), {
      train: ['task-a'],
      selection: ['task-b'],
      test: ['task-c'],
    });
    writeJson(join(dir, 'tasks', 'task-a.json'), task('task-a', 'train'));
    writeJson(join(dir, 'tasks', 'task-b.json'), task('task-b', 'train'));
    writeJson(join(dir, 'tasks', 'task-c.json'), task('task-c', 'test'));

    assert.throws(
      () => validateEvalTaskDirectory(dir),
      /splits\.json lists missing selection task: task-b/
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function task(taskId, split) {
  return {
    task_id: taskId,
    split,
    repo_ref: {
      kind: 'git',
      ref: 'fixture',
    },
    prompt: 'Do the fixture task.',
    allowed_tools: ['read', 'edit', 'shell'],
    budget: {
      max_turns: 1,
      max_wall_time_seconds: 1,
      max_tokens: 1,
    },
    success_check: {
      kind: 'command',
      command: 'true',
    },
    expected_touched_paths: ['src/example.ts'],
    tags: ['fixture'],
  };
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}
