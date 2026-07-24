const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsvLine } = require('../src/csv-line.js');

test('Fields split on unquoted commas', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('Quoted field removes surrounding quotes', () => {
  assert.deepEqual(parseCsvLine('"hello, world",x'), ['hello, world', 'x']);
});

test('Quoted field preserves internal commas', () => {
  assert.deepEqual(parseCsvLine('"a,b,c"'), ['a,b,c']);
});

test('Escaped double quotes decode to one literal quote', () => {
  assert.deepEqual(parseCsvLine('"she said ""hi""",y'), ['she said "hi"', 'y']);
});

test('Empty string returns one empty field', () => {
  assert.deepEqual(parseCsvLine(''), ['']);
});

test('Empty fields between consecutive unquoted commas', () => {
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c']);
});

test('Quoted empty string returns empty field', () => {
  assert.deepEqual(parseCsvLine('""'), ['']);
});

test('Mixed empty quoted and unquoted empty fields', () => {
  assert.deepEqual(parseCsvLine('a,"",b'), ['a', '', 'b']);
});

test('Quoted field with spaces', () => {
  assert.deepEqual(parseCsvLine('"  spaced  "'), ['  spaced  ']);
});

test('Unquoted field with spaces', () => {
  assert.deepEqual(parseCsvLine('a, b, c'), ['a', ' b', ' c']);
});

test('Single quoted field', () => {
  assert.deepEqual(parseCsvLine('"single"'), ['single']);
});

test('Single unquoted field', () => {
  assert.deepEqual(parseCsvLine('single'), ['single']);
});

test('Backslash escaping within quoted fields', () => {
  assert.deepEqual(parseCsvLine('"escaped\\\\"quote"'), ['escaped\\"quote']);
});
