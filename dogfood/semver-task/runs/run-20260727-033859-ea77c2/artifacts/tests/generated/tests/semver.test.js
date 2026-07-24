const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

test('returns -1 when patch is lower, equal major and minor', () => {
  assert.equal(compareSemver('1.2.3', '1.2.4'), -1);
});

test('returns 1 when patch is higher, equal major and minor', () => {
  assert.equal(compareSemver('1.2.4', '1.2.3'), 1);
});

test('compares major numerically, not lexically', () => {
  assert.equal(compareSemver('2.0.0', '10.0.0'), -1);
  assert.equal(compareSemver('10.0.0', '2.0.0'), 1);
});

test('compares minor numerically', () => {
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1);
  assert.equal(compareSemver('1.10.0', '1.2.0'), 1);
});

test('compares patch numerically with multi-digit values', () => {
  assert.equal(compareSemver('1.0.2', '1.0.11'), -1);
  assert.equal(compareSemver('1.0.11', '1.0.2'), 1);
});

test('returns 0 for identical versions', () => {
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
  assert.equal(compareSemver('10.20.30', '10.20.30'), 0);
});

test('version with prerelease has lower precedence than same version without', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-alpha'), 1);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-rc.1'), 1);
});

test('prerelease with fewer identifiers is lower when preceding identifiers equal', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha'), 1);
});

test('numeric prerelease identifier is lower than alphanumeric identifier', () => {
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

test('prerelease identifiers compared left to right', () => {
  assert.equal(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1.alpha'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1.alpha', '1.0.0-alpha.1.beta'), 1);
});

test('build metadata is ignored for precedence', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.0+build.5'), 0);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha+exp.sha.5114f85', '1.0.0-alpha+build.5'), 0);
});

test('compareSemver(a, a) === 0 for various inputs', () => {
  const inputs = [
    '0.0.0',
    '1.0.0',
    '1.2.3',
    '10.20.30',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0+build.5',
    '1.0.0-alpha+build.5',
  ];
  for (const v of inputs) {
    assert.equal(compareSemver(v, v), 0, `compareSemver('${v}', '${v}') should be 0`);
  }
});

test('compareSemver(a, b) === -compareSemver(b, a) for all pairs', () => {
  const versions = [
    '1.0.0',
    '1.2.3',
    '1.2.4',
    '2.0.0',
    '10.0.0',
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0+build.5',
    '1.0.0-alpha+build.5',
  ];
  for (let i = 0; i < versions.length; i++) {
    for (let j = 0; j < versions.length; j++) {
      const a = versions[i];
      const b = versions[j];
      const fwd = compareSemver(a, b);
      const bwd = compareSemver(b, a);
      assert.equal(fwd, -bwd, `compareSemver('${a}','${b}') should be -compareSemver('${b}','${a}')`);
    }
  }
});

test('full precedence ordering matches semver spec examples', () => {
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
      `compareSemver('${ordered[i]}', '${ordered[i + 1]}') should be -1`);
    assert.equal(compareSemver(ordered[i + 1], ordered[i]), 1,
      `compareSemver('${ordered[i + 1]}', '${ordered[i]}') should be 1`);
  }
});

test('major difference dominates minor and patch', () => {
  assert.equal(compareSemver('2.5.5', '1.9.9'), 1);
  assert.equal(compareSemver('1.9.9', '2.0.0'), -1);
});

test('minor difference dominates patch', () => {
  assert.equal(compareSemver('1.2.9', '1.1.0'), 1);
  assert.equal(compareSemver('1.1.0', '1.2.0'), -1);
});

test('prerelease does not affect comparison when core versions differ', () => {
  assert.equal(compareSemver('2.0.0-alpha', '1.0.0'), 1);
  assert.equal(compareSemver('1.0.0', '2.0.0-alpha'), -1);
});

test('mixed numeric and alphanumeric prerelease identifiers of different lengths', () => {
  assert.equal(compareSemver('1.0.0-1.alpha', '1.0.0-1.alpha.0'), -1);
  assert.equal(compareSemver('1.0.0-1.alpha.0', '1.0.0-1.alpha'), 1);
});

test('numeric prerelease identifier vs numeric prerelease identifier with different digits', () => {
  assert.equal(compareSemver('1.0.0-0', '1.0.0-1'), -1);
  assert.equal(compareSemver('1.0.0-1', '1.0.0-0'), 1);
  assert.equal(compareSemver('1.0.0-0', '1.0.0-0'), 0);
});

test('zero versions compare equal', () => {
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(compareSemver('0.0.0-alpha', '0.0.0-alpha'), 0);
  assert.equal(compareSemver('0.0.0-alpha', '0.0.0'), -1);
});

test('build metadata ignored on both sides with prerelease', () => {
  assert.equal(compareSemver('1.0.0-beta.11+build1', '1.0.0-beta.11+build2'), 0);
  assert.equal(compareSemver('1.0.0-beta.2+build1', '1.0.0-beta.11+build2'), -1);
});

test('return value is always exactly -1, 0, or 1', () => {
  const pairs = [
    ['1.0.0', '2.0.0'],
    ['1.0.0', '1.0.0'],
    ['2.0.0', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0+build', '1.0.0'],
  ];
  for (const [a, b] of pairs) {
    const result = compareSemver(a, b);
    assert.ok(result === -1 || result === 0 || result === 1,
      `compareSemver('${a}','${b}') returned ${result}, expected -1|0|1`);
  }
});
