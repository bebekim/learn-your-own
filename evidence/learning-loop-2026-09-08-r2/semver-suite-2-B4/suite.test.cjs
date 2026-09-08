// semver.test.js
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

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        strictEqual(compareSemver('1.0.0-beta.34', '1.0.0-beta.34'), 0);
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
        strictEqual(compareSemver('1.0.0-beta.24', '1.0.0-beta.34'), -1);
        strictEqual(compareSemver('1.0.0-beta.34', '1.0.0-beta.24'), 1);
    });

    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.alpha'), -1);
        strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.2'), 1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha'), 1);
    });

    it('should ignore build metadata', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            ['1.2.3', '1.2.4'],
            ['2.0.0', '10.0.0'],
            ['1.0.0-alpha', '1.0.0'],
            ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
            ['1.0.0-beta.2', '1.0.0-beta.11'],
            ['1.0.0', '1.0.0-rc.1'],
            ['1.0.0+build.5', '1.0.0']
        ];

        versions.forEach(([a, b]) => {
            strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
        });
    });

    // Reflexivity property
    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.2.3',
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.34',
            '1.0.0-beta.24'
        ];

        versions.forEach(version => {
            strictEqual(compareSemver(version, version), 0);
        });
    });
});