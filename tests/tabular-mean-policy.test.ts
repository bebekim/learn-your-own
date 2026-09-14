import assert from 'node:assert/strict';
import test from 'node:test';
import { selectAction } from '../src/lyo/domain/tabular-mean-policy.ts';

const actions = ['continue', 'verify'];
const estimates = [{ action: 'continue', count: 0, mean: null }, { action: 'verify', count: 0, mean: null }];

test('a fixed action always wins, regardless of mode or estimates', () => {
  const result = selectAction({ actions, baselineAction: 'continue', mode: 'evaluate', fixedAction: 'verify', estimates });
  assert.deepEqual(result, { action: 'verify', propensity: 1 });
});

test('explore mode draws uniformly over the registered actions and reports exact propensity', () => {
  assert.deepEqual(selectAction({ actions, baselineAction: 'continue', mode: 'explore', estimates, draw: 0 }),
    { action: 'continue', propensity: 0.5 });
  assert.deepEqual(selectAction({ actions, baselineAction: 'continue', mode: 'explore', estimates, draw: 0.9 }),
    { action: 'verify', propensity: 0.5 });
});

test('explore mode rejects a draw outside [0, 1)', () => {
  for (const draw of [undefined, NaN, -0.1, 1, 1.1]) {
    assert.throws(() => selectAction({ actions, baselineAction: 'continue', mode: 'explore', estimates, draw }), /random draw/);
  }
});

test('evaluate mode falls back to the baseline until every action has a measured outcome', () => {
  const partial = [{ action: 'continue', count: 1, mean: 0.2 }, { action: 'verify', count: 0, mean: null }];
  assert.deepEqual(selectAction({ actions, baselineAction: 'continue', mode: 'evaluate', estimates: partial }),
    { action: 'continue', propensity: 1 });
});

test('evaluate mode exploits the best observed mean once every action is measured', () => {
  const complete = [{ action: 'continue', count: 3, mean: 0.2 }, { action: 'verify', count: 2, mean: 0.8 }];
  assert.deepEqual(selectAction({ actions, baselineAction: 'continue', mode: 'evaluate', estimates: complete }),
    { action: 'verify', propensity: 1 });
});
