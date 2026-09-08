const { test, expect } = require('node:test');
const { compareSemver } = require('./semver.cjs');

test('compareSemver tests', () => {
    // Invariant tests
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0+build.5', '1.0.0')).toBe(0);

    // Equal inputs
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha')).toBe(0);
    expect(compareSemver('1.0.0+build.5', '1.0.0+build.5')).toBe(0);

    // Reverse order
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    expect(compareSemver('10.0.0', '2.0.0')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1);
    expect(compareSemver('1.0.0-beta.11', '1.0.0-beta.2')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0+build.5')).toBe(0);

    // Additional test cases
    expect(compareSemver('1.0.0-beta.22', '1.0.0-beta.32')).toBe(-1);
    expect(compareSemver('1.0.0-beta.32', '1.0.0-beta.22')).toBe(1);
    expect(compareSemver('1.0.0-beta.22', '1.0.0-beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta', '1.0.0-beta.22')).toBe(1);
    expect(compareSemver('1.0.0-beta.1', '1.0.0-beta.1.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.0')).toBe(-1);
    expect(compareSemver('1.0.0+build.1', '1.0.0+build.2')).toBe(0); // Build metadata ignored
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1')).toBe(0);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
});