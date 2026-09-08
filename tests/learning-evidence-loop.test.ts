import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createKernel, handleClaudeHook, initLedger } from '../src/index.ts';
import { bridgeSessionOnEnd } from '../src/lyo/bridge/session-bridge.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { renderSessionLessons } from '../src/lyo/selection/session-hook.ts';
import { selfCheck } from '../scripts/semver-learning-experiment.ts';

test('native hooks create scoped advice, record delivery and resolve once without causal credit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-bridge-check-'));
  mkdirSync(join(dir, '.zeroshot'));
  const storePath = join(dir, '.zeroshot/lyo-lessons.db');
  const store = new LessonStore(storePath);
  const kernel = createKernel({ dbPath: join(dir, 'kernel.sqlite') });
  initLedger(kernel);
  const hook = (session: string, event: string, extra = {}) => handleClaudeHook(kernel, {
    session_id: session, cwd: dir, hook_event_name: event, ...extra,
  });
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
  } finally { store.close(); kernel.db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('frozen SemVer instrument rejects vacuous suites and signed-zero traps', selfCheck);
