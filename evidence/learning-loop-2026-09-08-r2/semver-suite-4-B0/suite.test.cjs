const { strictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariant tests
    it('should return -1 for lower precedence versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should return 1 for higher precedence versions', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
    });

    it('should consider prerelease versions lower than the same version without prerelease', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should compare prerelease identifiers correctly', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    // Additional test cases
    it('should handle core numbers 26 and 36', () => {
        strictEqual(compareSemver('1.0.0-26', '1.0.0-36'), -1);
        strictEqual(compareSemver('1.0.0-36', '1.0.0-26'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.26', '1.0.0-beta.36'), -1);
        strictEqual(compareSemver('1.0.0-beta.36', '1.0.0-beta.26'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.2', '1.0.0-alpha.1'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0-alpha'), 1);
    });

    // Edge case hints
    it('should handle multi-digit numeric identifiers in prerelease', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should handle major/minor/patch values with multiple digits', () => {
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.10.0', '1.2.0'), 1);
        strictEqual(compareSemver('1.0.10', '1.0.2'), 1);
    });
});