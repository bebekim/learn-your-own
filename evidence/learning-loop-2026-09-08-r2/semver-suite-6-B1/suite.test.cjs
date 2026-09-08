const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 when the first version is lower than the second', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 when both versions are equal', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.5'), 0);
    });

    it('should return 1 when the first version is greater than the second', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Edge cases
    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha.2', '1.0.0-beta.1'), -1);
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha+build.1', '1.0.0-alpha'), 0);
    });

    // Custom cases using core numbers 28, 38 and prerelease identifiers
    it('should compare versions with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.28', '1.0.0-beta.38'), -1);
        strictEqual(compareSemver('1.0.0-beta.38', '1.0.0-beta.28'), 1);
        strictEqual(compareSemver('1.0.0-beta.38', '1.0.0-beta.38'), 0);
        strictEqual(compareSemver('1.0.0+build.28', '1.0.0+build.38'), 0);
    });
});

// Run the tests with: node test-semver.js