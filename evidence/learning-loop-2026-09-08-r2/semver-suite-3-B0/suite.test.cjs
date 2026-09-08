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
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
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

    // Additional cases
    it('should handle custom cases with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.25', '1.0.0-beta.35'), -1);
        strictEqual(compareSemver('1.0.0-beta.35', '1.0.0-beta.25'), 1);
        strictEqual(compareSemver('1.0.0-beta.25', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0', '1.0.0-beta.25'), 1);
        strictEqual(compareSemver('25.0.0', '35.0.0'), -1);
        strictEqual(compareSemver('35.0.0', '25.0.0'), 1);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });

    // Edge cases
    it('should correctly compare versions with build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.0+build.2', '1.0.0+build.1'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), 0);
    });

    it('should handle multi-digit numeric identifiers correctly', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha'), 1);
    });
});