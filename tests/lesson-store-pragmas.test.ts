import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

test('the lesson store waits up to 5s for a lock and uses WAL', () => {
  const store = new LessonStore(join(mkdtempSync(join(tmpdir(), 'lyo-store-')), 'lessons.db'));
  try {
    assert.equal((store.db.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout, 5000);
    assert.equal((store.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }).journal_mode, 'wal');
  } finally { store.close(); }
});
