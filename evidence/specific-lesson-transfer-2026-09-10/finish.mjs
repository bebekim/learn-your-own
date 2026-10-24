// Retain this one registered screen. Does not launch hosts or change measurements.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createKernel, closeKernel } from '../../src/lyo/storage/ledger.ts';
import { TaskFeedback } from '../../src/lyo/control/task-feedback.ts';
import { hashFile } from '../../src/lyo/contract/refs.ts';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const save = (name, value) => writeFileSync(new URL(name, import.meta.url), JSON.stringify(value, null, 2) + '\n');
const protocol = read('protocol.json'), policy = read('trial-policy.json');
const kernel = createKernel({ dbPath: '/Users/marcus.kim/.lyo/corpus.sqlite' });
try {
  const loop = new TaskFeedback(kernel), records = [];
  for (const arm of ['baseline', 'learned']) {
    const record = loop.inspect(`transfer-20260910-catalog-${arm}`);
    const result = JSON.parse(readFileSync(join(protocol.root, `${arm}.result.json`), 'utf8'));
    assert.deepEqual(record.receipt, result.receipt);
    assert.equal(hashFile(join(protocol.root, `${arm}.jsonl`)).sha256, record.receipt.measurement.trace.sha256);
    assert.equal(record.receipt.measurement.usage.complete, true);
    records.push(record);
    save(`${arm}.json`, record);
    for (const suffix of ['launch.json', 'exit.json'])
      copyFileSync(join(protocol.root, `${arm}.jsonl.${suffix}`), new URL(`${arm}.${suffix}`, import.meta.url));
  }
  assert.deepEqual(records[0].delivery.output, {});
  assert.deepEqual(records[1].delivery.output, { additionalContext: read('revision.json').proposal.intervention });
  assert.equal(records[0].registration.taskFingerprint, records[1].registration.taskFingerprint);
  assert.equal(hashFile(protocol.verifier).sha256, protocol.verifierSHA256);
  const report = loop.report(policy.id, protocol.id);
  save('report.json', report);
  save('candidate-after.json', loop.intervention(protocol.candidateId));

  // Post-completion audit: never add cases to the frozen verifier retroactively.
  const value = '\u0085';
  assert.equal(/^\p{White_Space}$/u.test(value), true);
  assert.equal(value.trim().length, 1);
  const audit = { kind: 'post-hoc-verifier-coverage-audit', codePoint: 'U+0085',
    unicodeWhiteSpace: true, trimmedLength: 1, registeredVerifierIncludedCase: false, results: {} };
  for (const arm of ['baseline', 'learned']) {
    const { addBookBodySchema } = await import(pathToFileURL(join(protocol.root, arm,
      'src/modules/catalog/infrastructure/nestjs/catalog.schemas.ts')).href);
    audit.results[arm] = Object.fromEntries(['isbn', 'title', 'author'].map(field =>
      [field, addBookBodySchema.safeParse({ isbn: 'isbn', title: 'title', author: 'author', [field]: value }).success]));
  }
  assert.deepEqual(audit.results.baseline, { isbn: false, title: false, author: false });
  assert.deepEqual(audit.results.learned, { isbn: true, title: true, author: true });
  save('unicode-audit.json', audit);
  const baselineTokens = records[0].receipt.measurement.usage.totalTokens;
  const learnedTokens = records[1].receipt.measurement.usage.totalTokens;
  const summary = { reportDecision: report.decision, reasons: report.reasons,
    baselineTokens, learnedTokens, evaluationTokens: baselineTokens + learnedTokens,
    sourceAndLearningTokens: policy.training.totalTokens,
    recordedCandidateAndEvaluationTokens: policy.training.totalTokens + baselineTokens + learnedTokens,
    tokenDifference: learnedTokens - baselineTokens, tokenRatio: learnedTokens / baselineTokens,
    protocolBudgetPassed: records.every(r => r.receipt.measurement.withinBudget)
      && baselineTokens + learnedTokens <= protocol.maxEvaluationTokens,
    validatedUsefulLessons: 0, spendingDecision: 'stop-this-candidate-screen',
    limitations: ['One pair; no causal estimate of benefit or harm.',
      'Registered wall time includes the treatment approval delay.',
      'Both hosts loaded the same two legacy session lessons in different orders.',
      'The frozen verifier omitted U+0085; the treatment fails this post-hoc case.',
      'Tokens are checked after completion, not capped by the provider.',
      'Candidate/evaluation totals exclude engineering and orchestration; see its separate checkpoint.'] };
  save('summary.json', summary);
  console.log(JSON.stringify(summary, null, 2));
} finally { closeKernel(kernel); }
