// semver.test.js
const { strict: assert } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Test invariants
    it('should return -1 for lower precedence versions', () => {
        assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
        assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    it('should return 0 for equal versions', () => {
        assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    });

    it('should return 1 for higher precedence versions', () => {
        assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
        assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
        assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1);
        assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        assert.equal(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
        assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
        assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
    });

    // Test negation-based property
    it('should satisfy compareSemver(a, b) + compareSemver(b, a) === 0', () => {
        const versions = [
            '1.0.0',
            '1.0.0-alpha',
            '1.0.0-alpha.1',
            '1.0.0-beta.2',
            '1.0.0-beta.11',
            '2.0.0',
            '10.0.0',
            '1.2.3',
            '1.2.4',
            '1.0.0+build.5',
            '1.0.0-rc.1'
        ];

        versions.forEach(a => {
            versions.forEach(b => {
                assert.equal(compareSemver(a, b) + compareSemver(b, a), 0);
            });
        });
    });

    // Test additional cases with core numbers and prerelease identifiers
    it('should handle additional test cases', () => {
        assert.equal(compareSemver('1.0.0-beta.28', '1.0.0-beta.38'), -1);
        assert.equal(compareSemver('1.0.0-beta.38', '1.0.0-beta.28'), 1);
        assert.equal(compareSemver('1.0.0-28', '1.0.0-38'), -1);
        assert.equal(compareSemver('1.0.0-38', '1.0.0-28'), 1);
        assert.equal(compareSemver('1.0.0-28.alpha', '1.0.0-28.beta'), -1);
        assert.equal(compareSemver('1.0.0-28.beta', '1.0.0-28.alpha'), 1);
    });

    // Edge cases
    it('should handle edge cases', () => {
        assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
        assert.equal(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
        assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });
});