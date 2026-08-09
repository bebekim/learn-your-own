import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  backfillPromptKindEvidence,
  createKernel,
  initLedger,
  recordPromptBoundary,
  recordSessionStarted,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-prompt-kind-backfill-'));
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

// Inserts a prompt row the way pre-Route-C code did: no evidence rows.
function legacyPrompt(kernel, input) {
  kernel.db.prepare(`
    insert into session_prompts (
      prompt_id, session_id, run_id, turn_id, prompt_index, prompt_role,
      prompt_kind, prompt_sha256, prompt_ref, prompt_summary, response_summary,
      model, recorded_at
    ) values (?, ?, null, ?, ?, ?, ?, null, null, ?, ?, null, ?)
  `).run(
    input.promptId,
    's1',
    input.turnId ?? null,
    input.promptIndex,
    input.role,
    input.kind,
    input.summary ?? null,
    input.responseSummary ?? null,
    new Date().toISOString()
  );
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

describe('prompt kind evidence backfill', () => {
  it('recomputes the heuristic vote from the summary for legacy user_prompt rows', () => {
    const { kernel, cleanup } = setup();
    try {
      legacyPrompt(kernel, {
        promptId: 's1:prompt:0', promptIndex: 0, role: 'user', kind: 'user_prompt',
        turnId: 't1', summary: 'why are the tests failing',
      });

      const result = backfillPromptKindEvidence(kernel);

      const methods = evidenceRows(kernel, 's1:prompt:0').map((row) => row.method).sort();
      assert.deepEqual(methods, ['heuristic', 'positional']);
      // index 0: positional (direction_setting) outranks the debugging heuristic
      assert.equal(storedKind(kernel, 's1:prompt:0'), 'direction_setting');
      assert.equal(result.evidenceInserted, 2);
      assert.equal(result.kindsChanged, 1);
    } finally {
      cleanup();
    }
  });

  it('reuses the stored kind as heuristic evidence for Route-B-era rows', () => {
    const { kernel, cleanup } = setup();
    try {
      legacyPrompt(kernel, {
        promptId: 's1:prompt:0', promptIndex: 0, role: 'user', kind: 'direction_setting',
        turnId: 't1', summary: 'work on the billing feature',
      });
      legacyPrompt(kernel, {
        promptId: 's1:prompt:1', promptIndex: 1, role: 'user', kind: 'debugging_request',
        turnId: 't2', summary: 'the tests are failing length=24',
      });

      backfillPromptKindEvidence(kernel);

      const heuristic = evidenceRows(kernel, 's1:prompt:1').find((row) => row.method === 'heuristic');
      assert.equal(heuristic.kind, 'debugging_request');
      assert.equal(heuristic.evidence_ref, 'backfill');
      assert.equal(storedKind(kernel, 's1:prompt:1'), 'debugging_request');
    } finally {
      cleanup();
    }
  });

  it('fans contextual evidence out from stored assistant response summaries', () => {
    const { kernel, cleanup } = setup();
    try {
      legacyPrompt(kernel, {
        promptId: 's1:prompt:0', promptIndex: 0, role: 'user', kind: 'direction_setting',
        turnId: 't1', summary: 'start on the billing feature',
      });
      legacyPrompt(kernel, {
        promptId: 's1:prompt:1', promptIndex: 1, role: 'user', kind: 'follow_up',
        turnId: 't2', summary: 'now look at the login flow',
      });
      legacyPrompt(kernel, {
        promptId: 's1:prompt:2', promptIndex: 2, role: 'assistant', kind: 'assistant_response',
        turnId: 't2', responseSummary: 'Found the root cause and fixed the bug.',
      });

      const result = backfillPromptKindEvidence(kernel);

      const contextual = evidenceRows(kernel, 's1:prompt:1').filter((row) => row.method === 'contextual');
      assert.equal(contextual.length, 1);
      assert.equal(contextual[0].kind, 'debugging_request');
      assert.equal(contextual[0].evidence_ref, 'backfill');
      // contextual (log 4) outweighs heuristic follow_up (log 3) — a flip
      assert.equal(storedKind(kernel, 's1:prompt:1'), 'debugging_request');
      assert.equal(result.byMethod.contextual, 1);
    } finally {
      cleanup();
    }
  });

  it('scopes turn context by session so turn ids can collide across sessions', () => {
    const { kernel, cleanup } = setup();
    try {
      recordSessionStarted(kernel, {
        sessionId: 's2', workspaceScope: 'local', repoPath: '/tmp/repo', platform: 'claude', model: null,
      });
      legacyPrompt(kernel, {
        promptId: 's1:prompt:0', promptIndex: 0, role: 'user', kind: 'direction_setting',
        turnId: 't1', summary: 'start on the billing feature',
      });
      kernel.db.prepare(`
        insert into session_prompts (
          prompt_id, session_id, run_id, turn_id, prompt_index, prompt_role,
          prompt_kind, prompt_sha256, prompt_ref, prompt_summary, response_summary,
          model, recorded_at
        ) values ('s2:prompt:0', 's2', null, 't1', 0, 'user', 'direction_setting',
                  null, null, 'unrelated work', null, null, ?)
      `).run(new Date().toISOString());
      // assistant debugging response belongs to s2's t1, not s1's t1
      kernel.db.prepare(`
        insert into session_prompts (
          prompt_id, session_id, run_id, turn_id, prompt_index, prompt_role,
          prompt_kind, prompt_sha256, prompt_ref, prompt_summary, response_summary,
          model, recorded_at
        ) values ('s2:prompt:1', 's2', null, 't1', 1, 'assistant', 'assistant_response',
                  null, null, null, 'Fixed the crash.', null, ?)
      `).run(new Date().toISOString());

      backfillPromptKindEvidence(kernel);

      assert.equal(
        evidenceRows(kernel, 's1:prompt:0').filter((row) => row.method === 'contextual').length,
        0
      );
      assert.equal(
        evidenceRows(kernel, 's2:prompt:0').filter((row) => row.method === 'contextual').length,
        1
      );
    } finally {
      cleanup();
    }
  });

  it('is idempotent: a second run inserts nothing and changes nothing', () => {
    const { kernel, cleanup } = setup();
    try {
      legacyPrompt(kernel, {
        promptId: 's1:prompt:0', promptIndex: 0, role: 'user', kind: 'user_prompt',
        turnId: 't1', summary: 'refactor the auth module',
      });

      const first = backfillPromptKindEvidence(kernel);
      const second = backfillPromptKindEvidence(kernel);

      assert.ok(first.evidenceInserted > 0);
      assert.equal(second.evidenceInserted, 0);
      assert.equal(second.kindsChanged, 0);
      assert.equal(second.promptsSkipped, 1);
    } finally {
      cleanup();
    }
  });

  it('skips live rows that already have evidence', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1', turnId: 't1', role: 'user', kind: 'question',
        promptText: 'how does the cache work?',
      });
      legacyPrompt(kernel, {
        promptId: 's1:prompt:1', promptIndex: 1, role: 'user', kind: 'user_prompt',
        turnId: 't2', summary: 'the build is broken',
      });

      const result = backfillPromptKindEvidence(kernel);

      assert.equal(result.promptsScanned, 2);
      assert.equal(result.promptsSkipped, 1);
      // live prompt keeps exactly its live evidence rows
      assert.equal(evidenceRows(kernel, 's1:prompt:0').length, 2);
      assert.equal(storedKind(kernel, 's1:prompt:1'), 'debugging_request');
    } finally {
      cleanup();
    }
  });

  it('returns zero counts on an empty ledger', () => {
    const { kernel, cleanup } = setup();
    try {
      const result = backfillPromptKindEvidence(kernel);
      assert.equal(result.promptsScanned, 0);
      assert.equal(result.evidenceInserted, 0);
      assert.equal(result.promptsRecomputed, 0);
    } finally {
      cleanup();
    }
  });
});
