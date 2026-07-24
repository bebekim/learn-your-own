const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

function sign(x) {
  if (x < 0) return -1;
  if (x > 0) return 1;
  return 0;
}

test('major version compared numerically', () => {
  assert.equal(sign(compareSemver('1.0.0', '2.0.0')), -1);
  assert.equal(sign(compareSemver('2.0.0', '1.0.0')), 1);
  assert.equal(sign(compareSemver('2.0.0', '10.0.0')), -1);
  assert.equal(sign(compareSemver('10.0.0', '2.0.0')), 1);
});

test('minor version compared numerically when major equal', () => {
  assert.equal(sign(compareSemver('1.2.0', '1.3.0')), -1);
  assert.equal(sign(compareSemver('1.3.0', '1.2.0')), 1);
  assert.equal(sign(compareSemver('1.2.0', '1.10.0')), -1);
});

test('patch version compared numerically when major and minor equal', () => {
  assert.equal(sign(compareSemver('1.2.3', '1.2.4')), -1);
  assert.equal(sign(compareSemver('1.2.4', '1.2.3')), 1);
  assert.equal(sign(compareSemver('1.2.3', '1.2.10')), -1);
});

test('equal versions return 0', () => {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(compareSemver('100.200.300', '100.200.300'), 0);
});

test('prerelease has lower precedence than same version without prerelease', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0')), -1);
  assert.equal(sign(compareSemver('1.0.0', '1.0.0-alpha')), 1);
  assert.equal(sign(compareSemver('1.0.0-rc.1', '1.0.0')), -1);
  assert.equal(sign(compareSemver('1.0.0-x.y.z', '1.0.0')), -1);
});

test('prerelease identifiers compared left to right', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-beta')), -1);
  assert.equal(sign(compareSemver('1.0.0-beta', '1.0.0-alpha')), 1);
  assert.equal(sign(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.2')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.1')), 1);
});

test('numeric prerelease identifiers compare numerically', () => {
  assert.equal(sign(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')), -1);
  assert.equal(sign(compareSemver('1.0.0-beta.11', '1.0.0-beta.2')), 1);
  assert.equal(sign(compareSemver('1.0.0-1', '1.0.0-2')), -1);
  assert.equal(sign(compareSemver('1.0.0-2', '1.0.0-10')), -1);
});

test('alphanumeric prerelease identifiers compare lexically in ASCII order', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-beta')), -1);
  assert.equal(sign(compareSemver('1.0.0-Alpha', '1.0.0-alpha')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-alpha1')), -1);
});

test('numeric prerelease identifier lower than alphanumeric', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.1')), 1);
  assert.equal(sign(compareSemver('1.0.0-1', '1.0.0-alpha')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-1')), 1);
});

test('fewer prerelease identifiers lower when preceding equal', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.1', '1.0.0-alpha')), 1);
  assert.equal(sign(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.1')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.beta.1', '1.0.0-alpha.beta')), 1);
});

test('build metadata ignored for precedence', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.0+build.5'), 0);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0+build.6'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha+exp.sha.5114f85', '1.0.0-alpha+exp.sha.5114f86'), 0);
});

test('build metadata with prerelease still compares prerelease', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha+build', '1.0.0-beta+build')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha+build1', '1.0.0-alpha.1+build2')), -1);
});

test('antisymmetry: compareSemver(a,b) === -compareSemver(b,a)', () => {
  const pairs = [
    ['1.0.0', '2.0.0'],
    ['1.0.0', '1.0.0'],
    ['1.2.3', '1.2.4'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0+build.5', '1.0.0'],
    ['1.0.0-alpha+build', '1.0.0-beta+build'],
    ['10.0.0', '2.0.0'],
    ['0.0.1', '0.0.0'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(
      sign(compareSemver(a, b)),
      -sign(compareSemver(b, a)),
      `antisymmetry failed for (${a}, ${b})`
    );
  }
});

test('reflexivity: compareSemver(a,a) === 0', () => {
  const versions = [
    '1.0.0',
    '0.0.0',
    '1.2.3',
    '100.200.300',
    '1.0.0-alpha',
    '1.0.0-alpha.beta.1',
    '1.0.0-rc.1',
    '1.0.0+build.5',
    '1.0.0-alpha+build.5',
    '1.0.0-1',
    '1.0.0-Alpha',
  ];
  for (const v of versions) {
    assert.equal(compareSemver(v, v), 0, `reflexivity failed for ${v}`);
  }
});

test('multi-digit major/minor/patch compared numerically', () => {
  assert.equal(sign(compareSemver('2.0.0', '10.0.0')), -1);
  assert.equal(sign(compareSemver('1.10.0', '1.2.0')), 1);
  assert.equal(sign(compareSemver('1.0.10', '1.0.2')), 1);
  assert.equal(sign(compareSemver('100.0.0', '99.99.99')), 1);
});

test('mixed numeric and alphanumeric prerelease identifiers', () => {
  assert.equal(sign(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.1.gamma')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.1.beta', '1.0.0-alpha.2.beta')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.beta.1', '1.0.0-alpha.beta.2')), -1);
  assert.equal(sign(compareSemver('1.0.0-alpha.2.beta', '1.0.0-alpha.11.beta')), -1);
});

test('prerelease chains of different lengths', () => {
  assert.equal(sign(compareSemver('1.0.0-a', '1.0.0-a.b.c')), -1);
  assert.equal(sign(compareSemver('1.0.0-a.b.c', '1.0.0-a.b.c.d')), -1);
  assert.equal(sign(compareSemver('1.0.0-a.b.c.d', '1.0.0-a.b.c')), 1);
});

test('full semver example chain precedence', () => {
  // Classic semver precedence chain
  const chain = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-alpha.beta',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0-rc.1',
    '1.0.0',
  ];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(
      sign(compareSemver(chain[i], chain[i + 1])),
      -1,
      `${chain[i]} should be less than ${chain[i + 1]}`
    );
  }
});

test('zero versions', () => {
  assert.equal(compareSemver('0.0.0', '0.0.0'), 0);
  assert.equal(sign(compareSemver('0.0.0', '0.0.1')), -1);
  assert.equal(sign(compareSemver('0.1.0', '0.0.1')), 1);
});

test('build metadata does not affect reflexivity', () => {
  assert.equal(compareSemver('1.0.0+build', '1.0.0+build'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build', '1.0.0-alpha+build'), 0);
});

test('return value is exactly -1, 0, or 1', () => {
  const cases = [
    ['1.0.0', '2.0.0'],
    ['1.0.0', '1.0.0'],
    ['2.0.0', '1.0.0'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0+build', '1.0.0'],
  ];
  for (const [a, b] of cases) {
    const r = compareSemver(a, b);
    assert.ok(r === -1 || r === 0 || r === 1, `result ${r} not in {-1,0,1} for (${a},${b})`);
  }
});
