import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { hashFile } from '../../src/contract/refs.ts';

const root = '/private/tmp/lyo-specific-transfer-20260910';
const origin = '/Users/marcus.kim/repositories/oss/clean-domain-driven';
const head = '3ce3438eba134cef4430dcecb6eadfce94b5a19a';
const git = (cwd, args) => execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
assert.equal(git(origin, ['status', '--porcelain']), '');
assert.equal(git(origin, ['rev-parse', 'HEAD']), head);
mkdirSync(root);
git(origin, ['clone', '--quiet', '--local', '--no-hardlinks', origin, join(root, 'source')]);
appendFileSync(join(root, 'source/.git/info/exclude'), '\n.agent-learning/\n.lyo/\n');
const verifier = realpathSync(fileURLToPath(new URL('verify-catalog.mjs', import.meta.url)));
const before = [];
for (const condition of ['baseline', 'learned']) {
  const cwd = join(root, condition);
  git(join(root, 'source'), ['worktree', 'add', '--detach', cwd, head]);
  execFileSync('cp', ['-cR', join(origin, 'node_modules'), join(cwd, 'node_modules')]);
  assert.equal(git(cwd, ['status', '--porcelain']), '');
  const checks = Object.fromEntries(['acceptance', 'regression'].map(phase => {
    const r = spawnSync(process.execPath, [verifier, phase], { cwd, encoding: 'utf8' });
    return [phase, { exitCode: r.status, stdout: r.stdout, stderr: r.stderr }];
  }));
  assert.equal(checks.acceptance.exitCode, 1);
  assert.equal(checks.regression.exitCode, 0);
  before.push({ condition, cwd, ...checks });
}
const budget = { max_turns: 10, max_wall_time_seconds: 180, max_tokens: 100000 };
const protocol = { id: 'catalog-nonblank-transfer-20260910', source: { origin, head }, root,
  candidateId: '77b7d36b8d920fa091db94920f615ad9bd589de3a615361cb03b8a72254d6de4',
  model: 'gpt-6-astra', budget, maxEvaluationTokens: 200000, maxPairs: 1,
  stoppingRule: 'One pair only. Any overrun fails the screen. No reruns or automatic follow-on experiments.',
  interpretation: 'One pair is screening evidence. Token differences alone cannot establish a repeatable saving or award useful-lesson credit.',
  comparison: 'Same untouched commit, prompt, model, tools, budget and frozen verifier; one run receives the exact revised advice and the other receives none from the task controller.',
  verifier, verifierSHA256: hashFile(verifier).sha256, createdAt: new Date().toISOString() };
writeFileSync(new URL('before.json', import.meta.url), JSON.stringify(before, null, 2) + '\n');
writeFileSync(new URL('protocol.json', import.meta.url), JSON.stringify(protocol, null, 2) + '\n');
writeFileSync(new URL('budget.json', import.meta.url), JSON.stringify(budget, null, 2) + '\n');
console.log(JSON.stringify({ root, before: before.map(r => ({condition:r.condition,acceptance:r.acceptance.exitCode,regression:r.regression.exitCode})) }));
