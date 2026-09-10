// Run with --installed to exercise the configured global commands; otherwise test the built package.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const installed = process.argv.includes('--installed');
const root = fileURLToPath(new URL('../../', import.meta.url));
const packageRoot = installed ? dirname(dirname(realpathSync(join(dirname(process.execPath), 'lyo')))) : join(root, 'dist/npm/package');
const { LessonStore } = await import(pathToFileURL(join(packageRoot, 'src/lyo/storage/lesson-store.js')));
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
const executable = bin => `${quote(process.execPath)} ${quote(join(packageRoot, bin))}`;
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
const hash = value => createHash('sha256').update(value).digest('hex');
const checks = [];
for (const host of ['codex', 'claude']) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `lyo-rollout-${host}-`)));
  const storePath = join(dir, 'lessons.db'), store = new LessonStore(storePath);
  const env = { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath, TMPDIR: dir, LYO_CONFIG_FILE: join(dir, 'absent-config.json') };
  let capture = `${executable('src/cli.js')} ${host}-hook --db-from-event-cwd --spool-dir-from-event-cwd`;
  let deliver = executable('src/lyo/selection/session-hook.js'), configHash = null;
  if (installed) {
    const config = readFileSync(join(homedir(), host === 'codex' ? '.codex/hooks.json' : '.claude/settings.json'), 'utf8');
    configHash = hash(config);
    const hooks = JSON.parse(config).hooks;
    const commands = name => hooks[name].flatMap(group => group.hooks.map(hook => hook.command));
    capture = commands('PreToolUse').find(command => command.includes(`lyo ${host}-hook `));
    deliver = commands('SessionStart').find(command => command.includes('/lyo-session-hook'));
    assert.ok(capture && deliver);
    assert.ok(commands('PostToolUse').includes(capture));
  }
  const run = (command, input = {}) => execFileSync('/bin/sh', ['-c', command], { cwd: dir, env, input: JSON.stringify(input), encoding: 'utf8' });
  const cli = args => JSON.parse(run(`${executable('src/cli.js')} ${args} --store ${quote(storePath)}`));
  const submit = (command, value) => {
    const input = join(dir, 'request.json'); writeFileSync(input, JSON.stringify(value));
    return cli(`finding ${command} --input ${quote(input)}`);
  };
  try {
    const findingId = `finding:rollout-${host}`, sessionId = `isolated-rollout-${host}`;
    const advice = 'For this fixture, set followed to true; the declared prediction must also hold.';
    store.recordTrace({ trace_id: findingId, kind: 'behavior', summary: 'Isolated package verification only.', payload: {
      source: 'session-finding@1', gitCommonDir: join(dir, 'fixture.git'), activity: 'transfer-review',
      intervention: advice, observation: 'Synthetic lifecycle fixture, not a learned benefit.', evidenceRef: 'fixture:rollout' } });
    const event = { cwd: dir, session_id: sessionId, hook_event_name: 'SessionStart', prompt: '[lyo:transfer-review]' };
    run(capture, event);
    assert.ok(run(deliver, event).includes(advice));
    const source = join(dir, 'state.json'), verifier = join(dir, 'check.mjs');
    writeFileSync(source, JSON.stringify({ applicable: true, followed: false, predicted: false }));
    writeFileSync(verifier, "import fs from 'node:fs'; console.log(JSON.stringify({satisfied:JSON.parse(fs.readFileSync(process.argv[2],'utf8'))[process.argv[3]]}));");
    const check = key => `${quote(process.execPath)} ${quote(verifier)} ${quote(source)} ${key}`;
    const action = `${quote(process.execPath)} -e ${quote(`require('fs').writeFileSync(${JSON.stringify(source)}, JSON.stringify({applicable:true,followed:true,predicted:false}))`)}`;
    const toolInput = { command: action }, id = `rollout-${host}`;
    submit('register', { id, findingId, deliveryId: `session-delivery:${sessionId}`, taskId: id, cwd: dir,
      claim: { kind: 'deterministic', conditions: 'This isolated fixture applies.', action: advice,
        prediction: 'The fixture predicted flag is true.', falsifiedBy: 'The fixture flag is explicitly false.' },
      checks: { applicability: check('applicable'), adherence: check('followed'), prediction: check('predicted') },
      sourceFiles: [source], verifierFiles: [verifier], evaluator: { id: 'fixture', version: '1' },
      capture: { runtime: host, toolName: 'Bash', toolInput } });
    const basis = { rationale: 'The retained verifier reads the named fixture boolean. This exercises the contract, not semantic generalization.', verifierPaths: [verifier] };
    submit('semantics', { id: `${id}-semantics`, opportunityId: id, reviewer: { id: 'rollout-fixture', kind: 'agent' },
      verdict: 'accepted', claimKind: 'deterministic', applicability: basis, adherence: basis, prediction: basis,
      limitations: 'Synthetic deterministic fixture only; no real-world usefulness or independent review claimed.' });
    const tool = { ...event, tool_name: 'Bash', tool_use_id: `${id}-call`, tool_input: toolInput };
    run(capture, { ...tool, hook_event_name: 'PreToolUse' });
    run(action);
    const completed = JSON.parse(run(capture, { ...tool, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } }));
    assert.match(completed.hookSpecificOutput?.additionalContext ?? '', /needs-content-review/);
    run(capture, { ...tool, hook_event_name: 'PostToolUse', tool_response: { exit_code: 0 } });
    const state = cli(`finding inspect --finding-id ${quote(findingId)}`).finding;
    assert.equal(state.validity, 'needs-revision');
    assert.equal(state.currentFeedback.length, 1);
    const next = run(deliver, { ...event, session_id: `${sessionId}-later` });
    assert.ok(!next.includes(advice));
    assert.match(next, /needs-content-review/);
    assert.equal(cli('finding pending').pending[0].status, 'needs-content-review');
    checks.push({ host, version, configuredCommands: installed, configHash, capture, deliver,
      pairedAction: true, automaticAssessment: true, duplicateReviews: 0, nextDeliverySuppressed: true,
      immediateReviewPrompt: true, nextReviewPrompt: true, evidence: state.opportunities[0].evidence,
      delivery: JSON.parse(store.getTrace(`session-delivery:${sessionId}`).payload_json),
      feedback: state.currentFeedback[0], realUsefulnessEstablished: false });
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ packageRoot, version, installed, checks }, null, 2));
