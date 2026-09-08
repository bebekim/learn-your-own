// test-semver.js
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for lower precedence versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    });

    it('should return 1 for higher precedence versions', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Edge cases
    it('should handle multi-digit numeric identifiers in prerelease', () => {
        strictEqual(compareSemver('1.0.0-beta.26', '1.0.0-beta.36'), -1);
        strictEqual(compareSemver('1.0.0-beta.36', '1.0.0-beta.26'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata in precedence', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0-alpha'), 1);
    });

    // Additional cases using core numbers
    it('should handle additional cases with core numbers', () => {
        strictEqual(compareSemver('2.6.0', '2.6.0'), 0);
        strictEqual(compareSemver('2.6.0', '2.6.1'), -1);
        strictEqual(compareSemver('2.6.1', '2.6.0'), 1);
        strictEqual(compareSemver('2.36.0', '2.36.0'), 0);
        strictEqual(compareSemver('2.36.0', '2.36.1'), -1);
        strictEqual(compareSemver('2.36.1', '2.36.0'), 1);
    });
});