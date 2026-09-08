// test.js
const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should compare major, minor, and patch versions numerically', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should consider prerelease versions lower than the same version without one', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should compare prerelease identifiers left to right', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should consider numeric prerelease identifiers lower than alphanumeric ones', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should consider shorter prerelease identifiers lower than longer ones', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
    });

    it('should ignore build metadata for precedence', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Algebraic properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -compareSemver('1.2.4', '1.2.3'));
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -compareSemver('1.0.0', '1.0.0-alpha'));
    });

    it('should satisfy compareSemver(a, a) === 0', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.5'), 0);
    });

    // Additional test cases
    it('should handle custom cases with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.24', '1.0.0-beta.34'), -1);
        strictEqual(compareSemver('1.0.0-beta.34', '1.0.0-beta.24'), 1);
        strictEqual(compareSemver('24.0.0', '34.0.0'), -1);
        strictEqual(compareSemver('34.0.0', '24.0.0'), 1);
        strictEqual(compareSemver('24.0.0-alpha', '24.0.0'), -1);
        strictEqual(compareSemver('24.0.0-alpha.1', '24.0.0-alpha.2'), -1);
        strictEqual(compareSemver('24.0.0-alpha.2', '24.0.0-alpha.1'), 1);
    });

    // Edge cases
    it('should handle edge cases with multi-digit numeric identifiers', () => {
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

    it('should handle build metadata on versions with and without prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha+build.1', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
    });
});