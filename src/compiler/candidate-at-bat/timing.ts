import {
  isEditAction,
  isInspectAction,
  isTestAction,
} from '../semantics.ts';
import type { NormalizedAction } from '../syntax.ts';
import type { CandidateAtBatReport } from '../candidate-at-bat.ts';
import {
  actionFailed,
  actionSucceeded,
} from './verifiers.ts';

export function timingMetrics(actions: NormalizedAction[]): CandidateAtBatReport['timing'] {
  const firstTime = actionTime(actions[0]);
  const lastTime = actionTime(actions[actions.length - 1]);
  const firstInspectTime = actionTime(actions.find(isInspectAction));
  const firstEditTime = actionTime(actions.find(isEditAction));
  const firstVerifierTime = actionTime(actions.find(isTestAction));

  return {
    timeToFirstInspectMs: diffMs(firstTime, firstInspectTime),
    timeToFirstEditMs: diffMs(firstTime, firstEditTime),
    timeToFirstVerifierMs: diffMs(firstTime, firstVerifierTime),
    meanEditToVerifierDelayMs: meanEditToVerifierDelayMs(actions),
    failureRecoveryLatencyMs: failureRecoveryLatencyMs(actions),
    totalSessionDurationMs: diffMs(firstTime, lastTime),
  };
}

export function actionTime(action: NormalizedAction | undefined): number | null {
  if (!action) return null;
  const time = Date.parse(action.provenance.createdAt);
  return Number.isFinite(time) ? time : null;
}

function meanEditToVerifierDelayMs(actions: NormalizedAction[]): number | null {
  const delays: number[] = [];
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    if (!isEditAction(action)) continue;
    const editTime = actionTime(action);
    const verifierTime = actionTime(actions.slice(index + 1).find(isTestAction));
    const delay = diffMs(editTime, verifierTime);
    if (delay !== null) delays.push(delay);
  }
  if (delays.length === 0) return null;
  return Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length);
}

function failureRecoveryLatencyMs(actions: NormalizedAction[]): number | null {
  const failedVerifierIndex = actions.findIndex((action) => isTestAction(action) && actionFailed(action));
  if (failedVerifierIndex === -1) return null;
  const failureTime = actionTime(actions[failedVerifierIndex]);
  const recoveryTime = actionTime(
    actions.slice(failedVerifierIndex + 1).find((action) => {
      return (isInspectAction(action) || isEditAction(action) || isTestAction(action) && actionSucceeded(action));
    })
  );
  return diffMs(failureTime, recoveryTime);
}

function diffMs(left: number | null, right: number | null): number | null {
  if (left === null || right === null) return null;
  return Math.max(0, right - left);
}
