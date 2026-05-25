import { createKernel } from '../ledger.ts';
import type { CreateKernelInput } from '../ledger.ts';
import { initLedger } from '../schema.ts';
import type { FixtureReplayDemoResult } from '../types/core.ts';
import {
  recordGap,
  recordRun,
} from './core.ts';
import {
  getCredit,
  promoteProtocol,
  proposeProtocol,
  recordOutcome,
  resolveProtocol,
} from './protocols.ts';

export function runFixtureReplayDemo({ dbPath = ':memory:' }: CreateKernelInput = {}): FixtureReplayDemoResult {
  const kernel = createKernel({ dbPath });
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
    proposedBy: 'demo',
  });

  let firstPromotionError: string | null = null;
  try {
    promoteProtocol(kernel, { protocolId: protocol.protocolId });
  } catch (error) {
    firstPromotionError = error instanceof Error ? error.message : String(error);
  }

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

  const promoted = promoteProtocol(kernel, {
    protocolId: protocol.protocolId,
    evidenceIds: [gap1.gapId, gap2.gapId],
    promotedBy: 'demo-frontier-review',
  });
  const overlay = resolveProtocol(kernel, {
    taskShape: 'prompt-change',
    channel: 'function.vision.extraction',
    runId: 'run-3',
  });
  if (!overlay.deliveryId) {
    throw new Error('fixture replay demo expected a protocol delivery');
  }
  const outcome = recordOutcome(kernel, {
    deliveryId: overlay.deliveryId,
    runId: 'run-3',
    followed: true,
    defectRepeated: false,
    verified: true,
    costBand: 'low',
  });

  return {
    ok: true,
    firstPromotionError,
    promoted,
    overlay,
    outcome,
    credit: getCredit(kernel),
  };
}
