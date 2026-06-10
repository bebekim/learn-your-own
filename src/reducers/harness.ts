import type { LearningKernel } from '../ledger.ts';
import type {
  DeriveVerifierGatePolicyInput,
  DerivedVerifierGatePolicy,
} from '../types/harness.ts';
import type { RunTapeCellRecord } from '../types/tape.ts';
import {
  getRun,
  recordPreferencePair,
  recordTrace,
} from './core.ts';
import { proposeProtocol } from './protocols.ts';
import { sha256 } from './shared.ts';
import { getRunTapeView } from './tape.ts';

export function deriveVerifierGatePolicyFromTapes(
  kernel: LearningKernel,
  input: DeriveVerifierGatePolicyInput
): DerivedVerifierGatePolicy {
  const chosenView = getRunTapeView(kernel, { runId: input.chosenRunId });
  const rejectedView = getRunTapeView(kernel, { runId: input.rejectedRunId });

  if (!hasCompletedAfterPassedVerifier(chosenView.cells)) {
    throw new Error('chosen tape must complete after a passed verifier_result');
  }
  if (!hasUnverifiedAssistantClaim(rejectedView.cells)) {
    throw new Error('rejected tape must contain an assistant_claim before any passed verifier_result');
  }

  const chosenRun = getRun(kernel, input.chosenRunId);
  const rejectedRun = getRun(kernel, input.rejectedRunId);
  if (!chosenRun || !rejectedRun) {
    throw new Error('both tapes must belong to known runs');
  }

  const scopeKind = input.scopeKind ?? 'channel';
  const scopeValue = input.scopeValue ?? chosenRun.channel;
  const protocolId = input.protocolId ?? `harness-verifier-gate-${sha256(`${scopeKind}:${scopeValue}`).slice(0, 16)}`;

  const chosenTrace = recordTrace(kernel, {
    traceId: `trace-${input.chosenRunId}-verified-completion`,
    runId: input.chosenRunId,
    kind: 'behavior',
    summary: 'Run reached outcome_completed only after a passed verifier_result.',
    ref: `tape:${input.chosenRunId}`,
    payload: {
      tapeState: chosenView.state,
      taskShape: chosenRun.taskShape,
      channel: chosenRun.channel,
    },
  });
  const rejectedTrace = recordTrace(kernel, {
    traceId: `trace-${input.rejectedRunId}-unverified-claim`,
    runId: input.rejectedRunId,
    kind: 'behavior',
    summary: 'Run contained an assistant completion claim before any passed verifier_result.',
    ref: `tape:${input.rejectedRunId}`,
    payload: {
      tapeState: rejectedView.state,
      taskShape: rejectedRun.taskShape,
      channel: rejectedRun.channel,
    },
  });
  const preference = recordPreferencePair(kernel, {
    preferenceId: `pref-${sha256(`${chosenTrace.traceId}:${rejectedTrace.traceId}:verifier-gate`).slice(0, 24)}`,
    context: `${chosenRun.taskShape}:${chosenRun.channel}:verifier-gate`,
    chosenTraceId: chosenTrace.traceId,
    rejectedTraceId: rejectedTrace.traceId,
    reason: 'Completion with a passed verifier_result is preferred over an assistant completion claim without verifier evidence.',
    evidenceRef: `${chosenTrace.ref}>${rejectedTrace.ref}`,
    recordedBy: input.recordedBy ?? 'harness-learning',
    confidence: 'high',
  });
  const protocol = proposeProtocol(kernel, {
    protocolId,
    title: 'Verifier gate for completion claims',
    scopeKind,
    scopeValue,
    action: `Require a passed verifier_result before accepting outcome_completed for ${chosenRun.taskShape} work on ${chosenRun.channel}. Treat assistant completion claims without verifier evidence as gaps.`,
    proposedBy: input.recordedBy ?? 'harness-learning',
  });

  return {
    chosenTrace,
    rejectedTrace,
    preference,
    protocol,
  };
}

function hasCompletedAfterPassedVerifier(cells: RunTapeCellRecord[]): boolean {
  let hasPassedVerifier = false;
  for (const cell of cells) {
    if (cell.kind === 'verifier_result' && cell.passed === true) {
      hasPassedVerifier = true;
    }
    if (cell.kind === 'outcome_completed') {
      return hasPassedVerifier;
    }
  }
  return false;
}

function hasUnverifiedAssistantClaim(cells: RunTapeCellRecord[]): boolean {
  let hasPassedVerifier = false;
  for (const cell of cells) {
    if (cell.kind === 'verifier_result' && cell.passed === true) {
      hasPassedVerifier = true;
    }
    if (cell.kind === 'assistant_claim') {
      return !hasPassedVerifier;
    }
  }
  return false;
}
