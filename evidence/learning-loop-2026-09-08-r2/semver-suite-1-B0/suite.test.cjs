// semver.test.js
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, and patch numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should give lower precedence to versions with prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should satisfy symmetry: compareSemver(a, b) === -compareSemver(b, a)', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -compareSemver('1.2.4', '1.2.3'));
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -compareSemver('1.0.0', '1.0.0-alpha'));
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    });

    // Examples
    it('should handle provided examples correctly', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Additional test cases
    it('should compare versions with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.23', '1.0.0-beta.33'), -1);
        strictEqual(compareSemver('1.0.0-beta.33', '1.0.0-beta.23'), 1);
        strictEqual(compareSemver('1.0.0-beta.23', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0', '1.0.0-beta.23'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
    });
});