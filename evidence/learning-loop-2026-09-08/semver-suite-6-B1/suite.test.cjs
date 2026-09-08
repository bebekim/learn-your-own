Here's a Node.js test suite using CommonJS syntax to test the `compareSemver` function imported from `./semver.cjs`. This suite covers various cases including the invariants, examples, and additional cases as specified.

```javascript
// test.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, and patch numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should consider prerelease lower than the same version without one', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should treat numeric prerelease identifiers as lower than alphanumeric ones', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should consider fewer prerelease identifiers as lower precedence', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.2'), -1);
    });

    it('should ignore build metadata for precedence', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Examples
    it('should return correct comparisons for provided examples', () => {
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
    it('should handle multi-digit numeric identifiers in prerelease', () => {
        strictEqual(compareSemver('1.0.0-beta.8', '1.0.0-beta.18'), -1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.2'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1'), -1);
    });

    it('should handle versions with and without build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.0-alpha+build.1', '1.0.0-alpha+build.2'), 0);
    });

    // Equality checks
    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });

    // Symmetry check
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.2',
            '2.0.0',
            '1.0.0+build.1',
            '1.0.0-alpha.1'
        ];
        versions.forEach(a => {
            versions.forEach(b => {
                if (a !== b) {
                    strictEqual(compareSemver(a, b), -compareSemver(b, a));
                }
            });
        });
    });
});
```

This test suite uses the `assert` module to verify that the `compareSemver` function behaves as expected based on the provided specification. It covers the invariants, examples, edge cases, and algebraic properties, ensuring comprehensive testing of the function.