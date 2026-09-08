// semver.test.js
const { test, expect } = require('node:test');
const { compareSemver } = require('./semver.cjs');

test('compareSemver invariants and examples', async (t) => {
    // Example tests
    await t.test('should return -1 for lower version', () => {
        expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    });

    await t.test('should return -1 for lower major version', () => {
        expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    });

    await t.test('should return -1 for prerelease lower than stable', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    });

    await t.test('should return -1 for fewer prerelease identifiers', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    });

    await t.test('should return -1 for numeric identifier lower than alphanumeric', () => {
        expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    });

    await t.test('should return -1 for numeric prerelease identifiers', () => {
        expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    });

    await t.test('should return -1 for rc prerelease lower than stable', () => {
        expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(-1);
    });

    await t.test('should return 0 for same version with build metadata', () => {
        expect(compareSemver('1.0.0+build.5', '1.0.0')).toBe(0);
    });

    // Additional tests
    await t.test('should return 0 for identical versions', () => {
        expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    });

    await t.test('should return 1 for higher version', () => {
        expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    });

    await t.test('should return 1 for higher major version', () => {
        expect(compareSemver('10.0.0', '2.0.0')).toBe(1);
    });

    await t.test('should return 1 for higher minor version', () => {
        expect(compareSemver('1.2.4', '1.2.3')).toBe(1);
    });

    await t.test('should return 1 for higher patch version', () => {
        expect(compareSemver('1.2.3', '1.2.2')).toBe(1);
    });

    // Edge cases
    await t.test('should handle multi-digit numeric identifiers in prerelease', () => {
        expect(compareSemver('1.0.0-beta.22', '1.0.0-beta.32')).toBe(-1);
    });

    await t.test('should handle mixed numeric and alphanumeric prerelease identifiers', () => {
        expect(compareSemver('1.0.0-beta.22', '1.0.0-beta.alpha')).toBe(-1);
    });

    await t.test('should handle prerelease chains of different lengths', () => {
        expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta')).toBe(-1);
        expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1')).toBe(-1);
    });

    await t.test('should ignore build metadata', () => {
        expect(compareSemver('1.0.0+build.5', '1.0.0+build.6')).toBe(0);
    });

    await t.test('should compare versions with multiple digits', () => {
        expect(compareSemver('22.0.0', '32.0.0')).toBe(-1);
        expect(compareSemver('32.0.0', '22.0.0')).toBe(1);
    });
});