// Local deployment check. All generated events and learning records stay in disposable stores.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
if (!process.argv[2]) throw new Error('usage: node verify-deployment.mjs NEW_OUTPUT_DIRECTORY [BUILT_PACKAGE_ROOT]');
const output = resolve(process.argv[2]);
mkdirSync(output); // Refuse to overwrite an earlier deployment check.
const installed = !process.argv[3];
const packageRoot = installed ? dirname(dirname(realpathSync(join(dirname(process.execPath), 'lyo')))) : resolve(process.argv[3]);
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
const hash = value => createHash('sha256').update(value).digest('hex');
const files = readdirSync(join(root, 'dist/npm/package/src'), { recursive: true }).filter(path => /\.(js|json)$/.test(path));
for (const file of files) assert.equal(hash(readFileSync(join(packageRoot, 'src', file))),
  hash(readFileSync(join(root, 'dist/npm/package/src', file))), `installed source drift: ${file}`);

// Execute the unchanged scenario against package JS, retaining the generated runner for inspection.
const scenario = readFileSync(new URL('./run.ts', import.meta.url), 'utf8')
  .replace(/from '\.\.\/\.\.\/src\/([^']+)\.ts'/g,
    (_, path) => `from ${JSON.stringify(pathToFileURL(join(packageRoot, 'src', `${path}.js`)).href)}`)
  .replace("new URL('../specific-lesson-transfer-2026-09-10/unicode-audit.json', import.meta.url)",
    JSON.stringify(join(root, 'evidence/specific-lesson-transfer-2026-09-10/unicode-audit.json')));
assert.ok(!scenario.includes("from '../../src/"));
const runner = join(output, 'package-scenario.ts'); writeFileSync(runner, scenario);
const env = { ...process.env, LYO_CONFIG_FILE: join(output, 'absent-config.json') };
execFileSync(process.execPath, [runner, join(output, 'scenario')], { env, encoding: 'utf8' });
const report = JSON.parse(readFileSync(join(output, 'scenario/report.json'), 'utf8'));
const journal = JSON.parse(readFileSync(join(output, 'scenario/journal.json'), 'utf8'));
const cli = args => execFileSync(process.execPath, [join(packageRoot, 'src/cli.js'), 'finding', ...args,
  '--store', report.storePath], { env, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
const submit = (command, input) => {
  const path = join(output, 'request.json'); writeFileSync(path, JSON.stringify(input));
  return cli([command, '--input', path]);
};
const registration = id => JSON.parse(journal.find(row => row.trace_id === `finding-opportunity:${id}`).payload_json).content.input;
const rejects = (input, message) => {
  assert.throws(() => submit('register', input), error => error.status === 1 && message.test(String(error.stdout)));
};
rejects({ ...registration('original'), id: 'stale-banner' }, /current finding version/);
submit('withdraw', { evidenceRef: 'finding-evidence:original', author: 'deployment-check',
  rationale: 'Exercise correction propagation in the isolated store; the original experiment is unaffected.' });
rejects({ ...registration('revised'), id: 'suspended-banner' }, /finding is suspended/);
const afterWithdrawal = JSON.parse(cli(['inspect', '--finding-id', report.findingId])).finding;
assert.equal(afterWithdrawal.validity, 'needs-reassessment');
writeFileSync(join(output, 'after-withdrawal.json'), JSON.stringify(afterWithdrawal, null, 2) + '\n');

const hooks = JSON.parse(execFileSync(process.execPath,
  [join(root, 'evidence/ordinary-finding-feedback-2026-09-10/verify-rollout.mjs'), ...(installed ? ['--installed'] : [])],
  { env, encoding: 'utf8' }));
assert.equal(hooks.version, version);
for (const check of hooks.checks) {
  assert.equal(check.evidence.action.before.findingState.version, check.evidence.opportunity.version);
  assert.equal(check.evidence.action.before.findingState.validity, 'unvalidated');
}
writeFileSync(join(output, 'configured-hooks.json'), JSON.stringify(hooks, null, 2) + '\n');
const result = { version, packageRoot, installed, sourceFilesMatched: files.length, scenarioHash: hash(scenario),
  original: report.original.outcome, revised: report.revised.outcome, staleRegistrationRejected: true,
  withdrawnPremiseSuspendsRevision: true, suspendedRegistrationRejected: true,
  hooks: hooks.checks.map(check => ({ host: check.host, configuredCommands: check.configuredCommands,
    capture: check.capture, deliver: check.deliver, configHash: check.configHash, pairedAction: check.pairedAction,
    automaticAssessment: check.automaticAssessment, actionStateRetained: true, nextDeliverySuppressed: check.nextDeliverySuppressed })),
  realUsefulnessEstablished: false, productionLearningRecordsWritten: false };
writeFileSync(join(output, 'deployment.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
