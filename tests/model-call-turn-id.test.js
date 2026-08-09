import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildPromptKindReport,
  createKernel,
  initLedger,
  recordModelCall,
  recordPromptBoundary,
  recordSessionStarted,
} from '../src/index.ts';
import { runLyoJson } from './helpers/cli.js';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-model-call-turn-'));
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

function modelCall(kernel, input) {
  return recordModelCall(kernel, {
    provider: 'anthropic',
    model: 'claude-sonnet-4',
    modelLane: 'interactive',
    status: 'completed',
    ...input,
  });
}

describe('model call turn attribution', () => {
  it('stores turn_id on model calls', () => {
    const { kernel, cleanup } = setup();
    try {
      modelCall(kernel, {
        callId: 'mc-1', sessionId: 's1', turnId: 't1',
        inputTokens: 100, outputTokens: 50, estimatedCost: 0.01,
      });

      const row = kernel.db.prepare('select turn_id from model_calls where call_id = ?').get('mc-1');
      assert.equal(row.turn_id, 't1');
    } finally {
      cleanup();
    }
  });

  it('leaves turn_id null when not provided', () => {
    const { kernel, cleanup } = setup();
    try {
      modelCall(kernel, { callId: 'mc-1', sessionId: 's1', inputTokens: 10, outputTokens: 5 });

      const row = kernel.db.prepare('select turn_id from model_calls where call_id = ?').get('mc-1');
      assert.equal(row.turn_id, null);
    } finally {
      cleanup();
    }
  });

  it('adds the column to ledgers created before it existed', () => {
    const { dbPath, cleanup } = tempDb();
    try {
      const kernel = createKernel({ dbPath });
      // simulate a pre-5.2 ledger: model_calls without turn_id
      kernel.db.exec(`
        create table model_calls (
          call_id text primary key, session_id text, run_id text,
          provider text not null, model text not null, model_lane text not null,
          prompt_ref text, prompt_sha256 text, prompt_summary text,
          input_tokens integer, output_tokens integer, total_tokens integer,
          estimated_cost real, latency_ms integer,
          status text not null check (status in ('started', 'completed', 'failed')),
          error_summary text, created_at text not null, updated_at text not null
        );
      `);
      initLedger(kernel);

      modelCall(kernel, {
        callId: 'mc-old', turnId: 't9',
        inputTokens: 1, outputTokens: 1,
      });
      const row = kernel.db.prepare('select turn_id from model_calls where call_id = ?').get('mc-old');
      assert.equal(row.turn_id, 't9');
    } finally {
      cleanup();
    }
  });

  it('reports spend by turn and unattributed spend', () => {
    const { kernel, cleanup } = setup();
    try {
      recordPromptBoundary(kernel, {
        sessionId: 's1', turnId: 't1', role: 'user', kind: 'follow_up',
        promptText: 'start on the billing feature',
      });
      modelCall(kernel, { callId: 'mc-1', sessionId: 's1', turnId: 't1', estimatedCost: 0.03 });
      modelCall(kernel, { callId: 'mc-2', sessionId: 's1', turnId: 't1', estimatedCost: 0.02 });
      modelCall(kernel, { callId: 'mc-3', sessionId: 's1', turnId: 't2', estimatedCost: 0.05 });
      modelCall(kernel, { callId: 'mc-4', sessionId: 's1', estimatedCost: 0.10 });

      const report = buildPromptKindReport(kernel);
      assert.equal(report.cost.byTurn.t1, 0.05);
      assert.equal(report.cost.byTurn.t2, 0.05);
      assert.equal(report.cost.unattributed, 0.10);
      assert.equal(report.cost.total, 0.20);
      assert.equal(report.cost.sessions.s1, 0.20);
    } finally {
      cleanup();
    }
  });

  it('reports zero cost when no model calls exist', () => {
    const { kernel, cleanup } = setup();
    try {
      const report = buildPromptKindReport(kernel);
      assert.equal(report.cost.total, 0);
      assert.deepEqual(report.cost.byTurn, {});
      assert.equal(report.cost.unattributed, 0);
    } finally {
      cleanup();
    }
  });

  it('accepts --turn-id via model-call record CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lyo-model-call-cli-'));
    try {
      const dbPath = join(dir, 'learning.sqlite');
      runLyoJson(['init', '--db', dbPath]);
      const parsed = runLyoJson([
        'model-call record', '--db', dbPath,
        '--provider', 'anthropic', '--model', 'claude-sonnet-4', '--model-lane', 'interactive',
        '--status', 'completed', '--turn-id', 't1', '--estimated-cost', '0.01',
      ]);
      assert.equal(parsed.ok, true);

      const report = runLyoJson(['prompt-kind-report', '--db', dbPath]);
      assert.equal(report.promptKind.cost.byTurn.t1, 0.01);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
