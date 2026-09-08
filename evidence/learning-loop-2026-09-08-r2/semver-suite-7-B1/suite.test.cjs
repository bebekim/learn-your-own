// Import the compareSemver function from the semver.cjs module
const compareSemver = require('./semver.cjs').compareSemver;

// Test suite for compareSemver
const { test } = require('node:test');
const assert = require('node:assert');

test('compareSemver', async (t) => {
    // Invariants
    await t.test('invariants', async () => {
        assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
        assert.strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
        assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);
    });

    // Edge cases
    await t.test('edge cases', async () => {
        // Multi-digit numeric identifiers in prerelease
        assert.strictEqual(compareSemver('1.0.0-beta.29', '1.0.0-beta.39'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.39', '1.0.0-beta.29'), 1);
        
        // Mixed numeric and alphanumeric prerelease identifiers
        assert.strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.alpha'), -1);
        assert.strictEqual(compareSemver('1.0.0-beta.alpha', '1.0.0-beta.1'), 1);
        
        // Prerelease chains of different lengths
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1.0'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha.1.0', '1.0.0-alpha'), 1);
        
        // Build metadata on versions with and without prerelease
        assert.strictEqual(compareSemver('1.0.0-alpha+build.1', '1.0.0-alpha'), -1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha+build.1'), 1);
        
        // Same version with different build metadata
        assert.strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0);
    });

    // Equality and symmetry
    await t.test('equality and symmetry', async () => {
        assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
        assert.strictEqual(compareSemver('2.0.0', '2.0.0'), 0);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
        assert.strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);

        // Symmetry
        assert.strictEqual(compareSemver('1.0.0', '2.0.0'), -1);
        assert.strictEqual(compareSemver('2.0.0', '1.0.0'), 1);
        assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
        assert.strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
    });
});