// Recheck retained evidence and replay the proposed repair locally. No model or central DB calls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { hashFile, hashValue } from '../../src/lyo/contract/refs.ts';
import { deriveTaskIntervention } from '../../src/lyo/control/task-intervention.ts';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const source = read('source-attempt.json'), analyses = read('analyses.json');
const candidate = read('intervention.json'), policy = read('policy.json');
const { id, evaluations, ...content } = candidate;
assert.equal(hashValue(content), id);
assert.equal(candidate.source.receiptHash, hashValue(source.receipt));
assert.deepEqual(analyses.map(a => a.status), ['failed', 'candidate']);
assert.equal(analyses[1].generator.reusedFromAnalysisId, analyses[0].analysisId);
assert.equal(candidate.generator.response, analyses[0].generator.response);
assert.deepEqual({ model: candidate.generator.model, messages: candidate.generator.messages }, read('approved-request.json'));
assert.deepEqual(analyses.map(a => a.cost.reflectionTokens), [1644, 0]);
assert.equal(policy.training.totalTokens, source.receipt.measurement.usage.totalTokens + 1644);
assert.equal(read('report.json').registeredAttempts, 0);
assert.equal(read('report.json').decision, 'inconclusive');

const verifier = fileURLToPath(new URL('verify.mjs', import.meta.url));
assert.equal(hashFile(verifier).sha256, source.registration.verifierFiles[0].sha256);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const command = phase => `${quote(process.execPath)} ${quote(verifier)} ${phase} command`;
source.registration.input.task.success_check.command = command('acceptance');
source.registration.input.regressionCheck.command = command('regression');
source.registration.verifierFiles = source.registration.regressionFiles = [{ path: verifier, sha256: hashFile(verifier).sha256 }];
const replay = await deriveTaskIntervention(source, {
  repoPath: process.argv[2] ?? fileURLToPath(new URL('../..', import.meta.url)), model: candidate.generator.model,
}, async () => ({ content: candidate.generator.response, usage: { totalTokens: 0 } }));
assert.equal(replay.mechanism.supported, true);
assert.deepEqual(replay.mechanism.checks.map(c => c.accepted), [false, true, false, true]);
assert.ok(replay.mechanism.checks.every(c => c.regressionPassed));
console.log('Verified retained provenance and costs; local replay reproduces fail/pass/same-fail/pass. No model request was made.');
