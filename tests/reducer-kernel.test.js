import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordRun,
  recordGap,
  proposeProtocol,
  promoteProtocol,
  resolveProtocol,
  recordOutcome,
  getCredit,
  recordModelCall,
  getModelCallSummary,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-kernel-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('fixture replay protocol is promoted only after evidence and improves credit when followed', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordRun(kernel, {
      runId: 'run-1',
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      status: 'failed',
      tokenCost: 1200,
    });
    const gap1 = recordGap(kernel, {
      runId: 'run-1',
      kind: 'missing-fixture-replay',
      summary: 'Extraction prompt changed without replaying fixture images.',
      evidenceRef: 'review:run-1',
      status: 'observed',
    });

    const protocol = proposeProtocol(kernel, {
      protocolId: 'fixture_replay_gate',
      title: 'Fixture replay gate',
      scopeKind: 'channel',
      scopeValue: 'function.vision.extraction',
      action: 'Run baseline and post-change fixture replay before claiming extraction prompt success.',
      proposedBy: 'test',
    });

    assert.throws(
      () => promoteProtocol(kernel, { protocolId: protocol.protocolId }),
      /requires at least 2 evidence items/
    );

    recordRun(kernel, {
      runId: 'run-2',
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      status: 'failed',
      tokenCost: 900,
    });
    const gap2 = recordGap(kernel, {
      runId: 'run-2',
      kind: 'missing-fixture-replay',
      summary: 'Second extraction prompt edit skipped fixture replay.',
      evidenceRef: 'review:run-2',
      status: 'observed',
    });

    promoteProtocol(kernel, {
      protocolId: 'fixture_replay_gate',
      evidenceIds: [gap1.gapId, gap2.gapId],
      promotedBy: 'frontier-review',
    });

    const overlay = resolveProtocol(kernel, {
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      runId: 'run-3',
    });

    assert.equal(overlay.protocols.length, 1);
    assert.equal(overlay.protocols[0].protocolId, 'fixture_replay_gate');
    assert.equal(overlay.deliveryId, 'delivery-run-3-fixture_replay_gate');

    const outcome = recordOutcome(kernel, {
      deliveryId: overlay.deliveryId,
      runId: 'run-3',
      followed: true,
      defectRepeated: false,
      verified: true,
      costBand: 'low',
    });

    assert.equal(outcome.creditDelta, 20);
    assert.equal(getCredit(kernel).adaptiveCredit, 20);
  } finally {
    t.cleanup();
  }
});

test('model calls record provider, lane, prompt metadata, tokens, cost, and latency', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const call = recordModelCall(kernel, {
      callId: 'call-1',
      sessionId: 'session-1',
      runId: 'run-1',
      provider: 'openai',
      model: 'gpt-test-high',
      modelLane: 'high',
      promptRef: '.agent-learning/prompts/prompt-1.txt',
      promptText: 'Explain the reducer flow.',
      promptSummary: 'Explain reducer flow',
      inputTokens: 120,
      outputTokens: 80,
      estimatedCost: 0.0125,
      latencyMs: 3400,
      status: 'completed',
    });

    assert.equal(call.callId, 'call-1');
    assert.equal(call.provider, 'openai');
    assert.equal(call.modelLane, 'high');
    assert.equal(call.promptRef, '.agent-learning/prompts/prompt-1.txt');
    assert.equal(call.promptHash.length, 64);
    assert.equal(call.totalTokens, 200);
    assert.equal(call.estimatedCost, 0.0125);

    const summary = getModelCallSummary(kernel);
    assert.equal(summary.modelCalls, 1);
    assert.equal(summary.totalModelTokens, 200);
    assert.equal(summary.estimatedModelCost, 0.0125);
  } finally {
    t.cleanup();
  }
});
