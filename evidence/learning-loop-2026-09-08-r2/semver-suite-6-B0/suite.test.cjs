// test-semver.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariant tests
    it('should return -1 for lower precedence versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Equal precedence tests
    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });

    // Inverse tests
    it('should return the inverse for swapped inputs', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0+build.5'), 0);
    });

    // Custom cases using core numbers 28, 38 and prerelease identifiers
    it('should handle custom cases with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.28', '1.0.0-beta.38'), -1);
        strictEqual(compareSemver('1.0.0-beta.38', '1.0.0-beta.28'), 1);
        strictEqual(compareSemver('1.0.0-beta.28', '1.0.0-beta.28'), 0);
        strictEqual(compareSemver('2.0.0-alpha.28', '2.0.0-alpha.38'), -1);
        strictEqual(compareSemver('2.0.0-alpha.38', '2.0.0-alpha.28'), 1);
        strictEqual(compareSemver('2.0.0-alpha.28', '2.0.0-alpha.28'), 0);
    });

    // Edge case tests
    it('should handle edge cases correctly', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.2.3+build.1', '1.2.3+build.2'), 0);
        strictEqual(compareSemver('1.2.3+build.1', '1.2.3'), 0);
    });
});