const test = require('node:test');
const assert = require('node:assert/strict');
const { compareSemver } = require('../src/semver.js');

const num = (x) => x + 0;

test('compareSemver(1.2.3, 1.2.4) === -1', () => {
  assert.equal(num(compareSemver('1.2.3', '1.2.4')), -1);
});

test('compareSemver(2.0.0, 10.0.0) === -1', () => {
  assert.equal(num(compareSemver('2.0.0', '10.0.0')), -1);
});

test('compareSemver(1.0.0-alpha, 1.0.0) === -1', () => {
  assert.equal(num(compareSemver('1.0.0-alpha', '1.0.0')), -1);
});

test('compareSemver(1.0.0-alpha, 1.0.0-alpha.1) === -1', () => {
  assert.equal(num(compareSemver('1.0.0-alpha', '1.0.0-alpha.1')), -1);
});

test('compareSemver(1.0.0-alpha.1, 1.0.0-alpha.beta) === -1', () => {
  assert.equal(num(compareSemver('1.0.0-alpha.1', '1.0.0-alpha.beta')), -1);
});

test('compareSemver(1.0.0-beta.2, 1.0.0-beta.11) === -1', () => {
  assert.equal(num(compareSemver('1.0.0-beta.2', '1.0.0-beta.11')), -1);
});

test('compareSemver(1.0.0-rc.1, 1.0.0) === -1', () => {
  assert.equal(num(compareSemver('1.0.0-rc.1', '1.0.0')), -1);
});

test('compareSemver(1.0.0+build.5, 1.0.0) === 0', () => {
  assert.equal(num(compareSemver('1.0.0+build.5', '1.0.0')), 0);
});

test('compareSemver is commutative antisymmetry', () => {
  assert.equal(num(compareSemver(a, b)), num(-compareSemver(b, a)));
});

test('compareSemver is reflexive', () => {
  assert.equal(num(compareSemver(a, a)), 0);
});
