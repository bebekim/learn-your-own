Here's a CommonJS Node.js test suite for the `compareSemver` function, which you would import from `./semver.cjs`. This suite covers the invariants, examples, and additional test cases as specified.

```javascript
// test/semver.test.js
const { strictEqual } = require('assert');
const compareSemver = require('../semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, and patch versions numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should give lower precedence to versions with prereleases', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-beta', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta.9'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
    });

    // Examples
    it('should return -1 for lower version', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });

    it('should return 1 for higher version', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
    });

    // Additional cases
    it('should handle core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('9.0.0', '19.0.0'), -1);
        strictEqual(compareSemver('1.0.0-beta.9', '1.0.0-beta.19'), 1);
        strictEqual(compareSemver('1.0.0-beta.19', '1.0.0-beta.9'), -1);
        strictEqual(compareSemver('1.0.0-beta.10', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta.1'), -1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-beta.1'), -1);
    });

    it('should handle different lengths of prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.2', '1.0.0-alpha.1'), 1);
    });

    // Algebraic properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        strictEqual(compareSemver('1.0.0', '1.0.1'), -compareSemver('1.0.1', '1.0.0'));
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -compareSemver('1.0.0', '1.0.0-alpha'));
    });

    it('should satisfy compareSemver(a, a) === 0', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    });
});
```

### Explanation:
- The test suite uses the `assert` module to perform strict equality checks.
- Each test case checks a specific invariant, example, or additional case as per the specification.
- The tests ensure that the function behaves correctly for various scenarios, including edge cases and algebraic properties, ensuring comprehensive coverage of the `compareSemver` function.