import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import {
  renderSessionLessons,
  emitSessionLessons,
  resolveSessionLessonStorePath,
} from '../src/lyo/selection/session-hook.ts';

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
  const result = spawnSync(process.execPath, ['src/lyo/selection/session-hook.ts', '--cwd', cwd], {
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

test('observed findings reach the owning repository and its worktrees with explicit evidence limits', () => {
  const cwd = tempDir(), linked = path.join(tempDir(), 'linked'), unrelated = tempDir();
  const git = args => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git(['init', '-q']);
  git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'seed']);
  git(['worktree', 'add', '--detach', linked]);
  const gitCommonDir = fs.realpathSync(path.join(cwd, '.git'));
  for (const workspace of [cwd, linked, unrelated]) {
    const dir = path.join(workspace, '.zeroshot'); fs.mkdirSync(dir);
    const store = new LessonStore(path.join(dir, 'lyo-lessons.db'));
    try {
      store.recordTrace({ kind: 'behavior', summary: 'Transfer boundary',
        payload: { source: 'session-finding@1', gitCommonDir, activity: 'transfer-review',
          observation: 'The guided fix accepted U+0085; the baseline rejected it.', evidenceRef: 'task-report:screen',
          intervention: 'When transferring a repair, check that the target semantics match the source.' } });
      assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM v_lesson_library').get().n, 0,
        'older hooks must not see findings as ordinary unscoped lessons');
    } finally { store.close(); }
  }
  for (const workspace of [cwd, linked]) {
    const output = renderSessionLessons({ cwd: workspace });
    assert.match(output, /Observed findings.*usefulness unvalidated/);
    assert.match(output, /target semantics/);
    assert.match(output, /U\+0085/);
    assert.match(output, /task-report:screen/);
  }
  assert.equal(renderSessionLessons({ cwd: unrelated }), null);
});

test('LYO session hook: prints at most once per session id', () => {
  const cwd = tempDir();
  const tmp = tempDir();
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

  const runHook = (sessionId) =>
    spawnSync(process.execPath, ['src/lyo/selection/session-hook.ts'], {
      cwd: path.join(import.meta.dirname, '..'),
      encoding: 'utf8',
      input: JSON.stringify({ cwd, session_id: sessionId }),
      env: { ...process.env, TMPDIR: tmp },
    });

  const first = runHook('session-a');
  assert.equal(first.status, 0);
  assert.match(first.stdout, /LYO lessons from your past runs/);

  const repeat = runHook('session-a');
  assert.equal(repeat.status, 0);
  assert.equal(repeat.stdout, '');

  const other = runHook('session-b');
  assert.equal(other.status, 0);
  assert.match(other.stdout, /LYO lessons from your past runs/);
});

test('an explicit activity delivers a finding later in the session once, without awarding credit', () => {
  const cwd = tempDir(), storeDir = path.join(cwd, '.zeroshot'); fs.mkdirSync(storeDir);
  const store = new LessonStore(path.join(storeDir, 'lyo-lessons.db'));
  try {
    store.createLesson({ failure_class: 'output_generation', trigger_cue: 'test', intervention: 'Existing lesson.' });
    const finding = store.recordTrace({ kind: 'behavior', summary: 'Transfer boundary',
      payload: { source: 'session-finding@1', gitCommonDir: path.join(cwd, 'different-repo'),
        activity: 'transfer-review', observation: 'The guided fix missed U+0085.', evidenceRef: 'task-report:screen',
        intervention: 'Check target semantics before reusing the repair.' } });
    const payload = { cwd, session_id: `finding-${path.basename(cwd)}` }, outputs = [];
    const emit = extra => emitSessionLessons({ ...payload, ...extra }, text => outputs.push(text));
    emit({});
    assert.equal(outputs.length, 1); assert.doesNotMatch(outputs[0], /target semantics/);
    store.createLesson({ failure_class: 'output_generation', trigger_cue: 'later', intervention: 'New ordinary lesson.' });
    emit({ prompt: 'Discuss transfer and experiments.' });
    assert.equal(outputs.length, 1, 'ordinary keywords do not declare an activity');
    emit({ prompt: '[lyo:transfer-review] Reuse this repair in another project.' });
    assert.equal(outputs.length, 2); assert.match(outputs[1], /target semantics/);
    assert.doesNotMatch(outputs[1], /Existing lesson/);
    emit({ prompt: '[lyo:transfer-review] Continue.' });
    assert.equal(outputs.length, 2);
    assert.equal(store.db.prepare('SELECT SUM(helpful_count + harmful_count) AS n FROM lesson').get().n, 0);
    assert.deepEqual(store.getTrace(finding.trace_id), finding, 'delivery leaves source evidence unchanged');
    const deliveries = store.db.prepare("SELECT payload_json FROM learning_trace WHERE kind = 'protocol_application'").all();
    assert.equal(deliveries.length, 2);
    const delivered = JSON.parse(deliveries[1].payload_json);
    assert.equal(delivered.evidenceKind, 'delivery-only');
    assert.equal(delivered.findings[0].id, finding.trace_id);
  } finally { store.close(); }
});

test('malformed finding metadata cannot broaden delivery or hide ordinary lessons', () => {
  const cwd = tempDir(), dir = path.join(cwd, '.zeroshot'); fs.mkdirSync(dir);
  const store = new LessonStore(path.join(dir, 'lyo-lessons.db'));
  try {
    store.recordTrace({ kind: 'behavior', summary: 'Incomplete finding',
      payload: { source: 'session-finding@1', activity: 'transfer-review', intervention: 'Invalid finding.' } });
    store.createLesson({ failure_class: 'output_generation', trigger_cue: 'existing', intervention: 'Existing lesson.' });
    const text = renderSessionLessons({ cwd, prompt: '[lyo:transfer-review]' });
    assert.match(text, /Existing lesson/); assert.doesNotMatch(text, /Invalid finding/);
  } finally { store.close(); }
});
