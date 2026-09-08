// test.js
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Examples from the specification
    it('should return -1 for compareSemver("1.2.3", "1.2.4")', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    });

    it('should return -1 for compareSemver("2.0.0", "10.0.0")', () => {
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha", "1.0.0-alpha.1")', () => {
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta")', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-beta.2", "1.0.0-beta.11")', () => {
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    });

    it('should return -1 for compareSemver("1.0.0-rc.1", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for compareSemver("1.0.0+build.5", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Additional test cases using core numbers and prerelease identifiers
    it('should return -1 for compareSemver("1.0.0-beta.22", "1.0.0-beta.32")', () => {
        strictEqual(compareSemver('1.0.0-beta.22', '1.0.0-beta.32'), -1);
    });

    it('should return 1 for compareSemver("1.0.0-beta.32", "1.0.0-beta.22")', () => {
        strictEqual(compareSemver('1.0.0-beta.32', '1.0.0-beta.22'), 1);
    });

    it('should return 0 for compareSemver("1.0.0-beta.22", "1.0.0-beta.22")', () => {
        strictEqual(compareSemver('1.0.0-beta.22', '1.0.0-beta.22'), 0);
    });

    it('should return -1 for compareSemver("1.0.0-beta.22", "1.0.0")', () => {
        strictEqual(compareSemver('1.0.0-beta.22', '1.0.0'), -1);
    });

    it('should return 1 for compareSemver("1.0.0", "1.0.0-beta.22")', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0-beta.22'), 1);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.1',
            '1.0.0-beta.2',
            '2.0.0',
            '1.2.3',
            '1.2.4'
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    // Equality property
    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.1',
            '1.0.0-beta.2',
            '2.0.0',
            '1.2.3',
            '1.2.4'
        ];

        versions.forEach(a => {
            strictEqual(compareSemver(a, a), 0);
        });
    });
});