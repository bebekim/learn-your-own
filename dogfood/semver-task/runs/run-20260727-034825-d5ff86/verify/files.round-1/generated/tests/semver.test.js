const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

test('returns -1 when patch is lower', () => {
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
});

test('returns 1 when patch is higher', () => {
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
});

test('returns 0 for equal versions', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
});

test('compares major numerically not lexically', () => {
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
  assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
});

test('compares minor numerically not lexically', () => {
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1);
  assert.equal(compareSemver('1.10.0', '1.2.0'), 1);
});

test('compares patch numerically not lexically', () => {
  assert.equal(compareSemver('1.0.2', '1.0.10'), -1);
  assert.equal(compareSemver('1.0.10', '1.0.2'), 1);
});

test('major takes precedence over minor and patch', () => {
  assert.equal(compareSemver('2.9.9', '3.0.0'), -1);
  assert.equal(compareSemver('3.0.0', '2.9.9'), 1);
});

test('minor takes precedence over patch', () => {
  assert.equal(compareSemver('1.2.9', '1.3.0'), -1);
  assert.equal(compareSemver('1.3.0', '1.2.9'), 1);
});

test('prerelease version is lower than same version without prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1);
});

test('prerelease version is lower than same version without prerelease (rc)', () => {
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
});

test('prerelease with fewer identifiers is lower when preceding equal', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
});

test('numeric prerelease identifier is lower than alphanumeric', () => {
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
});

test('numeric prerelease identifiers compare numerically', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
});

test('alphanumeric prerelease identifiers compare lexically in ASCII order', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
});

test('build metadata is ignored for precedence', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.0+build.5'), 0);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
  assert.equal(compareSemver('1.0.0+abc', '1.0.0+xyz'), 0);
});

test('build metadata ignored with prerelease present', () => {
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha+build.5'), 0);
  assert.equal(compareSemver('1.0.0-alpha+1', '1.0.0-alpha+2'), 0);
});

test('prerelease identifiers compared left to right', () => {
  assert.equal(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1.gamma'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.gamma', '1.0.0-alpha.1.beta'), 1);
});

test('multi-digit numeric identifiers in prerelease', () => {
  assert.equal(compareSemver('1.0.0-rc.10', '1.0.0-rc.100'), -1);
  assert.equal(compareSemver('1.0.0-rc.100', '1.0.0-rc.10'), 1);
  assert.equal(compareSemver('1.0.0-rc.100', '1.0.0-rc.100'), 0);
});

test('mixed numeric and alphanumeric prerelease identifiers', () => {
  assert.equal(compareSemver('1.0.0-1.alpha', '1.0.0-1.beta'), -1);
  assert.equal(compareSemver('1.0.0-1.beta', '1.0.0-1.alpha'), 1);
  assert.equal(compareSemver('1.0.0-1.0', '1.0.0-1.a'), -1);
  assert.equal(compareSemver('1.0.0-1.a', '1.0.0-1.0'), 1);
});

test('prerelease chains of different lengths with equal prefix', () => {
  assert.equal(compareSemver('1.0.0-alpha.1.beta.2', '1.0.0-alpha.1.beta.2.3'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.beta.2.3', '1.0.0-alpha.1.beta.2'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1.beta.2.3', '1.0.0-alpha.1.beta.2.3'), 0);
});

test('major/minor/patch with multiple digits', () => {
  assert.equal(compareSemver('100.200.300', '100.200.301'), -1);
  assert.equal(compareSemver('100.200.301', '100.200.300'), 1);
  assert.equal(compareSemver('100.201.0', '100.202.0'), -1);
  assert.equal(compareSemver('101.0.0', '110.0.0'), -1);
});

test('identity: compareSemver(a, a) === 0 for all valid inputs', () => {
  const samples = [
    '0.0.0',
    '1.2.3',
    '10.20.30',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0+build',
    '1.0.0-alpha+build.5',
    '1.0.0-alpha.1.beta.2+meta',
  ];
  for (const s of samples) {
    assert.equal(compareSemver(s, s), 0);
  }
});

test('antisymmetry: compareSemver(a, b) === -compareSemver(b, a)', () => {
  const pairs = [
    ['1.2.3', '1.2.4'],
    ['2.0.0', '10.0.0'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-rc.1', '1.0.0'],
    ['1.0.0+build.5', '1.0.0'],
    ['1.0.0-alpha+1', '1.0.0-alpha+2'],
    ['1.0.0-1.0', '1.0.0-1.a'],
    ['1.0.0-alpha.1.beta.2', '1.0.0-alpha.1.beta.2.3'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(compareSemver(a, b), -compareSemver(b, a), `failed for (${a}, ${b})`);
  }
});

test('full semver precedence ordering example', () => {
  // Classic semver example chain
  const ordered = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  for (let i = 0; i < ordered.length - 1; i++) {
    assert.equal(compareSemver(ordered[i], ordered[i + 1]), -1, `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareSemver(ordered[i + 1], ordered[i]), 1, `${ordered[i + 1]} > ${ordered[i]}`);
  }
  for (let i = 0; i < ordered.length; i++) {
    assert.equal(compareSemver(ordered[i], ordered[i]), 0);
  }
});

test('zero versions', () => {
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(compareSemver('0.0.0', '0.0.1'), -1);
  assert.equal(compareSemver('0.0.1', '0.0.0'), 1);
  assert.equal(compareSemver('0.0.0-alpha', '0.0.0'), -1);
});

test('prerelease on different base versions does not cross-compare', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.1-alpha'), -1);
  assert.equal(compareSemver('1.0.1-alpha', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.1.0-alpha', '1.2.0-alpha'), -1);
  assert.equal(compareSemver('2.0.0-alpha', '1.9.0-zeta'), 1);
});

test('alphanumeric prerelease ASCII lexical order', () => {
  // uppercase letters come before lowercase in ASCII
  assert.equal(compareSemver('1.0.0-Beta', '1.0.0-alpha'), -1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-Beta'), 1);
  assert.equal(compareSemver('1.0.0-Alpha', '1.0.0-Beta'), -1);
});

test('numeric prerelease zero handling', () => {
  assert.equal(compareSemver('1.0.0-0', '1.0.0-1'), -1);
  assert.equal(compareSemver('1.0.0-1', '1.0.0-0'), 1);
  assert.equal(compareSemver('1.0.0-0', '1.0.0-0'), 0);
  // numeric 0 is lower than any alphanumeric
  assert.equal(compareSemver('1.0.0-0', '1.0.0-a'), -1);
  assert.equal(compareSemver('1.0.0-a', '1.0.0-0'), 1);
});

test('build metadata does not affect prerelease comparison', () => {
  assert.equal(compareSemver('1.0.0-alpha.1+build', '1.0.0-alpha.1'), 0);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta+build'), -1);
  assert.equal(compareSemver('1.0.0-alpha.beta+build', '1.0.0-alpha.1'), 1);
});

test('deeply nested prerelease chains', () => {
  assert.equal(compareSemver('1.0.0-a.b.c.d.e.1', '1.0.0-a.b.c.d.e.2'), -1);
  assert.equal(compareSemver('1.0.0-a.b.c.d.e.2', '1.0.0-a.b.c.d.e.1'), 1);
  assert.equal(compareSemver('1.0.0-a.b.c.d.e.1', '1.0.0-a.b.c.d.e.1.f'), -1);
  assert.equal(compareSemver('1.0.0-a.b.c.d.e.1.f', '1.0.0-a.b.c.d.e.1'), 1);
});
