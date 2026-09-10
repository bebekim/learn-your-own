import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { addBookBodySchema } = await import(pathToFileURL(resolve('src/modules/catalog/infrastructure/nestjs/catalog.schemas.ts')));
const valid = { isbn: '9780134685991', title: 'Clean Code', author: 'Robert C. Martin' };
const fields = Object.keys(valid);
if (process.argv[2] === 'acceptance') {
  for (const field of fields) for (const value of [' ', '\t\n', '\u00a0', '\u2003', ' \t\n\u00a0\u2003 '])
    assert.equal(addBookBodySchema.safeParse({ ...valid, [field]: value }).success, false, `${field} must reject blank text`);
} else if (process.argv[2] === 'regression') {
  assert.deepEqual(addBookBodySchema.parse(valid), valid);
  for (const field of fields) {
    const spaced = { ...valid, [field]: ` \t${valid[field]}\n ` };
    assert.deepEqual(addBookBodySchema.parse(spaced), spaced, 'validation must preserve accepted input');
    for (const value of ['', null, undefined, 0, [], {}])
      assert.equal(addBookBodySchema.safeParse({ ...valid, [field]: value }).success, false);
  }
  assert.equal(addBookBodySchema.safeParse(null).success, false);
  assert.equal(addBookBodySchema.safeParse({}).success, false);
  assert.deepEqual(addBookBodySchema.parse({ ...valid, unknown: 'discard' }), valid);
} else throw new Error('expected acceptance or regression');
console.log(JSON.stringify({ phase: process.argv[2], passed: true }));
