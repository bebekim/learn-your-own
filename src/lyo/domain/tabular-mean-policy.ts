/** One randomized intervention per episode; measured returns train a tabular policy. */

export interface ActionEstimate {
  action: string;
  count: number;
  mean: number | null;
}

/**
 * The controller's one decision point: a fixed action always wins (evaluation
 * only, enforced by the caller); explore mode draws uniformly over the
 * registered actions; evaluate mode without a fixed action exploits the best
 * observed mean once every action has at least one measured outcome, and
 * otherwise falls back to the baseline. Propensity is exact under explore
 * (uniform draw) and 1 otherwise (a deterministic pick, not a policy mixture).
 */
export function selectAction(input: {
  actions: readonly string[];
  baselineAction: string;
  mode: 'explore' | 'evaluate';
  fixedAction?: string;
  estimates: readonly ActionEstimate[];
  draw?: number;
}): { action: string; propensity: number } {
  if (input.fixedAction) return { action: input.fixedAction, propensity: 1 };
  if (input.mode === 'explore') {
    const draw = input.draw ?? NaN;
    if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error('random draw must be in [0, 1)');
    return { action: input.actions[Math.floor(draw * input.actions.length)], propensity: 1 / input.estimates.length };
  }
  let action = input.baselineAction;
  if (input.estimates.every(estimate => estimate.count > 0)) {
    action = input.estimates.reduce((best, current) => current.mean! > best.mean! ? current : best,
      input.estimates.find(estimate => estimate.action === action)!).action;
  }
  return { action, propensity: 1 };
}
