const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

test('compareSemver(a, a) === 0 for all valid inputs', () => {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('2.0.0', '2.0.0'), 0);
  assert.equal(compareSemver('1.2.3', '1.2.3'), 0);
});

test('compareSemver(a, b) === -compareSemver(b, a) for all valid inputs', () => {
  const num = (x) => x + 0;
  const pairs = [
    ['1.0.0', '1.0.1'],
    ['1.0.0', '1.2.3'],
    ['1.0.0', '2.0.0'],
    ['1.0.0-alpha', '1.0.0'],
    ['1.0.0+build.5', '1.0.0'],
    ['1.0.0-alpha', '1.0.0-alpha.1'],
    ['1.0.0-alpha', '1.0.0-alpha.beta'],
    ['1.0.0-alpha.1', '1.0.0-alpha.beta'],
    ['1.0.0-alpha.1', '1.0.0-alpha.1.0'],
    ['1.0.0-beta.2', '1.0.0-beta.11'],
    ['1.0.0-rc.1', '1.0.0'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(num(compareSemver(a, b)), num(-compareSemver(b, a)));
  }
});

test('precedence is determined first by major, then minor, then patch, compared numerically', () => {
  assert.equal(compareSemver('0.0.1', '0.0.0'), 1);
  assert.equal(compareSemver('1.0.0', '0.9.9'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.0.0', '1.0.1'), -1);
  assert.equal(compareSemver('1.1.0', '1.0.999'), 1);
  assert.equal(compareSemver('1.0.0-0', '1.0.0-alpha'), 1);
});

test('build metadata is ignored for precedence', () => {
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0-alpha'), -1);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0+build.1', '1.0.0+build.5'), 0);
});

test('numeric prerelease identifier always has lower precedence than an alphanumeric one', () => {
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-beta'), -1);
  assert.equal(compareSemver('1.0.0-beta', '1.0.0-alpha.1'), 1);
});

test('prerelease with fewer identifiers has lower precedence than one with more, when all preceding identifiers are equal', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0-alpha.1'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha.beta', '1.0.0-alpha.beta.123'), -1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta.123'), -1);
});

test('prerelease identifiers are compared left to right: numeric identifiers compare numerically, alphanumeric compare lexically', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
  assert.equal(compareSemver('1.0.0-alpha.0', '1.0.0-alpha.0'), 0);
  assert.equal(compareSemver('1.0.0-alpha.2', '1.0.0-alpha.10'), -1);
  assert.equal(compareSemver('1.0.0-beta.1.2', '1.0.0-beta.1.10'), -1);
});

test('version with prerelease has lower precedence than same version without prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha', '1.0.0'), -1);
  assert.equal(compareSemver('1.0.0', '1.0.0-beta'), 1);
});

test('multi-digit numeric identifiers', () => {
  assert.equal(compareSemver('1.0.0-beta.2', '1.0.0-beta.11'), -1);
  assert.equal(compareSemver('1.0.0-beta.11', '1.0.0-beta.2'), 1);
  assert.equal(compareSemver('1.0.0-rc.1', '1.0.0-rc.99'), -1);
});

test('major/minor/patch with multiple digits', () => {
  assert.equal(compareSemver('10.0.0', '9.9.9'), -1);
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  assert.equal(compareSemver('1.0.10', '1.0.9'), 1);
});

test('mixed numeric and alphanumeric prerelease identifiers', () => {
  assert.equal(compareSemver('1.0.0-alpha.0', '1.0.0-alpha-beta'), -1);
  assert.equal(compareSemver('1.0.0-alpha-beta', '1.0.0-alpha.0'), 1);
  assert.equal(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta'), -1);
});

test('build metadata on versions with and without prerelease', () => {
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha'), 0);
  assert.equal(compareSemver('1.0.0-alpha+build.5', '1.0.0-alpha+build.1'), 0);
  assert.equal(compareSemver('1.0.0+build.5', '1.0.0-alpha+build.1'), 0);
});
