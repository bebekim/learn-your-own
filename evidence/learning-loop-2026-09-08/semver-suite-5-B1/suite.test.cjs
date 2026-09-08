Here's an executable CommonJS Node.js test suite for the `compareSemver` function, which you would import from `./semver.cjs`. This suite covers all specified invariants, examples, and additional cases involving the core numbers 7, 17, and prerelease identifiers `beta.7` and `beta.17`.

```javascript
// test.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Examples from the specification
    it('should return -1 for compareSemver("1.2.3", "1.2.4")', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    });

    it('should return -1 for compareSemver("2.0.0", "10.0.0")', () => {
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha", "1.0.0-alpha.1")', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta")', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-beta.2", "1.0.0-beta.11")', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-rc.1", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for compareSemver("1.0.0+build.5", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Additional test cases
    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    });

    it('should return 1 for compareSemver("1.2.4", "1.2.3")', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
    });

    it('should return -1 for compareSemver("1.0.0-beta.7", "1.0.0-beta.17")', () => {
        strictEqual(compareSemver('1.0.0-beta.7', '1.0.0-beta.17'), -1);
    });

    it('should return 1 for compareSemver("1.0.0-beta.17", "1.0.0-beta.7")', () => {
        strictEqual(compareSemver('1.0.0-beta.17', '1.0.0-beta.7'), 1);
    });

    it('should return -1 for compareSemver("1.0.0-beta.7", "1.0.0-beta")', () => {
        strictEqual(compareSemver('1.0.0-beta.7', '1.0.0-beta'), -1);
    });

    it('should return 1 for compareSemver("1.0.0-beta", "1.0.0-beta.7")', () => {
        strictEqual(compareSemver('1.0.0-beta', '1.0.0-beta.7'), 1);
    });

    it('should return 0 for compareSemver("1.0.0+build.1", "1.0.0+build.2")', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });

    it('should return -1 for compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta.1")', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta.1'), -1);
    });

    it('should return 1 for compareSemver("1.0.0-alpha.beta.1", "1.0.0-alpha.1")', () => {
        strictEqual(compareSemver('1.0.0-alpha.beta.1', '1.0.0-alpha.1'), 1);
    });

    // Edge cases
    it('should handle multi-digit numeric identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.10', '1.0.0-alpha.2'), 1);
        strictEqual(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.2', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
    });

    it('should compare major/minor/patch values with multiple digits', () => {
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.10.0', '1.2.0'), 1);
        strictEqual(compareSemver('1.2.10', '1.2.2'), 1);
    });
});

// To run the tests, use the command: node test.js
```

This test suite uses the `assert` module to validate the outputs of the `compareSemver` function against expected results. Each test case corresponds to the invariants and examples provided in the specification, ensuring comprehensive coverage of the function's behavior.