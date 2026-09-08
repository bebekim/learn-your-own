Here's an executable CommonJS Node.js test suite for the `compareSemver` function as specified. This test suite covers various cases including invariants, examples, and additional custom cases.

```javascript
// test.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, and patch versions numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
    });

    it('should prioritize versions without prerelease over those with prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should compare numeric and alphanumeric prerelease identifiers correctly', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
    });

    it('should consider the number of identifiers in prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1'), -1);
    });

    // Examples from the specification
    it('should match the provided examples', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Edge cases
    it('should handle edge cases correctly', () => {
        // Multi-digit numeric identifiers in prerelease
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        // Mixed numeric and alphanumeric prerelease identifiers
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        // Prerelease chains of different lengths
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1'), -1);
        // Build metadata on versions with and without prerelease
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
    });

    // Custom cases
    it('should handle custom cases correctly', () => {
        strictEqual(compareSemver('2.0.0', '2.0.0-beta.1'), 1); // stable > prerelease
        strictEqual(compareSemver('2.0.0-beta.2', '2.0.0-beta.12'), -1); // numeric comparison
        strictEqual(compareSemver('2.0.0-beta.2', '2.0.0-beta'), 1); // stable > prerelease
        strictEqual(compareSemver('2.0.0', '2.0.0+build.1'), 0); // build metadata ignored
    });

    // Algebraic properties
    it('should satisfy algebraic properties', () => {
        const a = '1.0.0';
        const b = '1.0.1';
        strictEqual(compareSemver(a, b), -compareSemver(b, a)); // a < b <=> -b < -a
        strictEqual(compareSemver(a, a), 0); // a == a
    });
});
```

### Explanation:
- This suite uses the `assert` module to perform strict equality checks on the outputs of the `compareSemver` function.
- Each test case covers a specific invariant, example, or edge case as outlined in the specification.
- Custom cases are added to ensure the function handles additional scenarios involving core numbers and prerelease identifiers.
- Algebraic properties of the comparison function are also tested to ensure consistency.