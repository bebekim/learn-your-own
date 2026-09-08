Here is an executable CommonJS test suite for the `compareSemver` function. This suite imports the function from `./semver.cjs` and covers all specified invariants, examples, and additional custom cases.

```javascript
// semver.test.js
const { strict: assert } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    it('should compare versions correctly based on major, minor, and patch', () => {
        assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
        assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
        assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
        assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
    });

    it('should consider prerelease versions lower than their base versions', () => {
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should compare prerelease identifiers correctly', () => {
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        assert.equal(compareSemver('1.0.0-beta.12', '1.0.0-beta.2'), 1);
        assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.12'), -1);
    });

    it('should ignore build metadata', () => {
        assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
    });

    it('should return 0 for equal versions', () => {
        assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.2'), 0);
    });

    it('should satisfy negation-based properties', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '1.0.0+build.5',
            '2.0.0',
            '10.0.0'
        ];
        for (const a of versions) {
            for (const b of versions) {
                const result = compareSemver(a, b);
                assert.equal(result + compareSemver(b, a), 0);
            }
        }
    });

    it('should handle additional custom cases', () => {
        assert.equal(compareSemver('2.0.0', '2.0.0-beta'), 1);
        assert.equal(compareSemver('2.0.0-beta.2', '2.0.0-beta.12'), -1);
        assert.equal(compareSemver('2.0.0-beta.12', '2.0.0-beta.2'), 1);
        assert.equal(compareSemver('2.0.0-beta.2', '2.0.0-beta'), 1);
        assert.equal(compareSemver('2.0.0-alpha', '2.0.0-alpha.1'), -1);
        assert.equal(compareSemver('2.0.0-alpha.1', '2.0.0-alpha.1'), 0);
    });
});
```

### Explanation:
- The test suite uses the `assert` module from Node.js to perform assertions.
- Each test case covers a specific invariant or example from the specification.
- The negation-based properties are verified by checking that `compareSemver(a, b) + compareSemver(b, a) === 0` for all pairs of versions.
- Custom cases involving the core numbers and prerelease identifiers are included to ensure comprehensive coverage.