import assert from 'node:assert/strict';
import test from 'node:test';
import { exactDifferenceInterval, exactLowerBound, superiorityPValue } from '../src/lyo/domain/exact-binomial-difference.ts';

function binomial(n: number, p: number): number[] {
  const pmf: number[] = [];
  let choose = 1;
  for (let k = 0; k <= n; k++) { pmf.push(choose * p ** k * (1 - p) ** (n - k)); choose = choose * (n - k) / (k + 1); }
  return pmf;
}

test('the p-value matches the closed form for complete separation', () => {
  // Only (4, 0) is as extreme; sup over p of p^4 (1-p)^4 is attained at p = 1/2.
  assert.ok(Math.abs(superiorityPValue({ passes: 4, assigned: 4 }, { passes: 0, assigned: 4 }, 0) - 1 / 256) < 1e-12);
});

test('the lower bound covers the true difference at its stated level', () => {
  const n = 6, alpha = 0.05;
  const bounds = Array.from({ length: n + 1 }, (_, a) => Array.from({ length: n + 1 },
    (_, b) => exactLowerBound({ passes: a, assigned: n }, { passes: b, assigned: n }, alpha)));
  for (const pA of [0.1, 0.5, 0.8, 0.95]) for (const pN of [0.05, 0.3, 0.5, 0.9]) {
    const A = binomial(n, pA), N = binomial(n, pN);
    let miss = 0;
    for (let a = 0; a <= n; a++) for (let b = 0; b <= n; b++) if (bounds[a][b] > pA - pN + 1e-9) miss += A[a] * N[b];
    assert.ok(miss <= alpha, `non-coverage ${miss} at pA=${pA}, pN=${pN}`);
  }
});

test('an empty arm yields no information', () => {
  assert.deepEqual(exactDifferenceInterval({ passes: 3, assigned: 3 }, { passes: 0, assigned: 0 }, 0.1), [-1, 1]);
});
