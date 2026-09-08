// test-semver.js
const { strictEqual } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Example cases
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

    // Edge cases
    it('should return -1 for "1.0.0-alpha.1" and "1.0.0-alpha.2"', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2'), -1);
    });

    it('should return 1 for "1.0.0-alpha.2" and "1.0.0-alpha.1"', () => {
        strictEqual(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.1'), 1);
    });

    it('should return -1 for "1.0.0-beta.26" and "1.0.0-beta.36"', () => {
        strictEqual(compareSemver('1.0.0-beta.26', '1.0.0-beta.36'), -1);
    });

    it('should return 1 for "1.0.0-beta.36" and "1.0.0-beta.26"', () => {
        strictEqual(compareSemver('1.0.0-beta.36', '1.0.0-beta.26'), 1);
    });

    it('should return 0 for "1.0.0" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    });

    it('should return -1 for "1.0.0-beta.26" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0-beta.26', '1.0.0'), -1);
    });

    it('should return 0 for "1.0.0+build.1" and "1.0.0"', () => {
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0'), 0);
    });

    // Negation-based properties
    it('should satisfy compareSemver(a, b) === -compareSemver(b, a)', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.1',
            '1.0.0-beta.2',
            '1.0.0-rc.1',
            '2.0.0',
            '1.0.1',
            '1.1.0',
            '1.0.0+build.1'
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                strictEqual(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    // Reflexivity property
    it('should satisfy compareSemver(a, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-beta.1',
            '1.0.0-beta.2',
            '1.0.0-rc.1',
            '2.0.0',
            '1.0.1',
            '1.1.0',
            '1.0.0+build.1'
        ];

        versions.forEach(a => {
            strictEqual(compareSemver(a, a), 0);
        });
    });
});