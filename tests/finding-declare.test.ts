import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { declareFinding, findingState } from '../src/lyo/storage/finding-state.ts';
import { selectSessionFindings } from '../src/lyo/application/finding-selection.ts';
import { hashValue } from '../src/lyo/contract/refs.ts';

const finding = { scope: { roots: ['/Users/example/repositories'] }, activity: 'json-output-handling',
  observation: 'Agents parse command JSON without looking at it first; 9% of such commands fail.',
  evidenceRef: 'decision-cases:json-parse-input@87bc9fe1', intervention: 'Look at raw output before parsing it as JSON.' };

function withStore(fn: (store: LessonStore) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-declare-'));
  const store = new LessonStore(join(dir, 'lessons.db'));
  try { fn(store); } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}

test('a declared finding is scoped by roots, has an open activity, and is idempotent', () => withStore(store => {
  const first = declareFinding(store, 'finding:json-output-handling', finding);
  assert.equal(first.created, true);
  assert.equal(declareFinding(store, 'finding:json-output-handling', finding).created, false);
  assert.throws(() => declareFinding(store, 'finding:json-output-handling', { ...finding, intervention: 'different' }), /different finding/);
  const state = findingState(store.db, 'finding:json-output-handling');
  assert.equal(state.finding.activity, 'json-output-handling');
  assert.deepEqual(state.finding.scope, finding.scope);
  assert.equal(state.version, first.version);
}));

test('a declared finding needs exactly one scope and a valid id and activity', () => withStore(store => {
  const { scope: _scope, ...unscoped } = finding;
  assert.throws(() => declareFinding(store, 'finding:a1', unscoped), /exactly one/);
  assert.throws(() => declareFinding(store, 'finding:a2', { ...finding, gitCommonDir: '/x/.git' }), /exactly one/);
  assert.throws(() => declareFinding(store, 'finding:a3', { ...finding, activity: 'Not A Slug' }), /slug/);
  assert.throws(() => declareFinding(store, 'bad id', finding), /finding:<slug>/);
}));

test('ordinary delivery still needs the activity tag; an untagged prompt gets nothing', () => withStore(store => {
  declareFinding(store, 'finding:json-output-handling', finding);
  const port = { managed: () => false, hash: hashValue, state: (id: string) => {
    const s = findingState(store.db, id); return { ...s, currentFeedback: [] };
  } };
  const input = (prompt: string) => ({ repository: () => null, cwd: () => '/tmp', prompt });
  assert.equal(selectSessionFindings(['finding:json-output-handling'], input('parse this json'), port).length, 0);
  assert.equal(selectSessionFindings(['finding:json-output-handling'], input('[lyo:json-output-handling] parse'), port).length, 1);
}));
