import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  createKernel,
  initLedger,
  recordPromptBoundary,
  recordSessionStarted,
  resolveTurnUserPrompts,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-turn-context-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function seedSession(kernel, sessionId) {
  recordSessionStarted(kernel, {
    sessionId,
    workspaceScope: 'local',
    repoPath: '/tmp/repo',
    platform: 'claude',
    model: null,
  });
}

describe('turn context resolution', () => {
  it('returns user prompts for a turn ordered by prompt index', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      initLedger(kernel);
      seedSession(kernel, 's1');

      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'why are the tests failing?',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'follow_up',
        promptText: 'and also check the linter',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't2',
        role: 'user',
        kind: 'question',
        promptText: 'how does the cache work?',
      });

      const prompts = resolveTurnUserPrompts(kernel, 't1');

      assert.equal(prompts.length, 2);
      assert.equal(prompts[0].promptId, 's1:prompt:0');
      assert.equal(prompts[0].promptKind, 'direction_setting');
      assert.equal(prompts[1].promptId, 's1:prompt:1');
      assert.equal(prompts[1].promptKind, 'follow_up');
    } finally {
      cleanup();
    }
  });

  it('excludes assistant rows from the turn context', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      initLedger(kernel);
      seedSession(kernel, 's1');

      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'question',
        promptText: 'what does this function do?',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'It parses the config.',
      });

      const prompts = resolveTurnUserPrompts(kernel, 't1');

      assert.equal(prompts.length, 1);
      assert.equal(prompts[0].promptKind, 'direction_setting');
    } finally {
      cleanup();
    }
  });

  it('returns an empty list for an unknown turn', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      initLedger(kernel);
      seedSession(kernel, 's1');

      assert.deepEqual(resolveTurnUserPrompts(kernel, 'nope'), []);
    } finally {
      cleanup();
    }
  });

  it('attaches turn user prompts when recording an assistant boundary', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      initLedger(kernel);
      seedSession(kernel, 's1');

      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'the build is broken',
      });
      const record = recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Fixed the build config.',
      });

      assert.equal(record.turnUserPrompts.length, 1);
      assert.equal(record.turnUserPrompts[0].promptId, 's1:prompt:0');
      assert.equal(record.turnUserPrompts[0].promptKind, 'direction_setting');
    } finally {
      cleanup();
    }
  });

  it('omits turn context for user boundaries and for assistant boundaries without a turn', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      initLedger(kernel);
      seedSession(kernel, 's1');

      const userRecord = recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'question',
        promptText: 'what is this?',
      });
      const orphanAssistant = recordPromptBoundary(kernel, {
        sessionId: 's1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'An answer.',
      });

      assert.equal(userRecord.turnUserPrompts, undefined);
      assert.equal(orphanAssistant.turnUserPrompts, undefined);
    } finally {
      cleanup();
    }
  });
});
