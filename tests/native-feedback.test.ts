import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

function fixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-native-feedback-')));
  const cwd = join(dir, 'work', 'ticket');
  mkdirSync(cwd, { recursive: true });
  const db = join(dir, 'central.sqlite');
  const config = join(dir, 'config.json');
  writeFileSync(config, JSON.stringify({ rootDir: join(dir, 'work'), corpusPath: db,
    adaptiveFeedback: { mode: 'explore' } }));
  const run = (args: string[], event?: unknown) => JSON.parse(execFileSync(process.execPath,
    [process.env.LYO_TEST_NATIVE_CLI ?? 'src/cli.ts', ...args], { cwd: ROOT, env: { ...process.env, LYO_CONFIG_FILE: config },
      input: JSON.stringify(event ?? {}), encoding: 'utf8' }));
  const hook = (runtime: 'codex' | 'claude', event: Record<string, unknown>) => run(
    [`${runtime}-hook`, '--db-from-event-cwd', '--spool-dir-from-event-cwd'],
    { cwd, session_id: 'session-1', ...event });
  return { dir, cwd, db, config, run, hook, status: () => run(['control', 'status', '--db', db]),
    close: () => rmSync(dir, { recursive: true, force: true }) };
}

test('Codex hooks deliver a recovery decision and attach the later measurement in the central ledger', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'rtk npm test' } };
    f.hook('codex', { hook_event_name: 'UserPromptSubmit', prompt: 'Fix the test' });
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failed' });
    const output = f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'failed',
      tool_response: { exit_code: 1, output: 'private output' } });
    const pending = f.status();
    assert.equal(pending.pending, 1);
    const { decision } = pending.recent[0];
    assert.equal(decision.propensity, 0.5);
    if (decision.action === 'recovery-reminder') assert.match(output.hookSpecificOutput.additionalContext, /LYO recovery experiment/);
    else assert.equal(output.hookSpecificOutput, undefined);
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'retry' });
    f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'retry', tool_response: { exit_code: 0 } });
    f.hook('codex', { hook_event_name: 'Stop' });
    const measured = f.status();
    assert.equal(measured.decisions, 1);
    assert.equal(measured.measured, 1);
    assert.equal(measured.pending, 0);
    assert.equal(measured.recent[0].feedback[0].reward, 1);
    assert.equal(JSON.stringify(measured).includes('private output'), false);
  } finally { f.close(); }
});

test('Kimi remains captured without entering the native Claude experiment', () => {
  const f = fixture();
  try {
    f.hook('claude', { client_type: 'kimi_code_cli', hook_event_name: 'UserPromptSubmit', prompt: 'Fix the test' });
    const captured = f.run(['report', '--db', join(f.cwd, '.agent-learning', 'learning.sqlite')]);
    assert.equal(captured.hookEvents, 1);
    const { sessions, decisions } = f.status();
    assert.deepEqual({ sessions, decisions }, { sessions: 0, decisions: 0 });
  } finally { f.close(); }
});

test('Claude native Bash failure and foreground completion close the same loop without inventing exit codes', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'rtk proxy node --test probe.test.cjs' } };
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failure' });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUseFailure', tool_use_id: 'failure',
      error: 'Exit code 1\nassertion failed', is_interrupt: false });
    assert.equal(f.status().pending, 1);
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'retry' });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'retry',
      tool_response: { stdout: 'passed', stderr: '', interrupted: false, isImage: false } });
    f.hook('claude', { hook_event_name: 'Stop' });
    const result = f.status();
    assert.equal(result.measured, 1);
    assert.equal(result.recent[0].feedback[0].reward, 1);
    assert.equal(result.recent[0].decision.specification.domain, 'coding/native-recovery/claude');
  } finally { f.close(); }
});

test('a measured outcome exposes its observation, turn boundary, and actual measurement basis', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (const [id, exit] of [['failure', 1], ['retry', 0]] as const) {
      f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
      f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: id, tool_response: { exit_code: exit } });
    }
    f.hook('codex', { hook_event_name: 'Stop' });
    const episode = f.status().recent[0];
    assert.equal(episode.observation.measurement.exitCode, 1);
    assert.equal(episode.feedback[0].evidence.name, 'Stop');
    assert.equal(episode.feedback[0].evidence.result.measurement.exitCode, 0);
    assert.equal(episode.feedback[0].evidence.result.measurement.basis, 'numeric-exit-status');
  } finally { f.close(); }
});

test('an unfinished retry remains unknown at Stop and does not train a failure', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failure' });
    f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'failure', tool_response: { exit_code: 1 } });
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'unfinished' });
    f.hook('codex', { hook_event_name: 'Stop' });
    assert.equal(f.status().unknown, 1);
    assert.equal(f.status().measured, 0);
    assert.equal(f.status().recent[0].feedback[0].reward, null);
  } finally { f.close(); }
});

test('a completed retry cannot hide another retry that is still running at Stop', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failure' });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'failure', tool_response: { exit_code: 1 } });
    for (const id of ['retry-a', 'retry-b'])
      f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'retry-a', tool_response: { exit_code: 0 } });
    f.hook('claude', { hook_event_name: 'Stop' });
    assert.equal(f.status().measured, 0);
    assert.equal(f.status().recent[0].feedback[0].reward, null);
  } finally { f.close(); }
});

test('repeating a prompt callback with the same turn ID preserves the recovery episode', () => {
  const f = fixture();
  try {
    const prompt = { hook_event_name: 'UserPromptSubmit', turn_id: 'turn-a', prompt: 'Fix test' };
    const call = { turn_id: 'turn-a', tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (const [id, exit] of [['failure', 1], ['retry', 0]] as const) {
      f.hook('claude', prompt);
      f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
      f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: id, tool_response: { exit_code: exit } });
    }
    f.hook('claude', { hook_event_name: 'Stop', turn_id: 'turn-a' });
    assert.equal(f.status().decisions, 1);
    assert.equal(f.status().recent[0].feedback[0].reward, 1);
  } finally { f.close(); }
});

test('a late result from an earlier turn cannot interrupt or start a current recovery episode', () => {
  for (const withTurnId of [true, false]) {
    const f = fixture();
    try {
      const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
      const old = withTurnId ? { turn_id: 'old' } : {};
      const current = withTurnId ? { turn_id: 'current' } : {};
      f.hook('claude', { ...old, hook_event_name: 'UserPromptSubmit', prompt: 'First task' });
      f.hook('claude', { ...old, ...call, hook_event_name: 'PreToolUse', tool_use_id: 'old-check' });
      f.hook('claude', { ...current, hook_event_name: 'UserPromptSubmit', prompt: 'Next task' });
      f.hook('claude', { ...old, ...call, hook_event_name: 'PostToolUse', tool_use_id: 'old-check', tool_response: { exit_code: 1 } });
      assert.equal(f.status().decisions, 0);
      for (const [id, exit] of [['failure', 1], ['retry', 0]] as const) {
        f.hook('claude', { ...current, ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
        f.hook('claude', { ...current, ...call, hook_event_name: 'PostToolUse', tool_use_id: id, tool_response: { exit_code: exit } });
        f.hook('claude', { ...old, ...call, hook_event_name: 'PostToolUse', tool_use_id: 'old-check', tool_response: { exit_code: 1 } });
      }
      f.hook('claude', { ...current, hook_event_name: 'Stop' });
      assert.equal(f.status().decisions, 1);
      assert.equal(f.status().recent[0].feedback[0].reward, 1);
    } finally { f.close(); }
  }
});

test('a check in another working directory cannot erase recovery or leave this episode pending', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (const [id, exit] of [['failure', 1], ['retry', 0]] as const) {
      f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
      f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: id, tool_response: { exit_code: exit } });
    }
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'other-directory',
      tool_input: { command: 'npm test', cwd: 'unrelated' } });
    f.hook('claude', { hook_event_name: 'Stop' });
    assert.equal(f.status().recent[0].feedback[0].reward, 1);
  } finally { f.close(); }
});

test('Codex stdout-only hooks learn from the real command receipt while preserving output and exit status', () => {
  const f = fixture();
  try {
    writeFileSync(join(f.cwd, 'package.json'), JSON.stringify({ scripts: { test: 'node check.cjs' } }));
    writeFileSync(join(f.cwd, 'check.cjs'), "console.log('same output'); process.exit(require('node:fs').existsSync('ready') ? 0 : 1);\n");
    const input = { command: 'npm test --silent' };
    for (const [id, exit] of [['failed', 1], ['retry', 0]] as const) {
      if (exit === 0) writeFileSync(join(f.cwd, 'ready'), '');
      const pre = f.hook('codex', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: id, tool_input: input });
      assert.equal(pre.hookSpecificOutput.permissionDecision, 'allow');
      const updated = pre.hookSpecificOutput.updatedInput;
      const result = spawnSync('/bin/sh', ['-c', updated.command], { cwd: f.cwd, encoding: 'utf8' });
      assert.equal(result.status, exit, result.stderr);
      assert.equal(result.stdout, 'same output\n');
      f.hook('codex', { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: id,
        tool_input: updated, tool_response: result.stdout });
    }
    f.hook('codex', { hook_event_name: 'Stop' });
    const episode = f.status().recent[0];
    assert.equal(episode.observation.measurement.exitCode, 1);
    assert.equal(episode.feedback[0].reward, 1);
    assert.equal(episode.feedback[0].evidence.result.measurement.basis, 'command-receipt');
  } finally { f.close(); }
});

test('the Codex measurement wrapper preserves the actual tool working directory', () => {
  const f = fixture();
  try {
    const child = join(f.cwd, 'child');
    mkdirSync(child);
    writeFileSync(join(child, 'package.json'), JSON.stringify({ scripts: { test: 'node check.cjs' } }));
    writeFileSync(join(child, 'check.cjs'), "console.log('child directory'); process.exit(1);\n");
    const pre = f.hook('codex', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'child',
      tool_input: { command: 'npm test --silent' } });
    const result = spawnSync('/bin/sh', ['-c', pre.hookSpecificOutput.updatedInput.command], { cwd: child, encoding: 'utf8' });
    assert.equal(result.stdout, 'child directory\n');
    assert.equal(result.status, 1);
    f.hook('codex', { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'child',
      tool_input: pre.hookSpecificOutput.updatedInput, tool_response: result.stdout });
    assert.equal(f.status().recent[0].observation.workdir, child);
  } finally { f.close(); }
});

test('duplicate callbacks count once and a check begun before the intervention cannot earn recovery credit', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'already-running' });
    f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failure' });
    const failed = { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'failure', tool_response: { exit_code: 1 } };
    const first = f.hook('codex', failed);
    assert.deepEqual(f.hook('codex', failed), first);
    f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'already-running', tool_response: { exit_code: 0 } });
    f.hook('codex', { hook_event_name: 'Stop' });
    f.hook('codex', { hook_event_name: 'Stop' });
    const result = f.status();
    assert.equal(result.decisions, 1);
    assert.equal(result.measured, 1);
    assert.equal(result.recent[0].feedback[0].reward, 0);
  } finally { f.close(); }
});

test('later repositories see prior measured evidence while an interrupted turn stays unknown', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (const [id, exit] of [['failure', 1], ['retry', 0]] as const) {
      f.hook('codex', { ...call, hook_event_name: 'PreToolUse', tool_use_id: id });
      f.hook('codex', { ...call, hook_event_name: 'PostToolUse', tool_use_id: id, tool_response: { exit_code: exit } });
    }
    f.hook('codex', { hook_event_name: 'Stop' });
    const next = join(f.dir, 'work', 'next-ticket');
    mkdirSync(next);
    f.hook('codex', { ...call, cwd: next, hook_event_name: 'PreToolUse', tool_use_id: 'new-failure' });
    f.hook('codex', { ...call, cwd: next, hook_event_name: 'PostToolUse', tool_use_id: 'new-failure', tool_response: { exit_code: 1 } });
    const { decision } = f.status().recent[0];
    assert.ok(decision.revision > 0);
    assert.equal(decision.estimates.reduce((sum, row) => sum + row.count, 0), 1);
    f.hook('codex', { cwd: next, hook_event_name: 'SessionEnd' });
    assert.equal(f.status().unknown, 1);
    assert.equal(f.status().measured, 1);
  } finally { f.close(); }
});

test('background results, output text, and unsupported compound commands are not treated as verified recovery', () => {
  const f = fixture();
  try {
    const call = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
    for (const command of ['npm test && touch done', 'npm test | cat', 'npm test > result.txt']) {
      const pre = f.hook('codex', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: command, tool_input: { command } });
      assert.equal(pre.hookSpecificOutput, undefined);
    }
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'failure' });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUseFailure', tool_use_id: 'failure', error: 'Exit code 1\nfailed' });
    f.hook('claude', { ...call, hook_event_name: 'PreToolUse', tool_use_id: 'background' });
    f.hook('claude', { ...call, hook_event_name: 'PostToolUse', tool_use_id: 'background',
      tool_response: { stdout: 'Exit code 0', stderr: '', interrupted: false, backgroundTaskId: 'running' } });
    f.hook('claude', { hook_event_name: 'Stop' });
    assert.equal(f.status().unknown, 1);
    assert.equal(f.status().measured, 0);
  } finally { f.close(); }
});

test('the measurement adapter refuses a workspace state symlink before creating receipt directories outside it', () => {
  const f = fixture();
  try {
    const outside = join(f.dir, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(f.cwd, '.agent-learning'));
    const pre = f.hook('codex', { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_use_id: 'symlink',
      tool_input: { command: 'npm test' } });
    assert.equal(pre.hookSpecificOutput, undefined);
    assert.equal(existsSync(join(outside, 'control-receipts')), false);
  } finally { f.close(); }
});
