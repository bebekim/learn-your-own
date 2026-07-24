const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsvLine } = require('../src/csv-line.js');

test('basic comma split', () => {
  assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('quoted field with comma', () => {
  assert.deepEqual(parseCsvLine('"hello, world",x'), ['hello, world', 'x']);
});

test('escaped double quotes inside quoted field', () => {
  assert.deepEqual(parseCsvLine('"she said \"\"hi\"\"\",y'), ['she said "hi"', 'y']);
});

test('empty line returns single empty field', () => {
  assert.deepEqual(parseCsvLine(''), ['']);
});

test('empty field between commas', () => {
  assert.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c']);
});

test('quoted empty string', () => {
  assert.deepEqual(parseCsvLine('"",x'), ['', 'x']);
});

test('quoted field with escaped quotes at end', () => {
  assert.deepEqual(parseCsvLine('"\"\"",x'), ['"', 'x']);
});

test('quoted field with escaped quotes at start', () => {
  assert.deepEqual(parseCsvLine('\"\"\"\"a\"\"\"\" ,x'), ['\"\"a\"\"', 'x']);
});

test('fields with quotes and commas', () => {
  assert.deepEqual(parseCsvLine('\"\"\"hello\"\",\"\"world\"\"\" ,a'), ['\"hello\", \"world\"', 'a']);
});

test('leading/trailing commas', () => {
  assert.deepEqual(parseCsvLine(',a,b,'), ['', 'a', 'b', '']);
});

test('quoted field containing commas and quotes', () => {
  assert.deepEqual(parseCsvLine('"a,b,\"c,d\"",e'), ['a,b,"c,d"', 'e']);
});

test('mixed quoted and unquoted fields', () => {
  assert.deepEqual(parseCsvLine('"quoted,field",unquoted,another\"\"\"\"field\"\"\"\"'), ['quoted,field', 'unquoted', 'another\"field']);
});
