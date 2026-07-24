# When asserting mathematical properties like antisymmetry (x === -y) in JavaScript tests, avoid strict/Object.is-based equality assertions that can spuriously distinguish 0 from -0; normalize or use loose numeric equality instead.

- classification: test-hallucination
- vehicle: skeleton-patch
- falsifiable_by: a frozen test that asserts -0 and 0 differ under strict equality and is judged correct against the spec's === semantics
- observed in runs: run-20260727-033735-1d3ad0, run-20260727-034825-d5ff86, run-20260727-042403-f77e15, run-20260727-043841-2bacf2, run-20260727-044729-9c8ff8
- disagreements: antisymmetry holds for ordered pairs; antisymmetry: compareSemver(a, b) === -compareSemver(b, a); antisymmetry: compareSemver(a, b) === -compareSemver(b, a); antisymmetry: compareSemver(a, b) === -compareSemver(b, a); mixed numeric and alphanumeric prerelease identifiers; antisymmetry: compareSemver(a,b) === -compareSemver(b,a)
- status: promoted

## Rationale
The spec's invariant states compareSemver(a, b) === -compareSemver(b, a), using ordinary equality where 0 === -0 is true. The implementation returns plain 0 in the equal-version case, which is mathematically correct. However, the test computes ab and -ba and compares them with node:assert/strict's assert.equal, which is aliased to strictEqual and uses Object.is semantics, distinguishing 0 from -0. When both compareSemver calls return 0, negating one produces -0, and Object.is(0, -0) is false, causing a spurious failure that has nothing to do with the correctness of compareSemver's precedence logic.

## Evidence
Verifier output: "compareSemver('1.0.0+build.5','1.0.0')=0 should be -compareSemver('1.0.0','1.0.0+build.5')=0" with "expected: -0, actual: 0, operator: 'strictEqual'" — the mismatch is purely the -0/0 distinction introduced by negating a returned 0, not a real ordering violation.

## Suggested spec edit
N/A

## Prompt patch
```js
// assert/strict uses Object.is: -(0) is -0, which does NOT equal 0.
// Normalize by ADDING zero AFTER all arithmetic, on every side being compared.
const num = (x) => x + 0;

test('antisymmetry: compareSemver(a, b) === -compareSemver(b, a)', () => {
  const pairs = [
    ['1.0.0', '1.0.1'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0+build.5', '1.0.0'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(num(compareSemver(a, b)), num(-compareSemver(b, a)));
  }
});
```
