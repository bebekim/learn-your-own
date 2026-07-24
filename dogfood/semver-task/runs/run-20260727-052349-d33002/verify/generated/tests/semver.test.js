const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

// Helper to normalize -0 to 0 for numeric comparisons to satisfy Object.is strictness
const normalize = (n) => n + 0;

test('compareSemver returns 0 for identical versions', () => {
    assert.strictEqual(normalize(compareSemver('1.0.0', '1.0.0')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha', '1.0.0-alpha')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0+build', '1.0.0+build')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0+build1', '1.0.0+build2')), 0); // Build metadata ignored
});

test('compareSemver respects antisymmetry', () => {
    const pairs = [
        ['1.0.0', '2.0.0'],
        ['1.0.0', '1.0.1'],
        ['1.0.0-alpha', '1.0.0'],
        ['1.0.0-alpha', '1.0.0-beta'],
        ['1.0.0-beta.2', '1.0.0-beta.11'],
        ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
        ['2.0.0', '10.0.0']
    ];
    for (const [a, b] of pairs) {
        const res1 = normalize(compareSemver(a, b));
        const res2 = normalize(compareSemver(b, a));
        assert.strictEqual(res1, -res2, `Antisymmetry failed for ${a} vs ${b}`);
    }
});

test('compareSemver compares major, minor, patch numerically', () => {
    assert.strictEqual(normalize(compareSemver('1.2.3', '1.2.4')), -1);
    assert.strictEqual(normalize(compareSemver('1.2.4', '1.2.3')), 1);
    assert.strictEqual(normalize(compareSemver('2.0.0', '10.0.0')), -1); // Numeric, not lexical
    assert.strictEqual(normalize(compareSemver('10.0.0', '2.0.0')), 1);
    assert.strictEqual(normalize(compareSemver('1.0.0', '1.0.0')), 0);
});

test('compareSemver handles prerelease vs release', () => {
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha', '1.0.0')), -1);
    assert.strictEqual(normalize(compareSemver('1.0.0', '1.0.0-alpha')), 1);
    assert.strictEqual(normalize(compareSemver('1.0.0-rc.1', '1.0.0')), -1);
});

test('compareSemver handles prerelease identifier precedence', () => {
    // Numeric < Alphanumeric
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')), -1);
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')), 1);
    
    // Numeric comparison (2 < 11)
    assert.strictEqual(normalize(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')), -1);
    assert.strictEqual(normalize(compareSemver('1.0.0-beta.11', '1.0.0-beta.2')), 1);

    // Fewer identifiers < More identifiers (when preceding equal)
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')), -1);
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')), 1);
});

test('compareSemver ignores build metadata', () => {
    assert.strictEqual(normalize(compareSemver('1.0.0+build.5', '1.0.0')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0', '1.0.0+build.5')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha')), 0);
    assert.strictEqual(normalize(compareSemver('1.0.0+build.5', '1.0.0+build.6')), 0);
});

test('compareSemver handles multi-digit major/minor/patch', () => {
    assert.strictEqual(normalize(compareSemver('10.0.0', '9.0.0')), 1);
    assert.strictEqual(normalize(compareSemver('1.10.0', '1.9.0')), 1);
    assert.strictEqual(normalize(compareSemver('1.0.10', '1.0.9')), 1);
});

test('compareSemver handles mixed prerelease identifiers', () => {
    // Based on spec: numeric < alphanumeric
    assert.strictEqual(normalize(compareSemver('1.0.0-1.alpha', '1.0.0-1.beta')), -1);
    assert.strictEqual(normalize(compareSemver('1.0.0-1.beta', '1.0.0-1.alpha')), 1);
    // If first identifiers equal, compare second
    assert.strictEqual(normalize(compareSemver('1.0.0-1.alpha', '1.0.0-2.alpha')), -1);
});
