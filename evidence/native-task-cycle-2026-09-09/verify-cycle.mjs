// Verify retained cycle evidence after extracting artifacts.tar.gz into a directory.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const file = name => readFileSync(join(process.argv[2], name));
const read = name => JSON.parse(file(name));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const records = read('attempts.json'), policy = read('policy.json').policy, report = read('report-after.json').report;
const training = records.filter(r => r.registration.input.condition === 'explore');
const later = records.filter(r => r.registration.input.condition === 'learned');
assert.deepEqual([records.length, training.length, later.length], [8, 4, 2]);
assert.equal(read('protocol.json').verifierSHA256, sha256(file('verify.mjs')));
assert.equal(policy.revision, Math.max(...training.map(r => r.receipt.feedback.sequence)));
assert.equal(policy.training.totalTokens, training.reduce((n, r) => n + r.receipt.measurement.usage.totalTokens, 0));
for (const r of records) {
  const m = r.receipt.measurement, name = r.registration.input.attemptId.replace('pilot-20260909-', '');
  assert.equal(r.receipt.feedback.decisionId, r.decision.id);
  assert.equal(m.trace.sha256, sha256(file(`${name}.jsonl`)));
  assert.equal(m.outcome, true); assert.equal(m.withinBudget, true); assert.equal(m.reward, 1);
  assert.ok(m.source.diff);
  assert.equal(m.acceptance.exit_code, 0); assert.equal(m.regression.exit_code, 0);
  assert.notEqual(read(`${name}.before.json`).acceptance.exitCode, 0);
  const events = m.trace.content.split('\n').filter(s => s.trim()).map(s => JSON.parse(s));
  assert.equal(events[0].thread_id, r.delivery.sessionId);
  assert.equal(m.usage.totalTokens, events.filter(e => e.type === 'turn.completed')
    .reduce((n, e) => n + e.usage.input_tokens + e.usage.output_tokens, 0));
}
for (const r of later) {
  assert.equal(r.decision.revision, policy.revision); assert.equal(r.decision.action, 'no-guidance');
  assert.ok(!policy.trainingTaskFingerprints.includes(r.registration.taskFingerprint));
  for (const estimate of r.decision.estimates) {
    const rewards = training.filter(t => t.decision.action === estimate.action).map(t => t.receipt.feedback.reward);
    assert.equal(estimate.count, rewards.length);
    assert.equal(estimate.mean, rewards.reduce((a, b) => a + b, 0) / rewards.length);
  }
  const name = r.registration.input.attemptId.replace('pilot-20260909-', '');
  assert.ok(Date.parse(read('comparison-registered-at.json').at) < Date.parse(read(`${name}.jsonl.launch.json`).startedAt));
}
assert.equal(report.decision, 'inconclusive'); assert.equal(report.deployment, 'experimental-only');
assert.equal(report.totalLearnedTokens, policy.training.totalTokens + later.reduce((n, r) => n + r.receipt.measurement.usage.totalTokens, 0));
console.log('Verified: eight real task receipts, frozen feedback reuse, retained trace hashes, costs, and inconclusive comparison.');
