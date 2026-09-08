// test-semver.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });

    it('should return -1 for lower precedence versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0); // build metadata ignored
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
        strictEqual(compareSemver('1.0.0-beta.27', '1.0.0-beta.37'), -1);
        strictEqual(compareSemver('1.0.0-beta.37', '1.0.0-beta.27'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.0', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });

    it('should compare major, minor, and patch values with multiple digits', () => {
        strictEqual(compareSemver('27.0.0', '37.0.0'), -1);
        strictEqual(compareSemver('37.0.0', '27.0.0'), 1);
        strictEqual(compareSemver('27.1.0', '27.0.0'), 1);
        strictEqual(compareSemver('27.0.1', '27.0.0'), 1);
        strictEqual(compareSemver('27.0.0', '27.0.1'), -1);
    });
});