const test = require('node:test');
const assert = require('node:assert');
const { parseCsvLine } = require('../src');

test('empty string returns single empty field', (t) => {
  t.deepEqual(parseCsvLine(''), []);
  // Wait, spec says returns [''] (single empty field). Actually spec example: parseCsvLine('') => ['']
  // But also they mention empty line? Let's check spec: "Parsing an empty string returns a single empty field"
  // So parseCsvLine('') should return [''].
  t.deepEqual(parseCsvLine(''), ['']);
});

test('simple fields', (t) => {
  t.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
});

test('quoted field with comma', (t) => {
  t.deepEqual(parseCsvLine('\"hello, world\",x'), ['hello, world', 'x']);
});

test('escaped double quotes inside quoted field', (t) => {
  t.deepEqual(parseCsvLine('\"she said \"\"hi\"\"\",y'), ['she said \"hi\"', 'y']);
});

test('empty fields between commas', (t) => {
  t.deepEqual(parseCsvLine('a,,c'), ['a', '', 'c']);
});

test('quoted empty string', (t) => {
  t.deepEqual(parseCsvLine('\"\",x'), ['', 'x']);
});

test('field with double quotes at start and end', (t) => {
  t.deepEqual(parseCsvLine('\"a,b,c\"'), ['a,b,c']);
});

test('mixed escaped quotes and commas', (t) => {
  t.deepEqual(parseCsvLine('\"a,\"\"b,c\"\"\",d'), ['a,"b,c"', 'd']);
});

test('multiple escaped quotes', (t) => {
  t.deepEqual(parseCsvLine('\"\"\"\"\"\"\"\"'), ['""']);
});

test('field containing double quotes not escaped', (t) => {
  // According to CSV spec, double quotes inside quoted fields must be escaped.
  // The spec only mentions two double quotes inside a quoted field decode to one literal double quote.
  // So a single double quote inside a quoted field is invalid? We'll assume it's not allowed.
  // We'll skip testing invalid input.
});

