import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildPromptKindReport,
  createKernel,
  initLedger,
  recordPromptBoundary,
  recordSessionStarted,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-prompt-kind-measure-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function setup(sessionId = 's1') {
  const { dbPath, cleanup } = tempDb();
  const kernel = createKernel({ dbPath });
  initLedger(kernel);
  recordSessionStarted(kernel, {
    sessionId,
    workspaceScope: 'local',
    repoPath: '/tmp/repo',
    platform: 'claude',
    model: null,
  });
  return { kernel, cleanup };
}

function userPrompt(kernel, input) {
  return recordPromptBoundary(kernel, { sessionId: 's1', role: 'user', ...input });
}

function assistantResponse(kernel, input) {
  return recordPromptBoundary(kernel, {
    sessionId: 's1',
    role: 'assistant',
    kind: 'assistant_response',
    ...input,
  });
}

describe('prompt kind measurement', () => {
  it('reports zero counts on an empty ledger', () => {
    const { kernel, cleanup } = setup();
    try {
      const report = buildPromptKindReport(kernel);
      assert.equal(report.coverage.userPrompts, 0);
      assert.equal(report.flips.flipped, 0);
      assert.equal(report.behavior.retries, 0);
    } finally {
      cleanup();
    }
  });

  it('counts evidence coverage and the multi-method subset', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'work on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now look at the login flow' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Fixed the crash in the login flow.' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.coverage.userPrompts, 2);
      assert.equal(report.coverage.withEvidence, 2);
      assert.equal(report.coverage.withMultipleMethods, 1);
    } finally {
      cleanup();
    }
  });

  it('detects flips where contextual evidence overrode the heuristic', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now look at the login flow' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Found the root cause and fixed the bug.' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.flips.flipped, 1);
      assert.equal(report.flips.unflipped, 1);
      assert.equal(report.flips.byKind.debugging_request, 1);
    } finally {
      cleanup();
    }
  });

  it('does not count positional dominance as a flip even when later evidence exists', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      assistantResponse(kernel, { turnId: 't1', responseSummary: 'Fixed the crash in the billing worker.' });

      const report = buildPromptKindReport(kernel);
      // stored kind is direction_setting (positional, log 99); the contextual
      // debugging vote lost. The heuristic disagreement comes from position,
      // not from later evidence changing the outcome — not a flip.
      assert.equal(report.flips.flipped, 0);
      assert.equal(report.flips.unflipped, 1);
    } finally {
      cleanup();
    }
  });

  it('reports inter-method concordance instead of agreement with the belief', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now look at the login flow' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Found the root cause and fixed the bug.' });

      const report = buildPromptKindReport(kernel);
      // t2 prompt: heuristic kinds {follow_up}, contextual kinds {debugging_request} → disagree
      const pair = report.methodConcordance['contextual×heuristic'];
      assert.equal(pair.prompts, 1);
      assert.equal(pair.agreeing, 0);
      assert.equal(pair.rate, 0);
    } finally {
      cleanup();
    }
  });

  it('counts concordant methods when both evidence the same kind', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'debugging_request', promptText: 'the tests are failing' });
      assistantResponse(kernel, { turnId: 't1', responseSummary: 'Fixed the failing assertion.' });

      const report = buildPromptKindReport(kernel);
      const pair = report.methodConcordance['contextual×heuristic'];
      assert.equal(pair.prompts, 1);
      assert.equal(pair.agreeing, 1);
      assert.equal(pair.rate, 1);
    } finally {
      cleanup();
    }
  });

  it('buckets belief margins and counts single-kind prompts as decisive', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now look at the login flow' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Found the root cause and fixed the bug.' });

      const report = buildPromptKindReport(kernel);
      // t1 prompt: direction_setting positional (log 99) vs heuristic follow_up (log 3) → decisive
      // t2 prompt: debugging_request (log 4) vs follow_up (log 3) → flat (margin ~0.29)
      assert.equal(report.margins.flat, 1);
      assert.equal(report.margins.decisive, 1);
      assert.equal(report.margins.moderate, 0);
    } finally {
      cleanup();
    }
  });

  it('detects retries from summary overlap and splits retry rate by flip status', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now look at the login flow' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Found the root cause and fixed the bug.' });
      // retry of the flipped prompt: near-identical rephrase
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'now look at the login flow please' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.behavior.retries, 1);
      // the retried prompt (t2) flipped; t1 (unflipped) was not followed by a retry
      assert.equal(report.behavior.retryRateFlipped, 1);
      assert.equal(report.behavior.retryRateUnflipped, 0);
    } finally {
      cleanup();
    }
  });

  it('reports terminal assistant turns and the ended_at data-quality finding', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      assistantResponse(kernel, { turnId: 't1', responseSummary: 'Done.' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.behavior.terminalAssistantTurns, 1);
      assert.equal(report.behavior.sessionsWithEndedAt, 0);
    } finally {
      cleanup();
    }
  });

  it('does not flag dissimilar consecutive prompts as retries', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'unrelated question about the cache layer design' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.behavior.retries, 0);
    } finally {
      cleanup();
    }
  });
});
