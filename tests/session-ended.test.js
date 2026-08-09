import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { claudeHookObservation } from '../src/adapters/claude.ts';
import {
  createKernel,
  handleClaudeHook,
  initLedger,
  recordSessionEnded,
  recordSessionStarted,
} from '../src/index.ts';
import { runLyoJson } from './helpers/cli.js';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-session-ended-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function setup() {
  const { dbPath, cleanup } = tempDb();
  const kernel = createKernel({ dbPath });
  initLedger(kernel);
  return { kernel, cleanup };
}

function endedAt(kernel, sessionId) {
  return kernel.db.prepare(
    'select ended_at from agent_sessions where session_id = ?'
  ).get(sessionId)?.ended_at ?? null;
}

describe('recordSessionEnded', () => {
  it('sets ended_at on an existing session', () => {
    const { kernel, cleanup } = setup();
    try {
      recordSessionStarted(kernel, { sessionId: 's1', platform: 'claude' });
      recordSessionEnded(kernel, { sessionId: 's1' });

      assert.ok(endedAt(kernel, 's1'));
    } finally {
      cleanup();
    }
  });

  it('keeps the first ended_at on repeat calls', () => {
    const { kernel, cleanup } = setup();
    try {
      recordSessionStarted(kernel, { sessionId: 's1', platform: 'claude' });
      recordSessionEnded(kernel, { sessionId: 's1', endedAt: '2026-08-09T10:00:00.000Z' });
      recordSessionEnded(kernel, { sessionId: 's1', endedAt: '2026-08-09T11:00:00.000Z' });

      assert.equal(endedAt(kernel, 's1'), '2026-08-09T10:00:00.000Z');
    } finally {
      cleanup();
    }
  });

  it('creates the session if the start was never recorded', () => {
    const { kernel, cleanup } = setup();
    try {
      recordSessionEnded(kernel, { sessionId: 's-orphan' });

      assert.ok(endedAt(kernel, 's-orphan'));
    } finally {
      cleanup();
    }
  });
});

describe('claude adapter SessionEnd', () => {
  it('produces a sessionEnd observation', () => {
    const obs = claudeHookObservation({
      session_id: 's1',
      cwd: '/tmp/test',
      hook_event_name: 'SessionEnd',
    }, { includeRawPrompt: true });

    assert.ok(obs.sessionEnd);
    assert.equal(obs.sessionEnd.sessionId, 's1');
    assert.equal(obs.promptBoundary, null);
  });
});

describe('hook runtime SessionEnd', () => {
  it('persists ended_at through handleClaudeHook', () => {
    const { kernel, cleanup } = setup();
    try {
      handleClaudeHook(kernel, {
        session_id: 's1',
        cwd: '/tmp/test',
        hook_event_name: 'SessionStart',
      });
      handleClaudeHook(kernel, {
        session_id: 's1',
        cwd: '/tmp/test',
        hook_event_name: 'SessionEnd',
      });

      assert.ok(endedAt(kernel, 's1'));
    } finally {
      cleanup();
    }
  });
});

describe('session-end CLI', () => {
  it('records ended_at via lyo session-end', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyo-session-end-cli-'));
    try {
      const dbPath = join(dir, 'learning.sqlite');
      runLyoJson(['init', '--db', dbPath]);
      runLyoJson(['session-start', '--db', dbPath, '--session-id', 's1']);
      const parsed = runLyoJson(['session-end', '--db', dbPath, '--session-id', 's1']);

      assert.equal(parsed.ok, true);
      assert.ok(parsed.session.endedAt);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
