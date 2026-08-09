import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  createKernel,
  getPromptKindBeliefs,
  initLedger,
  recomputePromptKind,
  recordPromptBoundary,
  recordSessionStarted,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-prompt-kind-evidence-'));
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
  recordSessionStarted(kernel, {
    sessionId: 's1',
    workspaceScope: 'local',
    repoPath: '/tmp/repo',
    platform: 'claude',
    model: null,
  });
  return { kernel, cleanup };
}

function evidenceRows(kernel, promptId) {
  return kernel.db.prepare(
    'select * from prompt_kind_evidence where prompt_id = ? order by evidence_id'
  ).all(promptId);
}

function storedKind(kernel, promptId) {
  return kernel.db.prepare(
    'select prompt_kind from session_prompts where prompt_id = ?'
  ).get(promptId).prompt_kind;
}

describe('prompt kind evidence', () => {
  it('records heuristic evidence at insert time for user prompts', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'why are the tests failing?',
      });

      const rows = evidenceRows(kernel, 's1:prompt:0');
      const heuristic = rows.filter((row) => row.method === 'heuristic');
      assert.equal(heuristic.length, 1);
      assert.equal(heuristic[0].kind, 'debugging_request');
      assert.ok(Math.abs(heuristic[0].log_lr - Math.log(3)) < 1e-9);
    } finally {
      cleanup();
    }
  });

  it('resolves index-0 user prompts to direction_setting via positional evidence', () => {
    const { kernel, cleanup } = setup();
    try {
      const record = recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'the build is broken, fix it',
      });

      assert.equal(record.promptKind, 'direction_setting');
      assert.equal(storedKind(kernel, 's1:prompt:0'), 'direction_setting');

      const methods = evidenceRows(kernel, 's1:prompt:0').map((row) => row.method).sort();
      assert.deepEqual(methods, ['heuristic', 'positional']);
    } finally {
      cleanup();
    }
  });

  it('does not record heuristic evidence for assistant boundaries', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Acknowledged.',
      });

      assert.equal(evidenceRows(kernel, 's1:prompt:0').length, 0);
      assert.equal(storedKind(kernel, 's1:prompt:0'), 'assistant_response');
    } finally {
      cleanup();
    }
  });

  it('flips the stored kind when contextual evidence outweighs the heuristic', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'direction_setting',
        promptText: 'work on the auth module',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't2',
        role: 'user',
        kind: 'follow_up',
        promptText: 'now look at the login flow',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't2',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Found the root cause: a broken token check. Fixed the bug.',
      });

      // heuristic said follow_up (LR 3); contextual says debugging_request (LR 4) — contextual wins
      assert.equal(storedKind(kernel, 's1:prompt:1'), 'debugging_request');

      const contextual = evidenceRows(kernel, 's1:prompt:1')
        .filter((row) => row.method === 'contextual');
      assert.equal(contextual.length, 1);
      assert.equal(contextual[0].kind, 'debugging_request');
      assert.equal(contextual[0].evidence_ref, 't2');
      assert.ok(Math.abs(contextual[0].log_lr - Math.log(4)) < 1e-9);
    } finally {
      cleanup();
    }
  });

  it('compounds agreeing evidence instead of overwriting it', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'the tests are failing',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Fixed the failing assertion.',
      });

      assert.equal(storedKind(kernel, 's1:prompt:0'), 'direction_setting');

      const beliefs = getPromptKindBeliefs(kernel, 's1:prompt:0');
      const debugging = beliefs.find((belief) => belief.kind === 'debugging_request');
      // heuristic (log 3) + contextual (log 4) accumulate
      assert.ok(Math.abs(debugging.logOdds - (Math.log(3) + Math.log(4))) < 1e-9);
    } finally {
      cleanup();
    }
  });

  it('does not let contextual evidence outrank a positional direction_setting', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'follow_up',
        promptText: 'let us work on the billing feature',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Fixed the crash in the billing worker.',
      });

      assert.equal(storedKind(kernel, 's1:prompt:0'), 'direction_setting');
    } finally {
      cleanup();
    }
  });

  it('records no contextual evidence when the response has no signal', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'follow_up',
        promptText: 'continue',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Done.',
      });

      assert.equal(evidenceRows(kernel, 's1:prompt:0').filter((row) => row.method === 'contextual').length, 0);
    } finally {
      cleanup();
    }
  });

  it('recompute is a no-op when a prompt has no evidence', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Acknowledged.',
      });

      const result = recomputePromptKind(kernel, 's1:prompt:0');
      assert.equal(result.changed, false);
      assert.equal(result.currentKind, 'assistant_response');
    } finally {
      cleanup();
    }
  });

  it('assigns sequential append-only evidence ids per prompt', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'the build is broken',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Fixed the error in the config.',
      });

      const ids = evidenceRows(kernel, 's1:prompt:0').map((row) => row.evidence_id);
      assert.deepEqual(ids, [
        's1:prompt:0:evidence:1',
        's1:prompt:0:evidence:2',
        's1:prompt:0:evidence:3',
      ]);
    } finally {
      cleanup();
    }
  });

  it('fans contextual evidence out to every user prompt in a multi-message turn', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'debugging_request',
        promptText: 'the tests fail',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'user',
        kind: 'follow_up',
        promptText: 'also see the linter output',
      });
      recordPromptBoundary(kernel, {
        sessionId: 's1',
        turnId: 't1',
        role: 'assistant',
        kind: 'assistant_response',
        responseSummary: 'Fixed the crash and the linter error.',
      });

      for (const promptId of ['s1:prompt:0', 's1:prompt:1']) {
        const contextual = evidenceRows(kernel, promptId).filter((row) => row.method === 'contextual');
        assert.equal(contextual.length, 1, promptId);
      }
    } finally {
      cleanup();
    }
  });
});
