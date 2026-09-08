const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Basic examples
    it('should return -1 for "1.2.3" and "1.2.4"', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    });

    it('should return -1 for "2.0.0" and "10.0.0"', () => {
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    });

    it('should return -1 for "1.0.0-alpha" and "1.0.0-alpha.1"', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return -1 for "1.0.0-alpha.1" and "1.0.0-alpha.beta"', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should return -1 for "1.0.0-beta.2" and "1.0.0-beta.11"', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should return -1 for "1.0.0-rc.1" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for "1.0.0+build.5" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) + compareSemver(b, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta',
            '2.0.0',
            '1.2.3',
            '1.2.4',
            '1.0.0-alpha.1',
            '1.0.0-alpha.beta',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '1.0.0-rc.1',
            '1.0.0+build.5',
            '1.0.0-rc.2',
            '1.0.0-alpha.2',
            '1.0.0-beta.1'
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    // Equality case
    it('should return 0 for identical versions', () => {
        strictEqual(compareSemver('1.2.3', '1.2.3'), 0);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1'), 0);
        strictEqual(compareSemver('2.0.0+build.5', '2.0.0+build.5'), 0);
    });

    // Custom cases using core numbers 23, 33
    it('should correctly compare versions with core numbers and prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-beta.23', '1.0.0-beta.33'), -1);
        strictEqual(compareSemver('1.0.0-beta.33', '1.0.0-beta.23'), 1);
        strictEqual(compareSemver('1.0.0-beta.23', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0', '1.0.0-beta.23'), 1);
    });

    // Edge cases
    it('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2'), -1);
        strictEqual(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1'), -1);
    });

    it('should handle prerelease chains of different lengths', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
    });

    it('should ignore build metadata in precedence', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), 0);
    });
});