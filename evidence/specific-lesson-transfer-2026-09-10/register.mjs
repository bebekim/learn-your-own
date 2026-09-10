import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel, closeKernel } from '../../src/ledger.ts';
import { hashFile } from '../../src/contract/refs.ts';
import { TaskFeedback } from '../../src/lyo/control/task-feedback.ts';

const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const protocol = read('protocol.json');
const installed = JSON.parse(readFileSync('/Users/marcus.kim/.nvm/versions/node/v24.15.0/lib/node_modules/lyo-kernel/package.json', 'utf8'));
assert.equal(installed.version, '0.4.3-adaptive.2');
for (const [path, sha] of Object.entries(read('hook-config-before.json'))) assert.equal(hashFile(path).sha256, sha);
assert.equal(hashFile(protocol.verifier).sha256, protocol.verifierSHA256);
const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const command = phase => `${quote(process.execPath)} ${quote(protocol.verifier)} ${phase}`;
const criteria = [
  'Reject whitespace-only isbn, title and author strings at the catalogue add-book request schema, including Unicode whitespace.',
  'Preserve every accepted nonblank string exactly; retain existing empty/missing/non-string rejection and unknown-field stripping.',
];
const prompt = criteria.join('\n') + '\nThis is a small ticket in an isolated experimental checkout. ' +
  'Relevant files: src/modules/catalog/infrastructure/nestjs/catalog.schemas.ts and src/modules/catalog/tests/unit/catalog-schemas.test.ts. ' +
  'Use TDD and the focused command: rtk proxy node node_modules/vitest/vitest.mjs run src/modules/catalog/tests/unit/catalog-schemas.test.ts. ' +
  'Keep changes to that schema and its tests. Group independent reads. Do not run unrelated suites. ' +
  'Do not create worktrees, commit, change configuration, or delegate. Do not inspect external verifiers, sibling checkouts, ' +
  'experiment artifacts or lesson libraries. Use the task criteria and any context delivered by the registered native hook. ' +
  'Prefix shell commands with rtk. Finish within 100,000 input-plus-output tokens and 180 seconds; report the changes and test result.';
const kernel = createKernel({ dbPath: '/Users/marcus.kim/.lyo/corpus.sqlite' });
try {
  const loop = new TaskFeedback(kernel);
  const candidate = loop.intervention(protocol.candidateId);
  const source = loop.inspect(candidate.source.attemptId);
  const policy = loop.trial(protocol.candidateId, protocol.budget);
  const attempts = ['baseline', 'learned'].map(condition => ({
    attemptId: `transfer-20260910-catalog-${condition}`, cwd: join(protocol.root, condition), runtime: 'codex',
    model: protocol.model, family: source.registration.input.family, condition, policyId: policy.id, pairId: protocol.id,
    criteria, verifierFiles: [protocol.verifier], regressionCheck: { command: command('regression'), files: [protocol.verifier] },
    task: { task_id: 'CATALOG-NONBLANK-20260910', split: 'selection', repo_ref: { kind: 'git', ref: protocol.source.head },
      prompt, allowed_tools: ['shell', 'edit'], budget: protocol.budget,
      success_check: { kind: 'command', command: command('acceptance') },
      expected_touched_paths: ['src/modules/catalog/infrastructure/nestjs/catalog.schemas.ts', 'src/modules/catalog/tests/unit/catalog-schemas.test.ts'],
      tags: ['cross-repository', 'nonblank-input', 'candidate-screen'] } }));
  for (const input of attempts) {
    loop.register(input);
    writeFileSync(join(protocol.root, `${input.condition}.registration.json`), JSON.stringify(input, null, 2), { flag: 'wx' });
  }
  const comparison = loop.registerComparison({ id: protocol.id, policyId: policy.id, maxTotalTokenRatio: 1,
    pairs: [{ baselineAttemptId: attempts[0].attemptId, learnedAttemptId: attempts[1].attemptId }] });
  assert.equal(loop.inspect(attempts[0].attemptId).registration.taskFingerprint, loop.inspect(attempts[1].attemptId).registration.taskFingerprint);
  for (const [name, value] of Object.entries({ 'trial-policy.json': policy, 'registrations.json': attempts,
    'comparison.json': comparison, 'registered-at.json': { at: new Date().toISOString() },
    'rollout.json': { version: installed.version, configHashesPreserved: true,
      tarballSHA256: hashFile(fileURLToPath(new URL('../../dist/lyo-kernel-0.4.3-adaptive.2.tgz', import.meta.url))).sha256 } }))
    writeFileSync(new URL(name, import.meta.url), JSON.stringify(value, null, 2) + '\n');
  console.log(JSON.stringify({ comparisonId: comparison.id, policyId: policy.id, registered: attempts.map(a => a.attemptId) }));
} finally { closeKernel(kernel); }
