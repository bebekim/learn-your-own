import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordRun,
  recordRunGoal,
  recordRunTapeCell,
  getRunTapeView,
  deriveVerifierGatePolicyFromTapes,
  recordGap,
  proposeProtocol,
  promoteProtocol,
  resolveProtocol,
  recordOutcome,
  getCredit,
  recordModelCall,
  getModelCallSummary,
  recordWorkspace,
  recordZone,
  recordJob,
  recordPathActivation,
  recordCommandActivation,
  recordDeploymentAction,
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  updateZoneAssociationsFromJob,
  getJobActivationReport,
  getZoneAssociationReport,
  recordHookEvent,
  normalizeHooks,
  handleCodexHook,
  handleClaudeHook,
  spoolCodexHookEvent,
  drainHookSpool,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-kernel-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function hookJobId(sessionId, turnId) {
  return `codex-job-${createHash('sha256').update(`${sessionId}:${turnId ?? 'session'}`).digest('hex').slice(0, 16)}`;
}

test('createKernel configures file-backed SQLite for concurrent hook writers', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const timeout = kernel.db.prepare('pragma busy_timeout').get();
    const journal = kernel.db.prepare('pragma journal_mode').get();

    assert.equal(timeout.timeout, 10000);
    assert.equal(journal.journal_mode, 'wal');
    kernel.db.close();
  } finally {
    t.cleanup();
  }
});

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

test('run goals are first-class reducer records independent of an external tracker', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const goal = recordRunGoal(kernel, {
      runId: 'run-goal-1',
      goal: 'Close the feedback loop from local evidence.',
      successCriteria: 'A later outcome can be compared against this declared goal.',
      stopCondition: 'Stop after reducer and CLI coverage pass.',
      expectedProcess: 'Record goal, trace behavior, compare evidence, then evaluate outcome.',
      riskClass: 'local-ledger',
    });

    assert.equal(goal.runId, 'run-goal-1');
    assert.equal(goal.goal, 'Close the feedback loop from local evidence.');
    assert.equal(goal.successCriteria, 'A later outcome can be compared against this declared goal.');
    assert.equal(goal.stopCondition, 'Stop after reducer and CLI coverage pass.');
    assert.equal(goal.expectedProcess, 'Record goal, trace behavior, compare evidence, then evaluate outcome.');
    assert.equal(goal.riskClass, 'local-ledger');
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

test('run tape blocks completion after failed verification and completes after passed verification', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordRun(kernel, {
      runId: 'run-tape-1',
      taskShape: 'local-dev',
      channel: 'agent.task',
      status: 'started',
    });

    const goal = recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'run_goal',
      summary: 'Install acli.',
      evidenceRef: 'goal:run-tape-1',
    });
    assert.equal(goal.cellIndex, 1);
    assert.equal(goal.stateBefore, 'empty');
    assert.equal(goal.stateAfter, 'goal_declared');

    recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'verifier_spec',
      summary: 'acli -v must exit 0 and print a version.',
      evidenceRef: 'verifier:acli-version',
      payload: {
        verifierKind: 'command',
        command: 'acli -v',
      },
    });
    recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'worker_action',
      summary: 'Attempted installation.',
      evidenceRef: 'action:install-attempt-1',
    });

    const failedVerifier = recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'verifier_result',
      summary: 'acli -v exited 127; command not found.',
      evidenceRef: 'cmd:acli-version-1',
      passed: false,
      payload: {
        verifierKind: 'command',
        exitCode: 127,
      },
    });
    assert.equal(failedVerifier.stateAfter, 'verifying');

    const failedView = getRunTapeView(kernel, { runId: 'run-tape-1' });
    assert.equal(failedView.state, 'verifying');
    assert.equal(failedView.scan?.kind, 'verifier_result');
    assert.equal(failedView.scan?.passed, false);
    assert.deepEqual(failedView.legalNextKinds, ['gap', 'worker_action', 'blocked']);

    assert.throws(
      () => recordRunTapeCell(kernel, {
        runId: 'run-tape-1',
        kind: 'outcome_completed',
        summary: 'Install completed.',
        evidenceRef: 'outcome:premature',
      }),
      /illegal tape transition/
    );

    recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'gap',
      summary: 'Installed binary is not on PATH or installation failed.',
      evidenceRef: 'gap:missing-acli',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'worker_action',
      summary: 'Reinstalled and fixed PATH.',
      evidenceRef: 'action:install-attempt-2',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'verifier_result',
      summary: 'acli -v exited 0 and printed a version.',
      evidenceRef: 'cmd:acli-version-2',
      passed: true,
      payload: {
        verifierKind: 'command',
        exitCode: 0,
        stdoutSummary: 'acli 1.2.3',
      },
    });

    const passedView = getRunTapeView(kernel, { runId: 'run-tape-1' });
    assert.equal(passedView.state, 'verifying');
    assert.equal(passedView.scan?.passed, true);
    assert.deepEqual(passedView.legalNextKinds, ['outcome_completed', 'verifier_spec']);

    const outcome = recordRunTapeCell(kernel, {
      runId: 'run-tape-1',
      kind: 'outcome_completed',
      summary: 'Install completed after verifier passed.',
      evidenceRef: 'outcome:run-tape-1',
    });
    assert.equal(outcome.stateAfter, 'completed');

    const completedView = getRunTapeView(kernel, { runId: 'run-tape-1' });
    assert.equal(completedView.state, 'completed');
    assert.equal(completedView.scan?.kind, 'outcome_completed');
    assert.deepEqual(completedView.legalNextKinds, []);
  } finally {
    t.cleanup();
  }
});

test('harness learning derives a verifier gate from observed verified and unverified tapes', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordRun(kernel, {
      runId: 'run-unverified',
      taskShape: 'local-dev',
      channel: 'agent.task',
      status: 'completed',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-unverified',
      kind: 'run_goal',
      summary: 'Fix parser behavior.',
      evidenceRef: 'goal:run-unverified',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-unverified',
      kind: 'verifier_spec',
      summary: 'The targeted parser test should pass.',
      evidenceRef: 'verifier:parser-test',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-unverified',
      kind: 'worker_action',
      summary: 'Edited parser code.',
      evidenceRef: 'diff:parser-edit',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-unverified',
      kind: 'assistant_claim',
      summary: 'Assistant claimed the parser fix was complete without verifier evidence.',
      evidenceRef: 'assistant:claim-unverified',
    });

    const unverifiedView = getRunTapeView(kernel, { runId: 'run-unverified' });
    assert.equal(unverifiedView.state, 'claimed_completion');
    assert.deepEqual(unverifiedView.legalNextKinds, ['gap', 'verifier_result', 'blocked']);

    recordRun(kernel, {
      runId: 'run-verified',
      taskShape: 'local-dev',
      channel: 'agent.task',
      status: 'completed',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-verified',
      kind: 'run_goal',
      summary: 'Fix parser behavior.',
      evidenceRef: 'goal:run-verified',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-verified',
      kind: 'verifier_spec',
      summary: 'The targeted parser test should pass.',
      evidenceRef: 'verifier:parser-test',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-verified',
      kind: 'worker_action',
      summary: 'Edited parser code.',
      evidenceRef: 'diff:parser-edit-2',
    });
    recordRunTapeCell(kernel, {
      runId: 'run-verified',
      kind: 'verifier_result',
      summary: 'Targeted parser test passed.',
      evidenceRef: 'test:parser-pass',
      passed: true,
    });
    recordRunTapeCell(kernel, {
      runId: 'run-verified',
      kind: 'outcome_completed',
      summary: 'Parser fix completed after verifier passed.',
      evidenceRef: 'outcome:run-verified',
    });

    const learned = deriveVerifierGatePolicyFromTapes(kernel, {
      chosenRunId: 'run-verified',
      rejectedRunId: 'run-unverified',
      protocolId: 'harness_verifier_gate_local_dev',
      recordedBy: 'harness-learning',
    });

    assert.equal(learned.chosenTrace.runId, 'run-verified');
    assert.equal(learned.rejectedTrace.runId, 'run-unverified');
    assert.equal(learned.preference.chosenTraceId, learned.chosenTrace.traceId);
    assert.equal(learned.preference.rejectedTraceId, learned.rejectedTrace.traceId);
    assert.match(learned.preference.reason, /passed verifier/);
    assert.equal(learned.protocol.status, 'candidate');
    assert.equal(learned.protocol.scopeKind, 'channel');
    assert.equal(learned.protocol.scopeValue, 'agent.task');
    assert.match(learned.protocol.action, /Require a passed verifier_result/);
  } finally {
    t.cleanup();
  }
});
