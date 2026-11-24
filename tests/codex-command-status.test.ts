import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { codexCommandStatusEvent, codexCommandStatusRewrite } from '../src/lyo/hooks/codex-command-status.ts';
import { codexHookObservation } from '../src/lyo/hooks/adapters/codex.ts';
import { extractHookFacts } from '../src/lyo/hooks/normalizer.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { runLyoJson } from './helpers/cli.js';

function fixture() {
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-command-status-')));
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ scripts: { typecheck: 'node check.cjs' } }));
  writeFileSync(join(cwd, 'check.cjs'), "console.log('same output');process.exit(Number(process.env.CHECK_EXIT || 0));");
  const event = { cwd, session_id: 'session', turn_id: 'turn', tool_use_id: 'call', tool_name: 'Bash',
    tool_input: { command: 'npm run typecheck --silent' } };
  const post = () => {
    const rewrite = codexCommandStatusRewrite({ ...event, hook_event_name: 'PreToolUse' })!;
    return { ...event, hook_event_name: 'PostToolUse', tool_input: rewrite.updatedInput, tool_response: 'same output\n' };
  };
  const receiptPath = () => join(cwd, '.agent-learning/command-receipts', readdirSync(join(cwd, '.agent-learning/command-receipts')).find(n => !n.includes('binding'))!);
  return { cwd, event, post, receiptPath, close: () => rmSync(cwd, { recursive: true, force: true }) };
}

for (const exit of [0, 7]) test(`a real foreground command retains exit ${exit} and output without trusting stdout`, () => {
  const f = fixture();
  try {
    const post = f.post();
    const result = spawnSync('/bin/sh', ['-c', String(post.tool_input.command)], {
      cwd: f.cwd, encoding: 'utf8', env: { ...process.env, CHECK_EXIT: String(exit) } });
    assert.equal(result.status, exit, result.stderr);
    assert.equal(result.stdout, 'same output\n');
    const event = codexCommandStatusEvent(post);
    assert.deepEqual(event.tool_input, f.event.tool_input);
    assert.equal(event.command_status_receipt?.basis, 'command-receipt@1');
    const observation = codexHookObservation(event, { includeRawPrompt: false });
    const facts = extractHookFacts({ eventId: observation.hookEvent.eventId!, eventName: 'tool.after',
      sessionId: 'session', turnId: 'turn', cwd: f.cwd, payloadJson: JSON.stringify(observation.hookEvent.payload) });
    assert.equal(facts.commands[0].argv, f.event.tool_input.command);
    assert.equal(facts.commands[0].status, exit === 0 ? 'succeeded' : 'failed');
    assert.doesNotMatch(JSON.stringify(observation.hookEvent.payload), /same output/);
  } finally { f.close(); }
});

test('missing, malformed, mismatched, signalled and stale receipts cannot supply status', () => {
  const f = fixture();
  try {
    const post = f.post();
    assert.equal(codexCommandStatusEvent(post), post);
    spawnSync('/bin/sh', ['-c', String(post.tool_input.command)], { cwd: f.cwd });
    const path = f.receiptPath(), receipt = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(codexCommandStatusEvent(post).command_status_receipt);
    for (const patch of [{ id: 'wrong' }, { commandHash: 'wrong' }, { cwd: join(f.cwd, 'other') }, { exitCode: null }, { signal: 'SIGTERM' },
      { startedAt: '2000-01-01T00:00:00Z' }, { endedAt: '2999-01-01T00:00:00Z' }]) {
      writeFileSync(path, JSON.stringify({ ...receipt, ...patch }));
      assert.equal(codexCommandStatusEvent(post), post, JSON.stringify(patch));
    }
    writeFileSync(path, 'broken JSON');
    assert.equal(codexCommandStatusEvent(post), post);
    writeFileSync(path, JSON.stringify(receipt));
    for (const patch of [{ session_id: 'other' }, { turn_id: 'other' }, { tool_use_id: 'other' },
      { tool_input: { command: 'npm run build' } }, { is_interrupt: true }]) {
      const event = { ...post, ...patch };
      assert.equal(codexCommandStatusEvent(event), event);
    }
  } finally { f.close(); }
});

test('shell programs, background calls and non-verifiers are not rewritten; retries preserve identity', () => {
  const f = fixture();
  try {
    for (const command of ['true', 'exit 7', 'npm test | tail', 'npm test && true', 'npm test > out', 'npm test\ntrue', 'npm test $(pwd)'])
      assert.equal(codexCommandStatusRewrite({ ...f.event, hook_event_name: 'PreToolUse', tool_input: { command } }), null);
    assert.equal(codexCommandStatusRewrite({ ...f.event, hook_event_name: 'PreToolUse', tool_input: { command: 'npm test', run_in_background: true } }), null);
    const event = { ...f.event, hook_event_name: 'PreToolUse' };
    assert.deepEqual(codexCommandStatusRewrite(event), codexCommandStatusRewrite(event));
    assert.throws(() => codexCommandStatusRewrite({ ...event, tool_input: { command: 'npm test' } }), /Conflicting/);
  } finally { f.close(); }
});

test('a receipt directory symlink cannot move capture outside the workspace', () => {
  const f = fixture(), outside = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-command-outside-')));
  try {
    symlinkSync(outside, join(f.cwd, '.agent-learning'));
    assert.throws(() => f.post(), /escapes workspace/);
    assert.deepEqual(readdirSync(outside), []);
  } finally { f.close(); rmSync(outside, { recursive: true, force: true }); }
});

test('CLI capture is opt-in and spools the original verifier with its bound status', () => {
  const f = fixture();
  try {
    const storePath = join(f.cwd, 'lessons.sqlite');
    new LessonStore(storePath).close();
    const env = { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath, LYO_CONFIG_FILE: join(f.cwd, 'no-config.json') };
    const hook = (event: unknown, enabled = true) => runLyoJson(['codex-hook', '--db-from-event-cwd', '--spool-dir-from-event-cwd',
      ...(enabled ? ['--capture-command-status'] : [])], { input: JSON.stringify(event), env });
    hook({ cwd: f.cwd, session_id: 'session', hook_event_name: 'SessionStart' });
    const pre = { ...f.event, hook_event_name: 'PreToolUse' };
    assert.equal(hook(pre, false).hookSpecificOutput?.updatedInput, undefined);
    const updated = hook(pre).hookSpecificOutput.updatedInput;
    const result = spawnSync('/bin/sh', ['-c', updated.command], { cwd: f.cwd, encoding: 'utf8', env: { ...process.env, CHECK_EXIT: '7' } });
    assert.equal(result.status, 7);
    hook({ ...f.event, hook_event_name: 'PostToolUse', tool_input: updated, tool_response: result.stdout });
    const directory = join(f.cwd, '.agent-learning/hook-spool/incoming');
    const events = readdirSync(directory).map(n => JSON.parse(readFileSync(join(directory, n), 'utf8')));
    const payload = events.find(e => e.hookEvent.eventName === 'tool.after').hookEvent.payload;
    assert.equal(payload.tool_input.command, f.event.tool_input.command);
    assert.equal(payload.tool_response.exit_code, 7);
    assert.equal(payload.command_status_receipt.basis, 'command-receipt@1');
    const retry = { ...f.event, tool_use_id: 'retry' };
    const retryInput = hook({ ...retry, hook_event_name: 'PreToolUse' }).hookSpecificOutput.updatedInput;
    const recovered = spawnSync('/bin/sh', ['-c', retryInput.command], { cwd: f.cwd, encoding: 'utf8', env: { ...process.env, CHECK_EXIT: '0' } });
    assert.equal(recovered.status, 0);
    hook({ ...retry, hook_event_name: 'PostToolUse', tool_input: retryInput, tool_response: recovered.stdout });
    hook({ cwd: f.cwd, session_id: 'session', hook_event_name: 'SessionEnd' });
    const store = new LessonStore(storePath);
    try {
      const lessons = store.db.prepare('SELECT explanation FROM lesson').all();
      assert.equal(lessons.length, 1);
      const observation = JSON.parse(String(lessons[0].explanation));
      assert.equal(observation.command, f.event.tool_input.command);
      assert.ok(observation.failureRef && observation.recoveryRef);
    } finally { store.close(); }
  } finally { f.close(); }
});
