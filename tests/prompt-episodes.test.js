import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildPromptEpisodes,
  buildPromptKindReport,
  createKernel,
  initLedger,
  recordModelCall,
  recordPromptBoundary,
  recordSessionStarted,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-episodes-'));
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
  recordSessionStarted(kernel, { sessionId: 's1', platform: 'claude' });
  return { kernel, cleanup };
}

function userPrompt(kernel, input) {
  return recordPromptBoundary(kernel, { sessionId: 's1', role: 'user', ...input });
}

function modelCall(kernel, input) {
  return recordModelCall(kernel, {
    provider: 'anthropic', model: 'claude-sonnet-4', modelLane: 'interactive',
    status: 'completed', sessionId: 's1', ...input,
  });
}

describe('prompt episode compression', () => {
  it('compresses consecutive similar prompts into one episode', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'fix the failing auth tests' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'fix the failing auth tests please' });
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'fix the failing auth tests again' });

      const episodes = buildPromptEpisodes(kernel);
      assert.equal(episodes.length, 1);
      assert.equal(episodes[0].promptIds.length, 3);
    } finally {
      cleanup();
    }
  });

  it('splits episodes at dissimilar prompts', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'fix the failing auth tests' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'fix the failing auth tests please' });
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'unrelated: explain the cache invalidation strategy' });

      const episodes = buildPromptEpisodes(kernel);
      assert.equal(episodes.length, 2);
      assert.equal(episodes[0].promptIds.length, 2);
      assert.equal(episodes[1].promptIds.length, 1);
    } finally {
      cleanup();
    }
  });

  it('rolls episode cost up from model calls by turn', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'fix the failing auth tests' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'fix the failing auth tests please' });
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'now document the api endpoints' });
      modelCall(kernel, { callId: 'mc-1', turnId: 't1', estimatedCost: 0.04 });
      modelCall(kernel, { callId: 'mc-2', turnId: 't2', estimatedCost: 0.04 });
      modelCall(kernel, { callId: 'mc-3', turnId: 't3', estimatedCost: 0.02 });

      const episodes = buildPromptEpisodes(kernel);
      assert.equal(episodes.length, 2);
      assert.equal(episodes[0].cost, 0.08);
      assert.equal(episodes[1].cost, 0.02);
    } finally {
      cleanup();
    }
  });

  it('derives the dominant kind from member evidence', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'start on the billing feature' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'start on the billing feature now' });

      const episodes = buildPromptEpisodes(kernel);
      // both members are direction-setting positionals? no — only index 0.
      // ep1 contains prompt 0 (direction_setting, log 99) → dominant direction_setting
      assert.equal(episodes[0].dominantKind, 'direction_setting');
    } finally {
      cleanup();
    }
  });

  it('returns an empty list for a session-less ledger', () => {
    const { kernel, cleanup } = setup();
    try {
      assert.deepEqual(buildPromptEpisodes(kernel), []);
    } finally {
      cleanup();
    }
  });
});

describe('episode report section', () => {
  it('reports compression ratio, waste spend, and kind distribution', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'fix the failing auth tests' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'fix the failing auth tests please' });
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'fix the failing auth tests again' });
      userPrompt(kernel, { turnId: 't4', kind: 'follow_up', promptText: 'now document the api endpoints' });
      modelCall(kernel, { callId: 'mc-1', turnId: 't1', estimatedCost: 0.04 });
      modelCall(kernel, { callId: 'mc-2', turnId: 't2', estimatedCost: 0.04 });
      modelCall(kernel, { callId: 'mc-3', turnId: 't3', estimatedCost: 0.04 });
      modelCall(kernel, { callId: 'mc-4', turnId: 't4', estimatedCost: 0.02 });

      const report = buildPromptKindReport(kernel);
      // 4 prompts → 2 episodes
      assert.equal(report.episodes.count, 2);
      assert.equal(report.episodes.compressionRatio, 2);
      // echo spend: t2 + t3 (non-first members of ep1) = 0.08
      assert.equal(report.episodes.echoSpend, 0.08);
      // t2 and t3 are retries (similar to their predecessor) → retry spend 0.08
      assert.equal(report.episodes.retrySpend, 0.08);
      assert.equal(report.episodes.byKind.direction_setting, 1);
    } finally {
      cleanup();
    }
  });

  it('shows episodes with zero spend on cost-less ledgers', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'fix the failing auth tests' });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.episodes.count, 1);
      assert.equal(report.episodes.echoSpend, 0);
      assert.equal(report.episodes.retrySpend, 0);
    } finally {
      cleanup();
    }
  });
});

describe('work-arc continuation (rule B)', () => {
  function assistantResponse(kernel, input) {
    return recordPromptBoundary(kernel, {
      sessionId: 's1', role: 'assistant', kind: 'assistant_response', ...input,
    });
  }

  it('continues the episode for a short prompt after a completed turn', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'refactor the auth module into smaller pieces' });
      assistantResponse(kernel, { turnId: 't1', responseSummary: 'Split into three modules.' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'proceed' });
      assistantResponse(kernel, { turnId: 't2', responseSummary: 'Done with the split.' });
      userPrompt(kernel, { turnId: 't3', kind: 'follow_up', promptText: 'what remains' });

      const episodes = buildPromptEpisodes(kernel);
      assert.equal(episodes.length, 1);
      assert.equal(episodes[0].promptIds.length, 3);
    } finally {
      cleanup();
    }
  });

  it('does not continue for a short prompt with no completed turn between', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'refactor the auth module into smaller pieces' });
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'proceed' });

      const episodes = buildPromptEpisodes(kernel);
      // multi-message turn: no assistant response between → not a continuation
      assert.equal(episodes.length, 2);
    } finally {
      cleanup();
    }
  });

  it('does not continue for a longer prompt even after a completed turn', () => {
    const { kernel, cleanup } = setup();
    try {
      userPrompt(kernel, { turnId: 't1', kind: 'follow_up', promptText: 'refactor the auth module into smaller pieces' });
      assistantResponse(kernel, { turnId: 't1', responseSummary: 'Split into three modules.' });
      userPrompt(kernel, { turnId: 't2', kind: 'follow_up', promptText: 'now design the caching layer for the api gateway' });

      const episodes = buildPromptEpisodes(kernel);
      assert.equal(episodes.length, 2);
    } finally {
      cleanup();
    }
  });
});
