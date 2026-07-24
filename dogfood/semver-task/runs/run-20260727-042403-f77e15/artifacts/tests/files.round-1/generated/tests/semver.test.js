const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

test('major version compared numerically', () => {
  assert.equal(compareSemver('1.0.0', '2.0.0'), -1);
  assert.equal(compareSemver('2.0.0', '1.0.0'), 1);
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
  assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
  assert.equal(compareSemver('10.0.0', '10.0.0'), 0);
});

test('minor version compared numerically when major equal', () => {
  assert.equal(compareSemver('1.2.0', '1.3.0'), -1);
  assert.equal(compareSemver('1.3.0', '1.2.0'), 1);
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1);
  assert.equal(compareSemver('1.10.0', '1.2.0'), 1);
  assert.equal(compareSemver('1.2.0', '1.2.0'), 0);
});

test('patch version compared numerically when major and minor equal', () => {
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
  assert.equal(compareSemver('1.2.3', '1.2.10'), -1);
  assert.equal(compareSemver('1.2.10', '1.2.3'), 1);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
});

test('multi-digit major/minor/patch compared numerically not lexically', () => {
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
  assert.equal(compareSemver('1.0.2', '1.0.10'), -1);
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1);
  assert.equal(compareSemver('100.200.300', '100.200.301'), -1);
});

test('prerelease has lower precedence than same version without prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
  assert.equal(compareSemver('1.2.3-beta', '1.2.3'), -1);
  assert.equal(compareSemver('1.2.3', '1.2.3-beta'), 1);
});

test('prerelease identifiers compared left to right', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha'), 0);
});

test('alphanumeric prerelease identifiers compared lexically in ASCII order', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0-gamma'), -1);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-rc', '1.0.0-rc.1'), -1);
});

test('numeric prerelease identifier has lower precedence than alphanumeric', () => {
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1'), 1);
  assert.equal(compareSemver('1.0.0-2', '1.0.0-abc'), -1);
  assert.equal(compareSemver('1.0.0-abc', '1.0.0-2'), 1);
});

test('numeric prerelease identifiers compared numerically', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.2'), 0);
  assert.equal(compareSemver('1.0.0-0.1', '1.0.0-0.2'), -1);
  assert.equal(compareSemver('1.0.0-0.10', '1.0.0-0.2'), 1);
});

test('prerelease with fewer identifiers has lower precedence when preceding equal', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.1', '1.0.0-alpha.1.1'), 0);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0-rc.1.0'), -1);
  assert.equal(compareSemver('1.0.0-rc.1.0', '1.0.0-rc.1'), 1);
});

test('build metadata is ignored for precedence', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.0+build.5'), 0);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0+build.10'), 0);
  assert.equal(compareSemver('1.0.0+abc', '1.0.0+def'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha+build.5'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha+build.10'), 0);
});

test('build metadata ignored even when prerelease differs', () => {
  assert.equal(compareSemver('1.0.0-alpha+build1', '1.0.0-beta+build2'), -1);
  assert.equal(compareSemver('1.0.0-beta+build2', '1.0.0-alpha+build1'), 1);
});

test('reflexivity: compareSemver(a, a) === 0 for all valid inputs', () => {
  const versions = [
    '1.0.0',
    '0.0.0',
    '1.2.3',
    '10.20.30',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0+build.5',
    '1.0.0-alpha+build.5',
    '1.0.0-0',
    '1.0.0-0.0',
    '1.0.0-0.0.0',
    '100.200.300-rc.1+sha.abc',
  ];
  for (const v of versions) {
    assert.equal(compareSemver(v, v), 0, `compareSemver(${JSON.stringify(v)}, ${JSON.stringify(v)}) should be 0`);
  }
});

test('antisymmetry: compareSemver(a, b) === -compareSemver(b, a)', () => {
  const pairs = [
    ['1.0.0', '2.0.0'],
    ['1.2.3', '1.2.4'],
    ['2.0.0', '10.0.0'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-rc.1', '1.0.0'],
    ['1.0.0+build.5', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-beta'],
    ['1.0.0-2', '1.0.0-abc'],
    ['1.0.0-alpha+build1', '1.0.0-beta+build2'],
    ['1.0.0-rc.1', '1.0.0-rc.1.0'],
    ['1.0.0-0.10', '1.0.0-0.2'],
    ['100.200.300', '100.200.301'],
  ];
  for (const [a, b] of pairs) {
    const ab = compareSemver(a, b);
    const ba = compareSemver(b, a);
    assert.equal(ab, -ba, `compareSemver(${JSON.stringify(a)}, ${JSON.stringify(b)}) === -compareSemver(${JSON.stringify(b)}, ${JSON.stringify(a)})`);
  }
});

test('mixed numeric and alphanumeric prerelease identifiers in chains', () => {
  assert.equal(compareSemver('1.0.0-1.alpha', '1.0.0-1.beta'), -1);
  assert.equal(compareSemver('1.0.0-1.beta', '1.0.0-1.alpha'), 1);
  assert.equal(compareSemver('1.0.0-1.2', '1.0.0-1.10'), -1);
  assert.equal(compareSemver('1.0.0-1.10', '1.0.0-1.2'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1.2', '1.0.0-alpha.1.10'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.10', '1.0.0-alpha.1.2'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1.2', '1.0.0-alpha.1.2.beta'), -1);
});

test('full semver ordering chain from spec examples', () => {
  // Classic semver precedence chain
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
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      assert.equal(compareSemver(ordered[i], ordered[j]), -1,
        `compareSemver(${JSON.stringify(ordered[i])}, ${JSON.stringify(ordered[j])}) should be -1`);
      assert.equal(compareSemver(ordered[j], ordered[i]), 1,
        `compareSemver(${JSON.stringify(ordered[j])}, ${JSON.stringify(ordered[i])}) should be 1`);
    }
  }
});

test('zero versions compare correctly', () => {
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(compareSemver('0.0.0', '0.0.1'), -1);
  assert.equal(compareSemver('0.0.1', '0.0.0'), 1);
  assert.equal(compareSemver('0.0.0-alpha', '0.0.0'), -1);
  assert.equal(compareSemver('0.0.0', '0.0.0-alpha'), 1);
});

test('prerelease with numeric identifier compared to alphanumeric at same position', () => {
  assert.equal(compareSemver('1.0.0-1', '1.0.0-a'), -1);
  assert.equal(compareSemver('1.0.0-1', '1.0.0-z'), -1);
  assert.equal(compareSemver('1.0.0-0', '1.0.0-a'), -1);
  assert.equal(compareSemver('1.0.0-a', '1.0.0-0'), 1);
  assert.equal(compareSemver('1.0.0-99', '1.0.0-aa'), -1);
});

test('prerelease chains where first differing identifier determines result', () => {
  assert.equal(compareSemver('1.0.0-alpha.1.2.3', '1.0.0-alpha.1.2.4'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.2.4', '1.0.0-alpha.1.2.3'), 1);
  assert.equal(compareSemver('1.0.0-alpha.2.1', '1.0.0-alpha.1.99'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1.99', '1.0.0-alpha.2.1'), -1);
});

test('build metadata with complex prerelease does not affect comparison', () => {
  assert.equal(compareSemver('1.0.0-alpha.1+sha.1234', '1.0.0-alpha.1'), 0);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.1+sha.1234'), 0);
  assert.equal(compareSemver('1.0.0-beta.11+meta', '1.0.0-beta.11+other'), 0);
  assert.equal(compareSemver('1.0.0-beta.11+meta', '1.0.0-beta.2+other'), 1);
  assert.equal(compareSemver('1.0.0-beta.2+meta', '1.0.0-beta.11+other'), -1);
});
