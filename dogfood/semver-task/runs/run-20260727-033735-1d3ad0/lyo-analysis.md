# LYO Run Analysis

## Run run-20260727-033735-1d3ad0

### Disagreement 1: antisymmetry holds for ordered pairs

- classification: **test-hallucination**
- rationale: The spec's invariant states compareSemver(a, b) === -compareSemver(b, a), using ordinary equality where 0 === -0 is true. The implementation returns plain 0 in the equal-version case, which is mathematically correct. However, the test computes ab and -ba and compares them with node:assert/strict's assert.equal, which is aliased to strictEqual and uses Object.is semantics, distinguishing 0 from -0. When both compareSemver calls return 0, negating one produces -0, and Object.is(0, -0) is false, causing a spurious failure that has nothing to do with the correctness of compareSemver's precedence logic.
- evidence: `Verifier output: "compareSemver('1.0.0+build.5','1.0.0')=0 should be -compareSemver('1.0.0','1.0.0+build.5')=0" with "expected: -0, actual: 0, operator: 'strictEqual'" — the mismatch is purely the -0/0 distinction introduced by negating a returned 0, not a real ordering violation.`
- lesson: When asserting mathematical properties like antisymmetry (x === -y) in JavaScript tests, avoid strict/Object.is-based equality assertions that can spuriously distinguish 0 from -0; normalize or use loose numeric equality instead.
- suggested spec edit: N/A

<details><summary>verifier output</summary>

```
not ok 17 - antisymmetry holds for ordered pairs
  ---
  duration_ms: 0.494833
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-033735-1d3ad0/verify/generated/tests/semver.test.js:155:1'
  failureType: 'testCodeFailure'
  error: |-
    compareSemver('1.0.0+build.5','1.0.0')=0 should be -compareSemver('1.0.0','1.0.0+build.5')=0
    + actual - expected
    
    + 0
    - -0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -0
  actual: 0
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-033735-1d3ad0/verify/generated/tests/semver.test.js:175:12)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: spec example: 1.2.3 < 1.2.4
```
</details>

## Run run-20260727-034825-d5ff86

### Disagreement 1: antisymmetry: compareSemver(a, b) === -compareSemver(b, a)

- classification: **test-hallucination**
- rationale: The spec's invariant `compareSemver(a, b) === -compareSemver(b, a)` uses ordinary JavaScript equality, under which `0 === -0` is true. The test instead uses `assert.equal` from `node:assert/strict`, which performs the comparison via `Object.is`, so `Object.is(0, -0)` is `false`. The failure is purely a signed-zero artifact of negating a `0` return value (`-0`) versus the implementation's literal `0` return, not an actual violation of the antisymmetry property described in the spec. The spec never mentions distinguishing `+0` from `-0`, so asserting on that distinction is an assumption the test writer introduced beyond the spec.
- evidence: `Verifier output: "failed for (1.0.0+build.5, 1.0.0)\n+ actual - expected\n+ 0\n- -0" with expected: -0, actual: 0, operator: 'strictEqual' — showing the mismatch is solely between 0 and -0, not a sign/direction error.`
- lesson: When asserting numeric equality invariants like a === -f(b,a), be aware that strict-equality assertion helpers may use Object.is semantics that distinguish +0 from -0; normalize or avoid relying on signed-zero distinctions unless the spec explicitly requires them.
- suggested spec edit: N/A

<details><summary>verifier output</summary>

```
not ok 23 - antisymmetry: compareSemver(a, b) === -compareSemver(b, a)
  ---
  duration_ms: 0.465292
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-034825-d5ff86/verify/generated/tests/semver.test.js:136:1'
  failureType: 'testCodeFailure'
  error: |-
    failed for (1.0.0+build.5, 1.0.0)
    + actual - expected
    
    + 0
    - -0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -0
  actual: 0
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-034825-d5ff86/verify/generated/tests/semver.test.js:151:12)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: full semver precedence ordering example
```
</details>

## Run run-20260727-042403-f77e15

### Disagreement 1: antisymmetry: compareSemver(a, b) === -compareSemver(b, a)

- classification: **test-hallucination**
- rationale: The spec's invariant is stated as a mathematical equality (compareSemver(a,b) === -compareSemver(b,a)), and under normal JavaScript === semantics 0 === -0 is true. The implementation correctly returns 0 for equal versions per the required return-type '-1 | 0 | 1'. The test uses node:assert/strict's equal(), which performs a SameValue (Object.is) comparison that treats +0 and -0 as distinct. Because unary negation of 0 always yields -0 in JS, any spec-compliant implementation that returns plain 0 for equality will fail this assertion, regardless of correctness. The spec never mentions signed-zero distinction or Object.is semantics, so the test is enforcing a stricter, JS-quirk-driven check that the spec does not require.
- evidence: `Verifier output: 'compareSemver("1.0.0+build.5", "1.0.0") === -compareSemver("1.0.0", "1.0.0+build.5")' failed with 'expected: -0, actual: 0, operator: strictEqual' -- while spec invariant states only 'compareSemver(a, b) === -compareSemver(b, a) for all valid inputs' with no mention of signed-zero or Object.is semantics.`
- lesson: When asserting numeric invariants involving negation, avoid strict/Object.is-based equality checks that distinguish +0 from -0 unless the spec explicitly requires that distinction; use loose equality or explicit zero-normalization instead.

<details><summary>verifier output</summary>

```
not ok 14 - antisymmetry: compareSemver(a, b) === -compareSemver(b, a)
  ---
  duration_ms: 0.46425
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-042403-f77e15/verify/generated/tests/semver.test.js:120:1'
  failureType: 'testCodeFailure'
  error: |-
    compareSemver("1.0.0+build.5", "1.0.0") === -compareSemver("1.0.0", "1.0.0+build.5")
    + actual - expected
    
    + 0
    - -0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -0
  actual: 0
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-042403-f77e15/verify/generated/tests/semver.test.js:141:12)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: mixed numeric and alphanumeric prerelease identifiers in chains
```
</details>

## Run run-20260727-043841-2bacf2

### Disagreement 1: antisymmetry: compareSemver(a, b) === -compareSemver(b, a)

- classification: **test-hallucination**
- rationale: The spec's antisymmetry invariant is stated using JavaScript's === operator ('compareSemver(a, b) === -compareSemver(b, a)'), under which 0 === -0 is true. The test, however, uses node:assert/strict's assert.equal, which delegates to strictEqual and applies SameValue (Object.is) semantics, distinguishing 0 from -0. When compareSemver(b,a) returns 0 for equal versions, negating it produces -0, and the test then fails an equality check that the spec's own equality operator would pass. The implementation's return value of 0 fully satisfies the spec invariant as literally written; the test imposes an additional, spec-unsupported distinction between +0 and -0.
- evidence: `Spec: "compareSemver(a, b) === -compareSemver(b, a) for all valid inputs" (uses ===, under which 0 === -0). Test: "assert.equal(+fwd, +(-bwd), ...)" using require('node:assert/strict'), which fails 0 vs -0 per the verifier output (expected: -0, actual: 0, operator: 'strictEqual').`
- lesson: When translating a spec's mathematical equality (===) into test assertions, avoid assertion libraries or operations (e.g., unary negation combined with Object.is-based strictEqual) that introduce distinctions like +0 vs -0 not present in the spec's own equality semantics.

<details><summary>verifier output</summary>

```
not ok 24 - antisymmetry: compareSemver(a, b) === -compareSemver(b, a)
  ---
  duration_ms: 0.355333
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-043841-2bacf2/verify/generated/tests/semver.test.js:150:1'
  failureType: 'testCodeFailure'
  error: |-
    antisymmetry for 1.0.0+build.5 vs 1.0.0
    + actual - expected
    
    + 0
    - -0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -0
  actual: 0
  operator: 'strictEqual'
  stack: |-
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-043841-2bacf2/verify/generated/tests/semver.test.js:168:12)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: full semver precedence ordering example
```
</details>

## Run run-20260727-044729-9c8ff8

### Disagreement 1: mixed numeric and alphanumeric prerelease identifiers

- classification: **test-hallucination**
- rationale: The spec states that a numeric prerelease identifier always has lower precedence than an alphanumeric one. In the failing case, 'alpha.1.beta' vs 'alpha.1.2' differ at the third identifier: 'beta' (alphanumeric) vs '2' (numeric). Since numeric < alphanumeric, '2' has lower precedence than 'beta', so 'alpha.1.beta' > 'alpha.1.2', meaning compareSemver should return 1, not -1. The implementation correctly returns 1 per this rule, but the test asserts -1, contradicting the spec's explicit invariant.
- evidence: `Spec invariant: 'A numeric prerelease identifier always has lower precedence than an alphanumeric one.' Test: eq(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1.2'), -1); Code branch: 'else if (!aIsNumeric && bIsNumeric) { return 1; }' correctly implements the spec rule.`
- lesson: When writing prerelease-identifier comparison tests with mixed numeric/alphanumeric identifiers, verify each identifier pair against the spec's numeric-vs-alphanumeric precedence rule before asserting an expected sign.

<details><summary>verifier output</summary>

```
not ok 22 - mixed numeric and alphanumeric prerelease identifiers
  ---
  duration_ms: 0.381958
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:115:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    
    1 !== -1
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -1
  actual: 1
  operator: 'strictEqual'
  stack: |-
    eq (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:7:10)
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:116:3)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: antisymmetry: compareSemver(a,b) === -compareSemver(b,a)
```
</details>

### Disagreement 2: antisymmetry: compareSemver(a,b) === -compareSemver(b,a)

- classification: **test-hallucination**
- rationale: The spec's antisymmetry invariant only requires compareSemver(a,b) === -compareSemver(b,a) mathematically, where 0 === -0. The implementation always returns a plain 0 for equal-precedence versions, satisfying this. The test's own `eq` helper claims to normalize -0 via `actual + 0`, but it only applies that normalization to the `actual` argument, not to the `expected` argument (`-(compareSemver(b,a) + 0)` can itself evaluate to -0, which is passed straight into assert/strict's Object.is-based equal). This is a defect in the test's own helper logic, not a deviation of the implementation from the spec, and it enforces a distinction between +0 and -0 that the spec never mentions or requires.
- evidence: `Test comment: "Normalize -0 to +0 so Object.is-based strict equality doesn't spuriously fail." yet `eq` is defined as `assert.equal(actual + 0, expected)` — expected is never normalized, and the antisymmetry test calls `eq(compareSemver(a, b), -(compareSemver(b, a) + 0))`, producing an unnormalized -0 as `expected` while the spec only states "compareSemver(a, b) === -compareSemver(b, a) for all valid inputs" with no mention of signed zero.`
- lesson: When writing equality helpers intended to neutralize floating point sign-of-zero artifacts, apply the normalization symmetrically to every value compared, not just one side.

<details><summary>verifier output</summary>

```
not ok 23 - antisymmetry: compareSemver(a,b) === -compareSemver(b,a)
  ---
  duration_ms: 0.141166
  type: 'test'
  location: '/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:120:1'
  failureType: 'testCodeFailure'
  error: |-
    Expected values to be strictly equal:
    + actual - expected
    
    + 0
    - -0
    
  code: 'ERR_ASSERTION'
  name: 'AssertionError'
  expected: -0
  actual: 0
  operator: 'strictEqual'
  stack: |-
    eq (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:7:10)
    TestContext.<anonymous> (/Users/marcus.kim/repositories/individual/agent-learning-workflow/dogfood/semver-task/runs/run-20260727-044729-9c8ff8/verify/generated/tests/semver.test.js:135:5)
    Test.runInAsyncScope (node:async_hooks:227:14)
    Test.run (node:internal/test_runner/test:1201:25)
    Test.processPendingSubtests (node:internal/test_runner/test:831:18)
    Test.postRun (node:internal/test_runner/test:1330:19)
    Test.run (node:internal/test_runner/test:1258:12)
    async Test.processPendingSubtests (node:internal/test_runner/test:831:7)
  ...
# Subtest: reflexivity: compareSemver(a, a) === 0
```
</details>

## Credibility gate

- **future-runs** — test-hallucination: observed in 5 run(s), 1 spec(s), helpful=5 harmful=0 wilsonLower=0.57 — The spec's invariant states compareSemver(a, b) === -compareSemver(b, a), using ordinary equality where 0 === -0 is true. The implementation returns plain 0 in the equal-version case, which is mathematically correct. However, the test computes ab and -ba and compares them with node:assert/strict's assert.equal, which is aliased to strictEqual and uses Object.is semantics, distinguishing 0 from -0. When both compareSemver calls return 0, negating one produces -0, and Object.is(0, -0) is false, causing a spurious failure that has nothing to do with the correctness of compareSemver's precedence logic. (`lyo-lessons/lesson-1-test-hallucination.md`)
