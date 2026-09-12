import assert from 'node:assert/strict';
import test from 'node:test';
import { findingLifecycle } from '../src/lyo/domain/finding-lifecycle.ts';

test('a finding revision needs its current checked premise, not just a later successful application', () => {
  const original = { version: 'original', intervention: 'Original advice.' };
  const revision = { id: 'revision', previousVersion: original.version, version: 'revised',
    intervention: 'Revised advice.', feedbackIds: ['counterexample'] };
  const counterexample = { id: 'counterexample', version: original.version, observationId: 'observation-1',
    applicability: 'applicable' as const, outcome: 'contradicted' as const };
  const later = { id: 'later-success', version: revision.version, observationId: 'observation-2',
    applicability: 'applicable' as const, outcome: 'supported' as const };
  const supported = findingLifecycle(original, [revision], [counterexample, later]);
  assert.equal(supported.validity, 'supported');
  assert.equal(supported.supporting, 1);
  assert.equal(supported.intervention, revision.intervention);

  const withdrawn = findingLifecycle(original, [revision], [later]);
  assert.equal(withdrawn.validity, 'needs-reassessment');
  assert.deepEqual(withdrawn.staleRevisionIds, [revision.id]);
  assert.equal(withdrawn.supporting, 1, 'independent later evidence survives, but cannot repair the missing premise');
  assert.deepEqual(original, { version: 'original', intervention: 'Original advice.' });
});
