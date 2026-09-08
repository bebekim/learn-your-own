import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

const ROOT = new URL('..', import.meta.url).pathname;

test('packed executables and generated hooks run the installed learning loop', async () => {
  execFileSync(process.execPath, ['scripts/pack-npm.mjs'], { cwd: ROOT, encoding: 'utf8' });
  const dir = mkdtempSync(join(tmpdir(), 'lyo-package-'));
  const staging = join(ROOT, 'dist/npm/package');
  const manifest = JSON.parse(readFileSync(join(staging, 'package.json'), 'utf8'));
  const sourceManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const storePath = join(dir, '.zeroshot/lyo-lessons.db');
  mkdirSync(join(dir, '.zeroshot'));
  const store = new LessonStore(storePath);
  store.createLesson({ failure_class: 'output_generation', trigger_cue: 'tests failed',
    explanation: 'tests failed', intervention: 'Run the narrow test before reporting done.' });
  const env = { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath, TMPDIR: dir };
  const run = (bin: string, args: string[], event?: unknown) => execFileSync(process.execPath,
    [join(dir, bin), ...args], { cwd: dir, env, encoding: 'utf8', input: JSON.stringify(event ?? {}) });
  try {
    assert.deepEqual(Object.keys(manifest.bin).sort(), Object.keys(sourceManifest.bin).sort());
    for (const [name, target] of Object.entries(manifest.bin)) {
      const executable = join(staging, target as string);
      assert.ok(statSync(executable).mode & 0o111, `${name} is executable`);
      symlinkSync(executable, join(dir, name));
      if (name !== 'lyo-session-hook') assert.equal(JSON.parse(run(name, ['report', '--db', ':memory:'])).ok, true);
    }
    assert.match(run('lyo-session-hook', [], { cwd: dir, session_id: 'codex-package' }), /Run the narrow test/);
    assert.equal(run('lyo-session-hook', [], { cwd: dir, session_id: 'codex-package' }), '');
    assert.ok(store.getTrace('session-delivery:codex-package'));

    run('lyo', ['init', 'workspace']);
    const settings = JSON.parse(readFileSync(join(dir, 'workspace/.claude/settings.json'), 'utf8'));
    const command = settings.hooks.SessionStart[0].hooks[0].command;
    assert.ok(command.endsWith('/src/lyo/selection/session-hook.js'));
    assert.match(execFileSync('/bin/sh', ['-c', command], { cwd: dir, env, encoding: 'utf8',
      input: JSON.stringify({ cwd: dir, session_id: 'init-package' }) }), /Run the narrow test/);
    const { buildHookBlock } = await import('../dist/npm/package/src/cli/commands/wrap.js');
    assert.match(buildHookBlock(), /src\/cli\.js claude-hook/);
    assert.match(buildHookBlock(), /selection\/session-hook\.js/);
    assert.doesNotMatch(buildHookBlock(), /\.ts/);

    const flags = ['--db-from-event-cwd', '--spool-dir-from-event-cwd'];
    for (const hook_event_name of ['SessionStart', 'Stop', 'SessionEnd']) {
      run('lyo', ['codex-hook', ...flags], { cwd: dir, session_id: 'codex-package', hook_event_name });
      if (hook_event_name === 'Stop') {
        const db = new DatabaseSync(join(dir, '.agent-learning/learning.sqlite'));
        assert.equal(db.prepare('select ended_at from agent_sessions where session_id = ?').get('codex-package')?.ended_at, null);
        db.close();
      }
    }

    const eca = { cwd: dir, session_id: 'cache', chat_id: 'chat1', full_model: 'local-mlxcel/Qwen3.5-4B-4bit' };
    const output = JSON.parse(run('lyo', ['eca-hook', ...flags], { ...eca, hook_type: 'chatStart' }));
    assert.match(output.additionalContext, /Run the narrow test/);
    assert.deepEqual(JSON.parse(run('lyo', ['eca-hook', ...flags], { ...eca, hook_type: 'preRequest', prompt: 'Check tests' })), {});
    for (const exit of [1, 0]) run('lyo', ['eca-hook', ...flags], { ...eca, hook_type: 'postToolCall',
      tool_name: 'shell_command', server: 'eca', tool_call_id: `tool-${exit}`, tool_input: { command: 'npm test' },
      tool_response: `Exit code: ${exit}\nStdout:\nprivate tool output`, error: exit !== 0 });
    run('lyo', ['eca-hook', ...flags], { ...eca, hook_type: 'postRequest', response: 'Finished' });
    const db = new DatabaseSync(join(dir, '.agent-learning/learning.sqlite'));
    try {
      assert.ok(db.prepare('select ended_at from agent_sessions where session_id = ?').get('codex-package')?.ended_at);
      assert.equal(db.prepare("select ended_at from agent_sessions where platform = 'eca'").get()?.ended_at, null);
      run('lyo', ['eca-hook', ...flags], { ...eca, hook_type: 'chatEnd' });
      assert.ok(db.prepare("select ended_at from agent_sessions where platform = 'eca'").get()?.ended_at);
      const rows = db.prepare("select payload_json, lyo_version from hook_events where event_name in ('tool.after', 'tool.failure')").all();
      assert.deepEqual(rows.map(r => JSON.parse(String(r.payload_json)).tool_response.exit_code).sort(), [0, 1]);
      assert.ok(rows.every(r => r.lyo_version === manifest.version));
      assert.ok(rows.every(r => !String(r.payload_json).includes('private tool output')));
      assert.equal(db.prepare("select count(*) as n from learning_traces where trace_id like 'session-outcome:%'").get()?.n, 2);
    } finally { db.close(); }
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
