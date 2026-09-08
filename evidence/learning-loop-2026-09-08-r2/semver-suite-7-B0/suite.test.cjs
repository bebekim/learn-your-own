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
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
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

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.4'), 0);
    });

    // Additional test cases
    it('should handle core numbers 29 and 39', () => {
        strictEqual(compareSemver('1.0.0-beta.29', '1.0.0-beta.39'), -1);
        strictEqual(compareSemver('1.0.0-beta.39', '1.0.0-beta.29'), 1);
        strictEqual(compareSemver('1.0.0-beta.39', '1.0.0-beta.39'), 0);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.4'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.5'), 0);
    });

    // Edge cases
    it('should handle multi-digit numeric identifiers', () => {
        strictEqual(compareSemver('1.0.0-1.2.3', '1.0.0-1.2.4'), -1);
        strictEqual(compareSemver('1.0.0-1.2.4', '1.0.0-1.2.3'), 1);
    });

    it('should handle versions with and without prerelease', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0'), -1);
    });
});