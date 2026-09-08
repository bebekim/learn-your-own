// test.js
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
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
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

    // Negation property
    it('should satisfy the negation property', () => {
        const versions = [
            ['1.0.0', '1.0.0'],
            ['1.2.3', '1.2.4'],
            ['2.0.0', '10.0.0'],
            ['1.0.0-alpha', '1.0.0'],
            ['1.0.0-alpha', '1.0.0-alpha.1'],
            ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
            ['1.0.0-beta.2', '1.0.0-beta.11'],
            ['1.0.0-rc.1', '1.0.0'],
            ['1.0.0+build.5', '1.0.0']
        ];

        versions.forEach(([a, b]) => {
            const result = compareSemver(a, b);
            const negatedResult = compareSemver(b, a);
            strictEqual(result + negatedResult, 0);
        });
    });

    // Additional cases
    it('should handle additional cases', () => {
        strictEqual(compareSemver('1.0.0-beta.29', '1.0.0-beta.39'), -1);
        strictEqual(compareSemver('1.0.0-beta.39', '1.0.0-beta.29'), 1);
        strictEqual(compareSemver('1.0.0-beta.29', '1.0.0-beta.29'), 0);
        strictEqual(compareSemver('1.0.0-beta.39', '1.0.0+build.1'), -1);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        strictEqual(compareSemver('1.0.1', '1.0.0+build.1'), 1);
        strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });
});

// To run the tests, use the command: node test.js