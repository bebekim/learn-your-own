import assert from 'node:assert/strict';
import test from 'node:test';
import { stratifiedExactPValues, type StratumCounts } from '../src/lyo/domain/stratified-exact-test.ts';

test('one stratum reduces to the hypergeometric tail', () => {
  const p = stratifiedExactPValues([{ advice: { passes: 4, assigned: 4 }, control: { passes: 0, assigned: 4 } }]);
  assert.ok(Math.abs(p.benefit - 1 / 70) < 1e-12);
  assert.ok(Math.abs(p.harm - 1) < 1e-12);
});

test('strata whose outcomes do not vary carry no evidence', () => {
  const p = stratifiedExactPValues([
    { advice: { passes: 3, assigned: 3 }, control: { passes: 3, assigned: 3 } },
    { advice: { passes: 0, assigned: 3 }, control: { passes: 0, assigned: 3 } },
    { advice: { passes: 2, assigned: 2 }, control: { passes: 0, assigned: 0 } },
  ]);
  assert.deepEqual(p, { benefit: 1, harm: 1 });
});

test('false promotion stays within alpha for every fair assignment, however alike same-stratum outcomes are', () => {
  // No effect: each session's outcome is fixed whatever it is assigned. Repository "a" nearly always
  // passes and "b" nearly always fails; validity must come from the assignment, not independence.
  const sessions = [...Array(6).fill(['a', true]), ['a', false], ...Array(6).fill(['b', false]), ['b', true]] as Array<[string, boolean]>;
  const alpha = 0.05;
  let falsePromotion = 0;
  for (let mask = 0; mask < 2 ** sessions.length; mask++) {
    const strata = new Map<string, StratumCounts>();
    sessions.forEach(([repo, passes], index) => {
      const stratum = strata.get(repo) ?? { advice: { passes: 0, assigned: 0 }, control: { passes: 0, assigned: 0 } };
      const arm = mask & (1 << index) ? stratum.advice : stratum.control;
      arm.assigned++; if (passes) arm.passes++;
      strata.set(repo, stratum);
    });
    if (stratifiedExactPValues([...strata.values()]).benefit <= alpha) falsePromotion += 2 ** -sessions.length;
  }
  assert.ok(falsePromotion <= alpha, `false promotion probability ${falsePromotion}`);
});
