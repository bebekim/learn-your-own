import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LessonStore } from '../src/lyo/lesson-store.ts';
import {
  renderSessionLessons,
  resolveSessionLessonStorePath,
} from '../src/lyo/session-hook.ts';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lyo-session-hook-'));
}

test('LYO session hook: renders lessons from cwd store', () => {
  const cwd = tempDir();
  const storeDir = path.join(cwd, '.zeroshot');
  fs.mkdirSync(storeDir);
  const store = new LessonStore(path.join(storeDir, 'lyo-lessons.db'));
  store.createLesson({
    failure_class: 'output_generation',
    trigger_cue: 'tests failed',
    explanation: 'tests failed',
    intervention: 'Run the narrow test before reporting done.',
  });
  store.close();

  assert.equal(resolveSessionLessonStorePath(cwd), path.join(storeDir, 'lyo-lessons.db'));
  const output = renderSessionLessons({ cwd });
  assert.match(output, /LYO lessons from your past runs/);
  assert.match(output, /Run the narrow test before reporting done/);
});

test('LYO session hook: missing store fails open', () => {
  const cwd = tempDir();
  const home = tempDir();
  const result = spawnSync(process.execPath, ['src/lyo/session-hook.ts', '--cwd', cwd], {
    cwd: path.join(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      ZEROSHOT_LYO_STORE_PATH: path.join(home, 'missing.db'),
    },
  });

  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});
