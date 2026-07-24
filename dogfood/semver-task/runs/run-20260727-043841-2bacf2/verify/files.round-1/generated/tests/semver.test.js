const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

test('examples: basic numeric comparison', () => {
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
});

test('examples: numeric not lexical major comparison', () => {
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
});

test('examples: prerelease lower than release', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
});

test('examples: fewer prerelease identifiers is lower', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
});

test('examples: numeric identifier lower than alphanumeric', () => {
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
});

test('examples: numeric prerelease identifiers compare numerically', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
});

test('examples: rc prerelease lower than release', () => {
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
});

test('examples: build metadata ignored', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
});

test('major compared numerically', () => {
  assert.equal(compareSemver('1.0.0', '2.0.0'), -1);
  assert.equal(compareSemver('2.0.0', '1.0.0'), 1);
  assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
  assert.equal(compareSemver('0.0.0', '1.0.0'), -1);
});

test('minor compared numerically when major equal', () => {
  assert.equal(compareSemver('1.2.0', '1.3.0'), -1);
  assert.equal(compareSemver('1.3.0', '1.2.0'), 1);
  assert.equal(compareSemver('1.10.0', '1.2.0'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
});

test('patch compared numerically when major and minor equal', () => {
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
  assert.equal(compareSemver('1.2.10', '1.2.2'), 1);
  assert.equal(compareSemver('1.2.0', '1.2.0'), 0);
});

test('multi-digit major/minor/patch', () => {
  assert.equal(compareSemver('100.200.300', '100.200.301'), -1);
  assert.equal(compareSemver('100.201.0', '100.200.999'), 1);
  assert.equal(compareSemver('101.0.0', '100.999.999'), 1);
});

test('prerelease lower than same version without prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.5.3-rc.1', '1.5.3'), -1);
  assert.equal(compareSemver('1.5.3', '1.5.3-rc.1'), 1);
});

test('prerelease identifiers compared left to right numerically', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0-rc.2'), -1);
  assert.equal(compareSemver('1.0.0-rc.10', '1.0.0-rc.9'), 1);
});

test('prerelease identifiers compared lexically in ASCII order', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-Alpha', '1.0.0-alpha'), -1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-Alpha'), 1);
});

test('numeric prerelease identifier lower than alphanumeric', () => {
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
  assert.equal(compareSemver('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(compareSemver('1.0.0-a', '1.0.0-1'), 1);
});

test('fewer prerelease identifiers is lower when preceding equal', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1.beta.2'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.beta.2', '1.0.0-alpha.1.beta'), 1);
});

test('prerelease chains of different lengths with equal prefixes', () => {
  assert.equal(compareSemver('1.0.0-1.2.3', '1.0.0-1.2.3.4'), -1);
  assert.equal(compareSemver('1.0.0-1.2.3.4', '1.0.0-1.2.3'), 1);
});

test('mixed numeric and alphanumeric prerelease identifiers', () => {
  assert.equal(compareSemver('1.0.0-1.alpha', '1.0.0-1.beta'), -1);
  assert.equal(compareSemver('1.0.0-1.beta', '1.0.0-1.alpha'), 1);
  assert.equal(compareSemver('1.0.0-alpha.2.beta', '1.0.0-alpha.11.beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha.11.beta', '1.0.0-alpha.2.beta'), 1);
});

test('build metadata ignored on versions without prerelease', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.0+build.5'), 0);
  assert.equal(compareSemver('1.0.0+abc', '1.0.0+xyz'), 0);
  assert.equal(compareSemver('1.0.0+a.b.c', '1.0.0+x.y.z'), 0);
});

test('build metadata ignored on versions with prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha+build.5'), 0);
  assert.equal(compareSemver('1.0.0-alpha+abc', '1.0.0-alpha+xyz'), 0);
  assert.equal(compareSemver('1.0.0-beta.1+exp.sha.5114f85', '1.0.0-beta.1'), 0);
});

test('build metadata does not affect prerelease comparison', () => {
  assert.equal(compareSemver('1.0.0-alpha+1', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha+1'), 1);
});

test('reflexivity: compareSemver(a, a) === 0', () => {
  const versions = [
    '0.0.0',
    '1.0.0',
    '1.2.3',
    '10.20.30',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0+build',
    '1.0.0-alpha+build',
    '100.200.300-rc.10.beta.5+sha.abc',
  ];
  for (const v of versions) {
    assert.equal(+compareSemver(v, v), 0);
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
    ['1.0.0-alpha+1', '1.0.0-alpha.1'],
    ['100.200.300', '99.999.999'],
    ['1.0.0-Alpha', '1.0.0-alpha'],
    ['1.0.0-1', '1.0.0-a'],
  ];
  for (const [a, b] of pairs) {
    const fwd = compareSemver(a, b);
    const bwd = compareSemver(b, a);
    assert.equal(+fwd, +(-bwd), `antisymmetry for ${a} vs ${b}`);
  }
});

test('full semver precedence ordering example', () => {
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
    assert.equal(compareSemver(ordered[i], ordered[i + 1]), -1,
      `${ordered[i]} < ${ordered[i + 1]}`);
    assert.equal(compareSemver(ordered[i + 1], ordered[i]), 1,
      `${ordered[i + 1]} > ${ordered[i]}`);
  }
});

test('zero versions', () => {
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(compareSemver('0.0.0', '0.0.1'), -1);
  assert.equal(compareSemver('0.0.1', '0.0.0'), 1);
  assert.equal(compareSemver('0.0.0-alpha', '0.0.0'), -1);
});

test('large numeric identifiers', () => {
  assert.equal(compareSemver('999999.999999.999999', '1000000.0.0'), -1);
  assert.equal(compareSemver('1.0.0-999999', '1.0.0-1000000'), -1);
  assert.equal(compareSemver('1.0.0-1000000', '1.0.0-999999'), 1);
});
