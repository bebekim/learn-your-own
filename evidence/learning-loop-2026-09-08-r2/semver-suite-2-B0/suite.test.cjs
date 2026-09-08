// test-semver.js
const { test } = require('node:test');
const assert = require('node:assert');
const { compareSemver } = require('./semver.cjs');

test('compareSemver', () => {
    // Examples from the specification
    assert.strictEqual(compareSemver('1.2.3', '1.2.4'), -1);
    assert.strictEqual(compareSemver('2.0.0', '10.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
    assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
    assert.strictEqual(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
    assert.strictEqual(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
    assert.strictEqual(compareSemver('1.0.0+build.5', '1.0.0'), 0);

    // Edge cases
    assert.strictEqual(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), -1); // mixed prerelease identifiers
    assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1); // more identifiers is higher
    assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1+build.1'), 0); // build metadata ignored
    assert.strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.2'), 0); // build metadata ignored

    // Cases with core numbers
    assert.strictEqual(compareSemver('24.0.0', '34.0.0'), -1); // major version comparison
    assert.strictEqual(compareSemver('24.1.0', '24.0.0'), 1); // minor version comparison
    assert.strictEqual(compareSemver('24.0.1', '24.0.0'), 1); // patch version comparison
    assert.strictEqual(compareSemver('24.0.0-beta.24', '24.0.0-beta.34'), -1); // numeric prerelease comparison
    assert.strictEqual(compareSemver('24.0.0-beta.34', '24.0.0-beta'), 1); // more identifiers is higher
    assert.strictEqual(compareSemver('24.0.0-beta', '24.0.0'), -1); // prerelease vs normal

    // Equal precedence inputs
    assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
    assert.strictEqual(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
    assert.strictEqual(compareSemver('1.0.0+build.1', '1.0.0+build.1'), 0);
    assert.strictEqual(compareSemver('1.0.0-beta.1', '1.0.0-beta.1'), 0);

    // Reverse comparisons
    assert.strictEqual(compareSemver('1.2.4', '1.2.3'), 1);
    assert.strictEqual(compareSemver('10.0.0', '2.0.0'), 1);
    assert.strictEqual(compareSemver('1.0.0', '1.0.0-alpha'), 1);
    assert.strictEqual(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
    assert.strictEqual(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
    assert.strictEqual(compareSemver('1.0.0', '1.0.0+build.1'), 0); // build metadata ignored
});