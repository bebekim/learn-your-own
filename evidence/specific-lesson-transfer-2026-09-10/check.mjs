// Offline evidence consistency check. No database writes or model calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTaskReport } from '../../src/eval/task-report.ts';
import { hashValue, hashFile } from '../../src/contract/refs.ts';
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const records = ['baseline', 'learned'].map(arm => read(`${arm}.json`));
const policy = read('trial-policy.json'), comparison = read('comparison.json'), report = read('report.json');
const { reportId, evidenceRefs, ...saved } = report;
assert.equal(reportId, hashValue({ ...saved, evidenceRefs }));
assert.deepEqual(buildTaskReport(policy, records, comparison), saved);
assert.equal(hashFile(new URL('verify-catalog.mjs', import.meta.url)).sha256, read('protocol.json').verifierSHA256);
assert.deepEqual(records[0].delivery.output, {});
assert.equal(records[1].delivery.output.additionalContext, read('revision.json').proposal.intervention);
for (const [index, record] of records.entries()) {
  assert.equal(hashValue(record.receipt), evidenceRefs[index].receiptHash);
  assert.equal(record.receipt.measurement.withinBudget, false);
  assert.equal(record.decision.algorithm, 'fixed-action@1');
}
assert.equal(report.decision, 'inconclusive');
assert.equal(read('candidate-after.json').status, 'candidate');
assert.deepEqual(read('unicode-audit.json').results, {
  baseline: { isbn: false, title: false, author: false },
  learned: { isbn: true, title: true, author: true },
});
assert.equal(read('summary.json').recordedCandidateAndEvaluationTokens, 767184);
console.log('Retained delivery, receipts, report, budget failure and audit are consistent.');
