import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKernel, handleClaudeHook, initLedger } from '../src/index.ts';
import { bridgeSessionOnEnd, bridgeStaleSessions } from '../src/lyo/bridge/session-bridge.ts';
import { hashValue } from '../src/lyo/contract/refs.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { renderSessionLessons } from '../src/lyo/selection/session-hook.ts';
import { selfCheck } from '../scripts/semver-learning-experiment.ts';

// Bridged lessons start unvalidated; this loop checks their delivery mechanics.
process.env.LYO_SESSION_UNVALIDATED_LESSONS = '1';

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-bridge-check-'));
  mkdirSync(join(dir, '.zeroshot'));
  const storePath = join(dir, '.zeroshot/lyo-lessons.db');
  const store = new LessonStore(storePath);
  const kernel = createKernel({ dbPath: join(dir, 'kernel.sqlite') });
  initLedger(kernel);
  let n = 0;
  const hook = (session: string, event: string, extra = {}) => handleClaudeHook(kernel, {
    session_id: session, cwd: dir, hook_event_name: event, ...extra,
  });
  // Shapes observed from Claude Code on 2026-11-16 (a deliberate `exit 3` in a live
  // session): success fires PostToolUse with no exit-code field; a nonzero exit fires
  // PostToolUseFailure whose `error` string starts "Exit code N".
  const passed = (session: string, command: string, toolInput: Record<string, unknown> = {}, stdout = 'ok 12 tests') =>
    hook(session, 'PostToolUse', { tool_name: 'Bash', tool_use_id: `t${n++}`, tool_input: { command, ...toolInput },
      tool_response: { stdout, stderr: '', interrupted: false, isImage: false } });
  const failed = (session: string, command: string) =>
    hook(session, 'PostToolUseFailure', { tool_name: 'Bash', tool_use_id: `t${n++}`, tool_input: { command },
      error: 'Exit code 1\nnot ok 3 - private customer row 4471', is_interrupt: false });
  const lessonCount = () => (store.db.prepare('SELECT count(*) AS n FROM lesson').get() as { n: number }).n;
  const close = () => { store.close(); kernel.db.close(); rmSync(dir, { recursive: true, force: true }); };
  return { dir, storePath, store, kernel, hook, passed, failed, lessonCount, close };
}

test('native hooks create scoped advice, record delivery and resolve once without causal credit', () => {
  const f = fixture();
  const { dir, storePath, store, kernel, hook } = f;
  // Hosts such as Bob can report a numeric exit code; Claude uses event names instead.
  const terminal = (session: string, exit_code: number) => hook(session, 'PostToolUse', {
    tool_name: 'Bash', tool_use_id: `${session}-${exit_code}`,
    tool_input: { command: 'rtk npm test' }, tool_response: { exit_code },
  });
  try {
    hook('training', 'SessionStart'); terminal('training', 1); terminal('training', 0);
    hook('training', 'SessionEnd');
    const lessons = store.db.prepare('SELECT * FROM lesson').all();
    assert.equal(lessons.length, 1);
    assert.match(renderSessionLessons({ cwd: dir })!, /Run rtk npm test/);
    const other = join(dir, 'other'); mkdirSync(other); mkdirSync(join(other, '.zeroshot'));
    // Scope is also tested on the same DB by the pure metadata parser in the banner.
    const delivery = spawnSync(process.execPath, ['src/lyo/selection/session-hook.ts'], {
      cwd: join(import.meta.dirname, '..'), encoding: 'utf8',
      input: JSON.stringify({ cwd: dir, session_id: 'following' }),
      env: { ...process.env, TMPDIR: dir, ZEROSHOT_LYO_STORE_PATH: storePath },
    });
    assert.match(delivery.stdout, /Run rtk npm test/);
    const outOfScope = spawnSync(process.execPath, ['src/lyo/selection/session-hook.ts', '--cwd', other], {
      cwd: join(import.meta.dirname, '..'), encoding: 'utf8',
      env: { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath },
    });
    assert.equal(outOfScope.stdout, '');
    hook('following', 'SessionStart'); terminal('following', 0); hook('following', 'SessionEnd');
    const receipts = store.db.prepare('SELECT outcome, counted FROM lesson_application').all();
    assert.deepEqual(receipts.map(r => [r.outcome, r.counted]), [['observed-pass', 1]]);
    assert.equal(store.db.prepare('SELECT helpful_count + harmful_count AS n FROM lesson').get()!.n, 0);
    assert.deepEqual(bridgeSessionOnEnd(kernel, 'following', storePath), { created: 0, observed: 0 });
    assert.equal(kernel.db.prepare('SELECT count(*) AS n FROM learning_traces').get()!.n, 2);
    const id = lessons[0].lesson_id as string;
    store.recordApplication({ lesson_id: id, run_id: 'manual' });
    store.recordApplication({ lesson_id: id, run_id: 'manual' });
    assert.equal(store.db.prepare("SELECT count(*) AS n FROM lesson_application WHERE run_id='manual'").get()!.n, 1);
  } finally { f.close(); }
});

test('Claude failure then pass of the same test creates one lesson', () => {
  const f = fixture();
  try {
    f.hook('s1', 'SessionStart'); f.failed('s1', 'npm test'); f.passed('s1', 'npm test'); f.hook('s1', 'SessionEnd');
    const lessons = f.store.db.prepare('SELECT intervention FROM lesson').all() as Array<{ intervention: string }>;
    assert.equal(lessons.length, 1);
    assert.match(lessons[0].intervention, /Run npm test after the final edit/);
  } finally { f.close(); }
});

test('Claude failure output is redacted but keeps its exit code', () => {
  const f = fixture();
  try {
    f.hook('s1', 'SessionStart'); f.failed('s1', 'npm test');
    const row = f.kernel.db.prepare("SELECT payload_json FROM hook_events WHERE event_name = 'tool.failure'").get() as { payload_json: string };
    assert.doesNotMatch(row.payload_json, /private customer row/);
    assert.equal(JSON.parse(row.payload_json).error.exit_code, 1);
    assert.equal(JSON.parse(row.payload_json).error.recorded, false);
  } finally { f.close(); }
});

test('a backgrounded command is not counted as a pass', () => {
  const f = fixture();
  try {
    f.hook('s1', 'SessionStart'); f.failed('s1', 'npm test');
    f.passed('s1', 'npm test', { run_in_background: true }); f.hook('s1', 'SessionEnd');
    assert.equal(f.lessonCount(), 0);
  } finally { f.close(); }
});

test('sessions recorded empty by the v1 bridge are re-observed; non-empty v1 receipts are kept', () => {
  const f = fixture();
  try {
    for (const s of ['empty-v1', 'full-v1']) { f.hook(s, 'SessionStart'); f.failed(s, 'npm test'); f.passed(s, 'npm test'); }
    const v1 = (s: string, commands: unknown[]) => f.store.recordTrace({ trace_id: `session-outcome:${hashValue(s)}`, run_id: s,
      kind: 'behavior', summary: 'v1', payload: { source: 'native-session-observation', sessionId: s, commands, outcomes: [] } });
    v1('empty-v1', []);
    v1('full-v1', [{ command: 'npm test', passed: true, ref: 'x' }]);
    f.hook('empty-v1', 'SessionEnd'); f.hook('full-v1', 'SessionEnd');
    assert.equal(f.lessonCount(), 1);
    assert.ok(f.store.getTrace(`session-outcome:v2:${hashValue('empty-v1')}`));
    assert.equal(f.store.getTrace(`session-outcome:v2:${hashValue('full-v1')}`), null);
    assert.deepEqual(bridgeSessionOnEnd(f.kernel, 'empty-v1', f.storePath), { created: 0, observed: 0 });
  } finally { f.close(); }
});

test('a piped test is judged by its retained summary line, not the pipe exit status', () => {
  const f = fixture();
  const piped = 'cd repo && uv run pytest tests/a.py 2>&1 | tail -3';
  try {
    // With pipefail off, a failing pytest piped to tail still reports PostToolUse.
    f.hook('s1', 'SessionStart');
    f.passed('s1', piped, {}, 'E assert 1 == 2\n==== 1 failed, 4 passed in 0.31s ====');
    f.passed('s1', piped, {}, '==== 5 passed in 0.29s ====');
    f.hook('s1', 'SessionEnd');
    const row = f.kernel.db.prepare("SELECT payload_json FROM hook_events WHERE event_name = 'tool.after' LIMIT 1").get() as { payload_json: string };
    assert.doesNotMatch(row.payload_json, /assert 1 == 2/);
    assert.deepEqual(JSON.parse(row.payload_json).tool_response.test_summary, { runner: 'pytest', passed: 4, failed: 1 });
    const lessons = f.store.db.prepare('SELECT intervention FROM lesson').all() as Array<{ intervention: string }>;
    assert.deepEqual(lessons.map(l => l.intervention), ['Run pytest tests/a.py after the final edit; it caught a failure in earlier work in this repository.']);
  } finally { f.close(); }
});

test('a piped test without a summary, or a summary contradicting the exit status, is not evidence', () => {
  const f = fixture();
  try {
    f.hook('s1', 'SessionStart');
    f.failed('s1', 'npm test');
    f.passed('s1', 'npm test 2>&1 | tail -1', {}, 'done'); // pipe exit 0 says nothing
    f.passed('s1', 'npm test', {}, 'ℹ pass 3\nℹ fail 1'); // exit 0 but the runner reports a failure
    f.hook('s1', 'SessionEnd');
    assert.equal(f.lessonCount(), 0);
  } finally { f.close(); }
});

test('sessions with no SessionEnd are bridged once quiet, recorded as a stale closure', () => {
  const f = fixture();
  try {
    f.hook('quiet', 'SessionStart'); f.failed('quiet', 'npm test'); f.passed('quiet', 'npm test');
    assert.deepEqual(bridgeStaleSessions(f.kernel, f.storePath), []); // not yet quiet for 12 hours
    const later = Date.now() + 13 * 60 * 60 * 1000;
    assert.deepEqual(bridgeStaleSessions(f.kernel, f.storePath, { now: later }), [{ sessionId: 'quiet', created: 1, observed: 0 }]);
    assert.deepEqual(bridgeStaleSessions(f.kernel, f.storePath, { now: later }), []); // once only
    const receipt = f.store.getTrace(`session-outcome:v2:${hashValue('quiet')}`)!;
    assert.equal(JSON.parse(receipt.payload_json!).closure, 'stale');
    assert.equal((f.kernel.db.prepare("SELECT ended_at FROM agent_sessions WHERE session_id = 'quiet'").get() as { ended_at: string | null }).ended_at, null);
  } finally { f.close(); }
});

test('frozen SemVer instrument rejects vacuous suites and signed-zero traps', selfCheck);
