const { test, expect } = require('node:test');
const { compareSemver } = require('./semver.cjs');

test('compareSemver invariants and examples', () => {
    // Basic comparisons
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1);
    expect(compareSemver('2.0.0', '10.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    expect(compareSemver('1.0.0-rc.1', '1.0.0')).toBe(-1);
    expect(compareSemver('1.0.0+build.5', '1.0.0')).toBe(0);

    // Edge cases
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')).toBe(1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1);
    expect(compareSemver('1.0.0-alpha.beta.1', '1.0.0-alpha.beta')).toBe(1);
    expect(compareSemver('1.0.0-alpha.beta.1', '1.0.0-alpha.beta.2')).toBe(-1);
    
    // Test with core numbers 25 and 35
    expect(compareSemver('1.0.0-beta.25', '1.0.0-beta.35')).toBe(-1);
    expect(compareSemver('1.0.0-beta.35', '1.0.0-beta.25')).toBe(1);
    
    // Testing equality
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('2.0.0', '2.0.0')).toBe(0);
    expect(compareSemver('1.0.0+build.1', '1.0.0+build.2')).toBe(0);
    
    // Testing different orders
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareSemver('1.2.3', '1.2.3+build.1')).toBe(0);
    expect(compareSemver('1.2.3+build.1', '1.2.3+build.2')).toBe(0);
    
    // Testing mixed numeric and alphanumeric prerelease identifiers
    expect(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1')).toBe(-1);
    
    // Testing multi-digit numeric identifiers
    expect(compareSemver('1.0.0-beta.10', '1.0.0-beta.2')).toBe(1);
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')).toBe(-1);
    
    // Testing different lengths of prerelease identifiers
    expect(compareSemver('1.0.0-alpha', '1.0.0-alpha.beta')).toBe(-1);
    expect(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1')).toBe(-1);
});

test('compareSemver symmetry and reflexivity', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
    
    const versions = [
        '1.0.0',
        '1.0.0-alpha',
        '1.0.0-beta.1',
        '1.0.0-beta.2',
        '1.0.0-beta.11',
        '1.0.0-rc.1',
        '1.0.0+build.1',
        '2.0.0',
        '1.2.3',
        '1.2.4'
    ];
    
    for (const a of versions) {
        for (const b of versions) {
            expect(compareSemver(a, b)).toBe(-compareSemver(b, a);
        }
    }
});