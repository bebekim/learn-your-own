import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileFindingTrial, findingTrialAllocation } from '../src/lyo/application/finding-trial-reconciliation.ts';
import type { FindingTrialReconciliationPort, TrialObservation, TrialPolicyRecord } from '../src/lyo/application/finding-trial-reconciliation.ts';
import type { FindingTrialPolicyDefinition } from '../src/lyo/domain/finding-trial-policy.ts';

const trial: FindingTrialPolicyDefinition = {
  id: 'trial-1', hash: 'trial-hash', findingId: 'finding-1', findingVersion: 'v1', model: 'model-x',
  roots: ['/repo'], measurement: { verifierFiles: ['/repo/verify.ts'] },
  verifierFiles: [{ path: '/repo/verify.ts', content: 'x' }],
};

function makePort(rows: TrialObservation[]) {
  const records: TrialPolicyRecord[] = [];
  const port: FindingTrialReconciliationPort = {
    observations: () => rows,
    findingState: () => ({ version: 'v1', validity: 'supported' }),
    verifiersChanged: () => false,
    superseded: () => false,
    latestPolicy: trialHash => [...records].reverse().find(row => row.content.trialHash === trialHash) ?? null,
    recordPolicy: record => { records.push(record); },
    hash: value => JSON.stringify(value),
  };
  return { port, records };
}

test('reconciliation persists a policy only when its content changes, chaining supersedes across revisions', () => {
  const rows: TrialObservation[] = [];
  const { port, records } = makePort(rows);
  const first = reconcileFindingTrial(port, trial);
  assert.equal(first.content.status, 'collecting');
  assert.equal(records.length, 1, 'the first reconciliation persists a policy');
  assert.deepEqual(reconcileFindingTrial(port, trial), first, 'unchanged observations return the same identity without a new record');
  assert.equal(records.length, 1, 'no duplicate record for unchanged content');

  rows.push({ id: 'op-1', assignment: { action: 'advice', probability: 1 }, sessionId: 's1', cwd: '/repo',
    closed: true, outcome: 'pass', reference: { id: 'op-1', assignmentHash: 'a1', windowHash: 'w1', evidenceHash: 'e1' } });
  const second = reconcileFindingTrial(port, trial);
  assert.notEqual(second.hash, first.hash, 'a changed cohort produces a new content hash');
  assert.equal(second.supersedes, first.id, 'the revised policy supersedes the prior identity');
  assert.equal(records.length, 2);
});

test('a suspended or superseded trial overrides the computed status regardless of observations', () => {
  const suspended = makePort([]);
  suspended.port.verifiersChanged = () => true;
  assert.equal(reconcileFindingTrial(suspended.port, trial).content.status, 'suspended');

  const superseded = makePort([]);
  superseded.port.superseded = () => true;
  assert.equal(reconcileFindingTrial(superseded.port, trial).content.status, 'superseded');
});

test('allocation requires an automatic opportunity, a current reference, and an unenrolled unit', () => {
  const { port, records } = makePort([]);
  const policy = reconcileFindingTrial(port, trial);
  assert.throws(() => findingTrialAllocation(port, { id: 'op-1' }, policy.id), /automatic/);

  const opportunity = { id: 'op-new', prospective: { automatic: { trialHash: trial.hash, unit: '/repo' } } };
  assert.throws(() => findingTrialAllocation(port, opportunity, 'stale-ref'), /policy changed/);
  assert.equal(findingTrialAllocation(port, opportunity, policy.id), null, 'a collecting policy withholds allocation');

  records.length = 0;
  const enrolled: TrialObservation = { id: 'existing', assignment: { action: 'advice', probability: 1 }, sessionId: 's0',
    cwd: '/repo', unit: '/repo', closed: true, outcome: 'pass', reference: { id: 'existing', assignmentHash: 'a', windowHash: 'w', evidenceHash: 'e' } };
  const { port: collidingPort } = makePort([enrolled]);
  const collidingPolicy = reconcileFindingTrial(collidingPort, trial);
  assert.throws(() => findingTrialAllocation(collidingPort, opportunity, collidingPolicy.id), /already enrolled/);
});

test('allocation reflects the latest policy status without deciding it', () => {
  const opportunity = { id: 'op-new', prospective: { automatic: { trialHash: 'trial-hash', unit: '/repo' } } };
  const policyWith = (status: string): TrialPolicyRecord => ({
    id: 'policy-1', source: 'session-finding-policy@1', hash: 'h', supersedes: null,
    content: { trialId: 'trial-1', trialHash: 'trial-hash', status,
      arms: { advice: { assigned: 0, pass: 0, fail: 0, unknown: 0 }, 'no-advice': { assigned: 0, pass: 0, fail: 0, unknown: 0 } },
      effectInterval: null, evidence: [], definition: { findingVersion: 'v1', model: 'model-x', runtime: null, roots: ['/repo'], evaluation: null } },
  });
  const portWith = (status: string): FindingTrialReconciliationPort => ({
    observations: () => [], findingState: () => ({ version: 'v1', validity: 'supported' }),
    verifiersChanged: () => false, superseded: () => false, latestPolicy: () => policyWith(status),
    recordPolicy: () => { throw new Error('allocation must not persist a policy'); }, hash: value => JSON.stringify(value),
  });
  assert.equal(findingTrialAllocation(portWith('collecting'), opportunity, 'policy-1'), null);
  assert.equal(findingTrialAllocation(portWith('promoted'), opportunity, 'policy-1'), 'advice');
  assert.equal(findingTrialAllocation(portWith('awaiting-outcomes'), opportunity, 'policy-1'), 'no-advice');
});
