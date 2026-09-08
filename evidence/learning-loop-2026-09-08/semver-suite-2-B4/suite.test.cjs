Here is an executable CommonJS Node.js test suite for the `compareSemver` function, which is imported from `./semver.cjs`. The suite covers all specified invariants, examples, and additional test cases.

```javascript
// test-semver.js
const assert = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for lower precedence versions', () => {
        assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        assert.strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for equal versions', () => {
        assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    });

    it('should return 1 for higher precedence versions', () => {
        assert.strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        assert.strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        assert.strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        assert.strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        assert.strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        assert.strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Edge cases
    it('should handle multi-digit numeric identifiers in prerelease', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.4', '1.0.0-beta.14'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.14', '1.0.0-beta.4'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.alpha'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.2'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
        assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0', '1.0.0-alpha', '1.0.0-alpha.1',
            '1.0.0-beta.2', '1.0.0-beta.11', '1.2.3', '1.2.4',
            '2.0.0', '10.0.0', '1.0.0+build.5'
        ];
        for (const a of versions) {
            for (const b of versions) {
                const result = compareSemver(a, b);
                assert.strictEqual(result + compareSemver(b, a), 0);
            }
        }
    });

    // Equality property
    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.0.0', '1.0.0-alpha', '1.0.0-alpha.1',
            '1.0.0-beta.2', '1.0.0-beta.11', '1.2.3', '1.2.4',
            '2.0.0', '10.0.0', '1.0.0+build.5'
        ];
        for (const version of versions) {
            assert.strictEqual(compareSemver(version, version), 0);
        }
    });
});
```

### Explanation:
- The test suite uses the `assert` module to check the output of the `compareSemver` function against expected values.
- It covers all specified invariants, including precedence rules, equality checks, and negation properties.
- Additional test cases are included to handle edge cases, such as multi-digit prerelease identifiers and mixed types.
- The suite can be executed in a Node.js environment using a test runner like Mocha.