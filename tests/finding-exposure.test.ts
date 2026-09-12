import assert from 'node:assert/strict';
import test from 'node:test';
import { eligibleFindingReviewQueue, type PendingFindingReview } from '../src/lyo/domain/finding-exposure.ts';

const workspace = '/current/repo';
const item = (overrides: Partial<PendingFindingReview>): PendingFindingReview => ({
  findingId: 'finding-1', opportunityId: 'opportunity-1', cwd: workspace,
  status: 'needs-assessment', evidenceRef: null, problems: [], ...overrides,
});

test('a finding under trial management is withheld from the ordinary review queue', () => {
  const managed = new Set(['trial-managed']);
  const queue = eligibleFindingReviewQueue(
    [item({ findingId: 'trial-managed' }), item({ findingId: 'ordinary' })],
    { managed: id => managed.has(id), workspace },
  );
  assert.deepEqual(queue.map(row => row.findingId), ['ordinary']);
});

test('retained evidence from another workspace can still be reviewed, but bare local absence cannot', () => {
  const queue = eligibleFindingReviewQueue([
    item({ opportunityId: 'elsewhere-with-evidence', cwd: '/elsewhere', evidenceRef: 'evidence-1' }),
    item({ opportunityId: 'elsewhere-without-evidence', cwd: '/elsewhere', evidenceRef: null }),
  ], { managed: () => false, workspace });
  assert.deepEqual(queue.map(row => row.opportunityId), ['elsewhere-with-evidence']);
});

test('current-workspace items sort ahead of retained items from elsewhere', () => {
  const queue = eligibleFindingReviewQueue([
    item({ opportunityId: 'retained', cwd: '/elsewhere', evidenceRef: 'evidence-1' }),
    item({ opportunityId: 'local', cwd: workspace }),
  ], { managed: () => false, workspace });
  assert.deepEqual(queue.map(row => row.opportunityId), ['local', 'retained']);
});
