import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectSessionFindings } from '../src/lyo/application/finding-selection.ts';

test('selection counts distinct support only for the delivered version and context, and withholds invalidated advice', () => {
  const finding = { id: 'one', source: 'session-finding@1' as const, gitCommonDir: '/original/.git',
    activity: 'transfer-review' as const, observation: 'observed', evidenceRef: 'ref', intervention: 'check witnesses' };
  const context = { repository: '/current/.git', activity: 'transfer-review', match: 'activity' as const };
  const support = { version: 'v1', outcome: 'supported' as const, context, observationId: 'action1' };
  const state = { finding, version: 'v1', validity: 'supported', currentFeedback: [support, support,
    { ...support, observationId: 'action2' }, { ...support, version: 'old', observationId: 'action3' },
    { ...support, context: { ...context, repository: '/elsewhere/.git' }, observationId: 'action4' }] };
  const input = { repository: () => '/current/.git', cwd: () => null, prompt: '[lyo:transfer-review]' };
  const port = { managed: (id: string) => id === 'managed', state: (id: string) => id === 'invalid' ? null
    : { ...state, finding: { ...finding, id }, validity: id === 'suspended' ? 'needs-reassessment' : state.validity },
    hash: (value: unknown) => JSON.stringify(value) };
  const selected = selectSessionFindings(['managed', 'invalid', 'suspended', 'one', 'two', 'three', 'four'], input, port);
  assert.deepEqual(selected.map(row => [row.id, row.supporting]), [['one', 2], ['two', 2], ['three', 2]]);
  assert.deepEqual(selected[0].context, context);
  assert.deepEqual(selectSessionFindings(['one'], { ...input, prompt: '' }, port), []);
  assert.equal(selectSessionFindings(['one'], { ...input, repository: () => null, cwd: () => '/unversioned' }, port)[0].supporting, 0);
});
