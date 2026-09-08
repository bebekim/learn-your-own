const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariants
    it('should return 0 when both versions are equal', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    });

    it('should return -1 for versions with lower precedence', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0); // Build metadata ignored
    });

    it('should return 1 for versions with higher precedence', () => {
        strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
        strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        strictEqual(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '2.0.0',
            '10.0.0',
            '1.2.3',
            '1.2.4',
            '1.0.0+build.5',
            '1.0.0-rc.1',
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    // Additional cases
    it('should handle additional test cases', () => {
        strictEqual(compareSemver('1.0.0-beta.25', '1.0.0-beta.35'), -1);
        strictEqual(compareSemver('1.0.0-beta.35', '1.0.0-beta.25'), 1);
        strictEqual(compareSemver('1.0.0-beta.25', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0', '1.0.0-beta.25'), 1);
        strictEqual(compareSemver('1.0.0+build.25', '1.0.0+build.35'), 0); // Build metadata ignored
        strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1); // Alphanumeric > numeric
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1); // Fewer identifiers < more
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1); // More identifiers > fewer
    });
});