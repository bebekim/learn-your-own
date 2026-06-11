import {
  hasExternalSideEffects,
  hasUnsafeWrite,
} from '../semantics.ts';
import type { NormalizedAction } from '../syntax.ts';

export function policyWarningsForRun(actions: NormalizedAction[]): string[] {
  return policyWarningsForActions(actions);
}

export function policyWarningsForActionWindow(
  actions: NormalizedAction[],
  startIndex: number,
  endIndex: number
): string[] {
  const start = Math.max(0, startIndex);
  const end = Math.min(actions.length - 1, Math.max(start, endIndex));
  return policyWarningsForActions(actions.slice(start, end + 1));
}

function policyWarningsForActions(actions: NormalizedAction[]): string[] {
  const warnings: string[] = [];
  if (actions.some(hasExternalSideEffects)) warnings.push('run_contains_external_side_effects');
  if (hasUnsafeWrite(actions)) warnings.push('run_contains_unsafe_write');
  return warnings;
}
