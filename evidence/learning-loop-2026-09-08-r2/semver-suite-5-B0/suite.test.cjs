const { strict: assert } = require('assert');
const { compareSemver } = require('./semver.cjs');

describe('compareSemver', () => {
    // Invariant tests
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

    // Equal precedence tests
    it('should return 0 for equal versions', () => {
        assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
    });

    // Symmetry tests
    it('should return -compareSemver(b, a) for all valid inputs', () => {
        assert.equal(compareSemver('1.2.3', '1.2.4'), -compareSemver('1.2.4', '1.2.3'));
        assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -compareSemver('1.0.0', '1.0.0-alpha'));
    });

    // Additional cases using core numbers and prerelease identifiers
    it('should handle custom cases with core numbers and prerelease identifiers', () => {
        assert.equal(compareSemver('1.0.0-beta.27', '1.0.0-beta.37'), -1);
        assert.equal(compareSemver('1.0.0-beta.37', '1.0.0-beta.27'), 1);
        assert.equal(compareSemver('1.0.0-beta.27', '1.0.0-beta.27'), 0);
        assert.equal(compareSemver('1.0.0-beta.27.1', '1.0.0-beta.27'), 1);
        assert.equal(compareSemver('1.0.0-beta', '1.0.0-beta.1'), -1);
        assert.equal(compareSemver('1.0.0-beta.1', '1.0.0-beta.1.1'), -1);
        assert.equal(compareSemver('1.0.0+build', '1.0.0+build.1'), 0);
    });

    // Edge case tests
    it('should handle edge cases correctly', () => {
        assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
        assert.equal(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1'), 1);
        assert.equal(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1.2'), -1);
        assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
        assert.equal(compareSemver('1.0.0-1', '1.0.0-alpha'), 1);
    });
});

// Run the tests using Node.js
if (require.main === module) {
    require('node:test').run();
}