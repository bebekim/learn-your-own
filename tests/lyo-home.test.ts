import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cliLessonStorePath, lessonStorePath, lyoHome } from '../src/lyo/storage/lyo-home.ts';
import { resolveSessionLessonStorePath } from '../src/lyo/selection/session-hook.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { loadDecisionConfig } from '../src/lyo/decisions/providers.ts';

test('LYO keeps one home and one lesson store, overridable without any other tool', () => {
  assert.equal(lyoHome({}), join(homedir(), '.lyo'));
  assert.equal(lessonStorePath({}), join(homedir(), '.lyo', 'lessons.db'));
  assert.equal(lessonStorePath({ LYO_HOME: '/x/home' }), '/x/home/lessons.db');
  assert.equal(lessonStorePath({ LYO_HOME: '/x/home', LYO_STORE_PATH: '/y/store.db' }), '/y/store.db');
});

test('hooks resolve the single store only when it exists, whatever the working directory holds', () => {
  const home = mkdtempSync(join(tmpdir(), 'lyo-home-')), cwd = mkdtempSync(join(tmpdir(), 'lyo-cwd-'));
  mkdirSync(join(cwd, '.zeroshot'));
  new LessonStore(join(cwd, '.zeroshot', 'lyo-lessons.db')).close(); // a per-directory store is no longer consulted
  assert.equal(resolveSessionLessonStorePath(cwd, { LYO_HOME: home }), null);
  new LessonStore(join(home, 'lessons.db')).close();
  assert.equal(resolveSessionLessonStorePath(cwd, { LYO_HOME: home }), join(home, 'lessons.db'));
  assert.equal(resolveSessionLessonStorePath(null, { LYO_HOME: home }), join(home, 'lessons.db'));
});

test('an explicit command creates the home for the single store; --store still wins', () => {
  const home = join(mkdtempSync(join(tmpdir(), 'lyo-home-')), 'fresh');
  assert.equal(cliLessonStorePath(undefined, '/', { LYO_HOME: home }), join(home, 'lessons.db'));
  assert.ok(existsSync(home));
  assert.equal(cliLessonStorePath('rel.db', '/tmp', { LYO_HOME: home }), '/tmp/rel.db');
});

test('decision config is read from LYO_HOME', () => {
  const home = mkdtempSync(join(tmpdir(), 'lyo-home-'));
  assert.equal(loadDecisionConfig({ LYO_HOME: home }), null);
});

test('the test run itself is isolated from the real LYO home', () => {
  assert.ok(process.env.LYO_HOME && !process.env.LYO_HOME.startsWith(join(homedir(), '.lyo')));
  assert.equal(process.env.LYO_STORE_PATH, undefined);
});
