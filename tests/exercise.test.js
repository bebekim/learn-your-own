import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  getRunTapeView,
  handleCodexHook,
  initLedger,
  normalizeHooks,
  recordHookEvent,
} from '../src/index.ts';

const ROOT = new URL('..', import.meta.url).pathname;

function tempWorkspace() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-exercise-'));
  mkdirSync(join(dir, '.agent-learning'), { recursive: true });
  writeFileSync(
    join(dir, '.agent-learning', 'exercise.json'),
    JSON.stringify({
      exerciseId: 'db-c-part1',
      track: 'database-from-scratch',
      language: 'c',
      stage: 'compile-loop',
      verifier: 'gcc db.c -o db',
    }),
    'utf8'
  );
  return {
    dir,
    dbPath: join(dir, '.agent-learning', 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function exerciseAttempts(kernel) {
  return kernel.db.prepare(`
    select
      attempt_id as attemptId,
      exercise_id as exerciseId,
      run_id as runId,
      track,
      language,
      stage,
      status,
      score,
      last_failure_class as lastFailureClass
    from exercise_attempts
    order by started_at asc
  `).all();
}

test('hook normalization scores a C exercise compile-fix-pass loop and records the tape', () => {
  const t = tempWorkspace();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'exercise-001-edit',
      sessionId: 'exercise-session',
      turnId: 'exercise-turn',
      eventName: 'PostToolUse',
      cwd: t.dir,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: [
            '*** Begin Patch',
            '*** Add File: db.c',
            '+int main(void) { return 0 }',
            '*** End Patch',
          ].join('\n'),
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'exercise-002-gcc-fail',
      sessionId: 'exercise-session',
      turnId: 'exercise-turn',
      eventName: 'PostToolUse',
      cwd: t.dir,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'gcc db.c -o db' },
        tool_response: {
          exit_code: 1,
          stderr: "db.c:1:28: error: expected ';' before '}' token",
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'exercise-003-edit',
      sessionId: 'exercise-session',
      turnId: 'exercise-turn',
      eventName: 'PostToolUse',
      cwd: t.dir,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: [
            '*** Begin Patch',
            '*** Update File: db.c',
            '@@',
            '-int main(void) { return 0 }',
            '+int main(void) { return 0; }',
            '*** End Patch',
          ].join('\n'),
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'exercise-004-gcc-pass',
      sessionId: 'exercise-session',
      turnId: 'exercise-turn',
      eventName: 'PostToolUse',
      cwd: t.dir,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'gcc db.c -o db' },
        tool_response: {
          exit_code: 0,
          stdout: '',
        },
      },
    });

    const normalized = normalizeHooks(kernel);
    assert.equal(normalized.processedEvents, 4);
    assert.equal(normalized.exerciseAttempts, 1);
    assert.equal(normalized.exerciseEvents, 4);

    const [attempt] = exerciseAttempts(kernel);
    assert.equal(attempt.exerciseId, 'db-c-part1');
    assert.equal(attempt.runId, 'exercise-turn');
    assert.equal(attempt.track, 'database-from-scratch');
    assert.equal(attempt.language, 'c');
    assert.equal(attempt.stage, 'compile-loop');
    assert.equal(attempt.status, 'passed');
    assert.equal(attempt.score, 9);
    assert.equal(attempt.lastFailureClass, 'compile_error');

    const tape = getRunTapeView(kernel, { runId: 'exercise-turn' });
    assert.deepEqual(tape.cells.map((cell) => cell.kind), [
      'run_goal',
      'verifier_spec',
      'worker_action',
      'verifier_result',
      'gap',
      'worker_action',
      'verifier_result',
      'outcome_completed',
    ]);
    assert.equal(tape.state, 'completed');
  } finally {
    t.cleanup();
  }
});

test('Codex hook redaction keeps status signals needed to score exercise verifier failures', () => {
  const t = tempWorkspace();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    handleCodexHook(kernel, {
      session_id: 'codex-exercise-session',
      turn_id: 'codex-exercise-turn',
      cwd: t.dir,
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        patch: [
          '*** Begin Patch',
          '*** Add File: db.c',
          '+int main(void) { return 0 }',
          '*** End Patch',
        ].join('\n'),
      },
      tool_response: { exit_code: 0, stdout: 'patched' },
    });
    handleCodexHook(kernel, {
      session_id: 'codex-exercise-session',
      turn_id: 'codex-exercise-turn',
      cwd: t.dir,
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'gcc db.c -o db' },
      tool_response: {
        exit_code: 1,
        stderr: "db.c:1:28: error: expected ';' before '}' token",
      },
    });

    const [attempt] = exerciseAttempts(kernel);
    assert.equal(attempt.status, 'failed');
    assert.equal(attempt.score, 3);
    assert.equal(attempt.lastFailureClass, 'compile_error');
  } finally {
    t.cleanup();
  }
});

test('lyo exercise view reports the hook-scored exercise attempt', () => {
  const t = tempWorkspace();
  try {
    for (const event of [
      {
        session_id: 'cli-exercise-session',
        turn_id: 'cli-exercise-turn',
        cwd: t.dir,
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: [
            '*** Begin Patch',
            '*** Add File: db.c',
            '+int main(void) { return 0 }',
            '*** End Patch',
          ].join('\n'),
        },
        tool_response: { exit_code: 0, stdout: 'patched' },
      },
      {
        session_id: 'cli-exercise-session',
        turn_id: 'cli-exercise-turn',
        cwd: t.dir,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'gcc db.c -o db' },
        tool_response: {
          exit_code: 1,
          stderr: "db.c:1:28: error: expected ';' before '}' token",
        },
      },
      {
        session_id: 'cli-exercise-session',
        turn_id: 'cli-exercise-turn',
        cwd: t.dir,
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: [
            '*** Begin Patch',
            '*** Update File: db.c',
            '@@',
            '-int main(void) { return 0 }',
            '+int main(void) { return 0; }',
            '*** End Patch',
          ].join('\n'),
        },
        tool_response: { exit_code: 0, stdout: 'patched' },
      },
      {
        session_id: 'cli-exercise-session',
        turn_id: 'cli-exercise-turn',
        cwd: t.dir,
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'gcc db.c -o db' },
        tool_response: { exit_code: 0, stdout: '' },
      },
    ]) {
      execFileSync(
        process.execPath,
        ['src/cli.ts', 'codex-hook', '--db', t.dbPath],
        { cwd: ROOT, input: JSON.stringify(event) }
      );
    }

    const viewed = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'exercise', 'view', '--db', t.dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));

    assert.equal(viewed.ok, true);
    assert.equal(viewed.summary.attempts, 1);
    assert.equal(viewed.summary.passed, 1);
    assert.equal(viewed.summary.totalScore, 9);
    assert.equal(viewed.attempts[0].exerciseId, 'db-c-part1');
    assert.equal(viewed.attempts[0].status, 'passed');
    assert.equal(viewed.attempts[0].lastFailureClass, 'compile_error');
  } finally {
    t.cleanup();
  }
});
