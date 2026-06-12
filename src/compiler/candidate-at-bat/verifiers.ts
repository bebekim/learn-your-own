import {
  hasVerifiedCompletion,
  isEditAction,
  isTestAction,
} from '../semantics.ts';
import type { NormalizedAction } from '../syntax.ts';
import type {
  CandidateAtBatMatchedVerifier,
  CandidateAtBatTaskContext,
  CandidateAtBatVerifierQuality,
  CandidateAtBatVerifierSpec,
} from '../candidate-at-bat.ts';

export interface VerifierEvaluation {
  shipReadiness: boolean;
  verifierQuality: CandidateAtBatVerifierQuality;
  matchedVerifiers: CandidateAtBatMatchedVerifier[];
  missingRequiredVerifiers: string[];
  matchedActions: NormalizedAction[];
}

export function evaluateVerifierSpecs(
  actions: NormalizedAction[],
  specs: CandidateAtBatVerifierSpec[]
): VerifierEvaluation {
  if (specs.length === 0) {
    const legacyPasses = hasVerifiedCompletion(actions);
    const testActions = actions.filter(isTestAction);
    return {
      shipReadiness: legacyPasses,
      verifierQuality: legacyPasses ? 'moderate' : testActions.length > 0 ? 'weak' : 'missing',
      matchedVerifiers: [],
      missingRequiredVerifiers: [],
      matchedActions: testActions,
    };
  }

  const lastEditIndex = findLastIndex(actions, isEditAction);
  const matched: Array<CandidateAtBatMatchedVerifier & { action: NormalizedAction }> = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const command = action.command?.argvSummary;
    if (!command) continue;

    for (const spec of specs) {
      if (!commandMatches(command, spec)) continue;
      matched.push({
        id: spec.id,
        kind: spec.kind,
        required: spec.required,
        command,
        evidenceRef: action.provenance.evidenceRef,
        passed: actionSucceeded(action),
        freshAfterFinalEdit: lastEditIndex === -1 ? false : index > lastEditIndex,
        action,
      });
    }
  }

  const missingRequiredVerifiers = specs
    .filter((spec) => spec.required)
    .filter((spec) => {
      return !matched.some((verifier) => {
        return verifier.id === spec.id
          && verifier.required
          && verifier.passed
          && verifier.freshAfterFinalEdit;
      });
    })
    .map((spec) => spec.id);
  const shipReadiness = specs.some((spec) => spec.required)
    ? missingRequiredVerifiers.length === 0 && lastEditIndex !== -1
    : matched.some((verifier) => verifier.passed && verifier.freshAfterFinalEdit);

  return {
    shipReadiness,
    verifierQuality: verifierQuality({
      shipReadiness,
      missingRequiredVerifiers,
      matchedVerifiers: matched,
    }),
    matchedVerifiers: matched.map(({ action: _action, ...verifier }) => verifier),
    missingRequiredVerifiers,
    matchedActions: uniqueActions(matched.map((verifier) => verifier.action)),
  };
}

export function hasRegressionEvidence(
  taskContext: CandidateAtBatTaskContext,
  actions: NormalizedAction[],
  verifierEvaluation: VerifierEvaluation
): boolean {
  if (taskContext.baseline.existingTestsPass !== true && taskContext.baseline.buildSucceeds !== true) {
    return false;
  }

  const lastEditIndex = findLastIndex(actions, isEditAction);
  if (lastEditIndex === -1) return false;

  if ((taskContext.verifiers ?? []).length > 0) {
    return verifierEvaluation.matchedVerifiers.some((verifier) => {
      return verifier.required && verifier.freshAfterFinalEdit && !verifier.passed;
    });
  }

  const finalVerifier = actions.slice(lastEditIndex + 1).findLast(isTestAction);
  return finalVerifier ? actionFailed(finalVerifier) : false;
}

export function hasVerifierPassAfterVerifierFailure(actions: NormalizedAction[]): boolean {
  let sawFailure = false;
  for (const action of actions) {
    if (!isTestAction(action)) continue;
    if (actionFailed(action)) sawFailure = true;
    if (sawFailure && actionSucceeded(action)) return true;
  }
  return false;
}

export function actionSucceeded(action: NormalizedAction): boolean {
  return action.status === 'succeeded' || action.command?.exitCode === 0;
}

export function actionFailed(action: NormalizedAction): boolean {
  return action.status === 'failed' || (
    typeof action.command?.exitCode === 'number' && action.command.exitCode !== 0
  );
}

function commandMatches(command: string, spec: CandidateAtBatVerifierSpec): boolean {
  const mode = spec.matchMode ?? 'contains';
  if (mode === 'exact') return command === spec.commandPattern;
  if (mode === 'regex') {
    try {
      return new RegExp(spec.commandPattern).test(command);
    } catch {
      return false;
    }
  }
  return command.includes(spec.commandPattern);
}

function verifierQuality(input: {
  shipReadiness: boolean;
  missingRequiredVerifiers: string[];
  matchedVerifiers: CandidateAtBatMatchedVerifier[];
}): CandidateAtBatVerifierQuality {
  if (!input.shipReadiness || input.missingRequiredVerifiers.length > 0) return 'missing';

  const freshPassed = input.matchedVerifiers.filter((verifier) => {
    return verifier.passed && verifier.freshAfterFinalEdit;
  });
  if (freshPassed.some((verifier) => verifier.kind === 'broad')) return 'strong';
  if (freshPassed.some((verifier) => verifier.kind === 'targeted' || verifier.kind === 'build')) {
    return 'moderate';
  }
  return freshPassed.length > 0 ? 'weak' : 'missing';
}

function uniqueActions(actions: NormalizedAction[]): NormalizedAction[] {
  const byId = new Map<string, NormalizedAction>();
  for (const action of actions) byId.set(action.actionId, action);
  return Array.from(byId.values());
}

function findLastIndex<T>(values: T[], predicate: (value: T) => boolean): number {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (predicate(values[index])) return index;
  }
  return -1;
}
