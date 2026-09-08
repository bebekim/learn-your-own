// semver.test.js
const { strictEqual, deepStrictEqual } = require('assert');
const compareSemver = require('./semver.cjs').compareSemver;

describe('compareSemver', () => {
    // Invariants
    it('should return -1 for versions with lower precedence', () => {
        strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    });

    it('should return 0 for equal versions', () => {
        strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
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

    // Negation properties
    it('should satisfy negation properties', () => {
        const versions = [
            '1.2.3', '1.2.4',
            '2.0.0', '10.0.0',
            '1.0.0-alpha', '1.0.0',
            '1.0.0-alpha.1', '1.0.0-alpha',
            '1.0.0-alpha.beta', '1.0.0-alpha.1',
            '1.0.0-beta.2', '1.0.0-beta.11',
            '1.0.0-rc.1', '1.0.0',
            '1.0.0+build.5', '1.0.0'
        ];

        for (let i = 0; i < versions.length; i++) {
            for (let j = i + 1; j < versions.length; j++) {
                const a = versions[i];
                const b = versions[j];
                const result = compareSemver(a, b);
                const negatedResult = compareSemver(b, a);
                strictEqual(result + negatedResult, 0);
            }
        }
    });

    // Additional cases
    it('should handle additional cases', () => {
        strictEqual(compareSemver('1.0.0-beta.27', '1.0.0-beta.37'), -1);
        strictEqual(compareSemver('1.0.0-beta.37', '1.0.0-beta.27'), 1);
        strictEqual(compareSemver('1.0.0-beta.27', '1.0.0-beta.27'), 0);
        strictEqual(compareSemver('27.0.0', '37.0.0'), -1);
        strictEqual(compareSemver('37.0.0', '27.0.0'), 1);
        strictEqual(compareSemver('1.2.3+build.1', '1.2.3+build.2'), 0);
        strictEqual(compareSemver('1.2.3-alpha', '1.2.3-alpha.1'), -1);
        strictEqual(compareSemver('1.2.3-alpha.1', '1.2.3-alpha'), 1);
    });

    // Edge cases
    it('should handle edge cases', () => {
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        strictEqual(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.0'), 1);
        strictEqual(compareSemver('1.0.0-alpha.1.0', '1.0.0-alpha.1'), -1);
    });
});