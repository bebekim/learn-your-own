Here's an executable CommonJS Node.js test suite for the `compareSemver` function, which you can import from `./semver.cjs`. This suite covers all specified invariants, examples, and additional test cases using the core numbers 7, 17, and prerelease identifiers `beta.7`, `beta.17`.

```javascript
// test-semver.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, patch numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should consider prerelease versions lower than their normal counterparts', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should compare numeric prerelease identifiers lower than alphanumeric ones', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.alpha'), -1);
    });

    it('should consider fewer identifiers lower than more when all preceding are equal', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
    });

    it('should ignore build metadata in precedence', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Examples
    it('should return correct output for example cases', () => {
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
    it('should handle edge cases with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.7', '1.0.0-beta.17'), -1);
        strictEqual(compareSemver('1.0.0-beta.17', '1.0.0-beta.7'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-beta.1'), -1);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('2.7.0', '2.17.0'), -1);
        strictEqual(compareSemver('2.17.0', '2.7.0'), 1);
    });

    // Symmetry and equality
    it('should satisfy symmetry and equality properties', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), 0);
    });
});
```

To run this test suite, ensure you have Node.js installed, and use a testing framework like `node:test` or `mocha`. Save the code in a file named `test-semver.js`, and execute it in your terminal to see the results.