import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';
import { discoverAgentLearningLedgers } from '../src/compiler/ledger-discovery.ts';

test('a worktree or directory connects on open and all managed agent hooks reach the central corpus', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-connected-workspace-')));
  const rootDir = join(dir, 'work');
  const repo = join(rootDir, 'repo');
  const corpusPath = join(dir, 'central/corpus.sqlite');
  const configFile = join(dir, 'config.json');
  const lessonPath = join(dir, 'lessons.db');
  new LessonStore(lessonPath).close();
  mkdirSync(repo, { recursive: true });
  writeFileSync(configFile, JSON.stringify({ rootDir, corpusPath }));
  const env = { ...process.env, LYO_CONFIG_FILE: configFile, ZEROSHOT_LYO_STORE_PATH: lessonPath };
  const cli = new URL('../src/cli.ts', import.meta.url).pathname;
  const run = (args: string[], cwd = repo, payload: unknown = {}) => JSON.parse(execFileSync(process.execPath,
    [cli, ...args], { cwd, env, input: JSON.stringify(payload), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }));
  try {
    execFileSync('git', ['init', '-q', repo]);
    execFileSync('git', ['-c', 'user.name=Lyo test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'seed', '--allow-empty'], { cwd: repo });
    const worktree = join(rootDir, "worktree's $(literal)");
    const added = run(['worktree', 'add', worktree, '--branch', 'feat/probe']);
    assert.equal(added.connection.connected, true);
    assert.ok(existsSync(join(worktree, '.git')));
    mkdirSync(join(worktree, 'src'));
    assert.equal(run(['connect', '--path', join(worktree, 'src')]).workspaceRoot, worktree);
    assert.equal(existsSync(join(worktree, 'src/.agent-learning')), false);

    const directory = join(rootDir, 'ordinary-directory');
    mkdirSync(directory);
    assert.equal(run(['connect', '--path', directory]).connected, true);
    const flags = ['--db-from-event-cwd', '--spool-dir-from-event-cwd'];
    for (const host of ['codex', 'claude', 'bob', 'eca']) {
      const payload = host === 'eca' ? { cwd: directory, hook_type: 'chatStart', session_id: 'cache', chat_id: 'eca-session' }
        : { cwd: directory, hook_event_name: 'SessionStart', session_id: host + '-session' };
      run([host + '-hook', ...flags], directory, payload);
    }
    const db = new DatabaseSync(corpusPath, { readOnly: true });
    try {
      assert.equal(db.prepare('select count(*) n from sync_ledgers').get()!.n, 2);
      assert.equal(db.prepare('select count(*) n from corpus_events').get()!.n, 4);
      // Simulate a tool result followed by process interruption: the retry drains it.
      run(['codex-hook', ...flags], directory, { cwd: directory, hook_event_name: 'PostToolUse', session_id: 'codex-session',
        tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { exit_code: 0 } });
      assert.equal(db.prepare('select count(*) n from corpus_events').get()!.n, 4);
      assert.equal(run(['sync', 'connected']).hookEvents, 1);
      assert.equal(db.prepare('select count(*) n from corpus_events').get()!.n, 5);
      assert.equal(run(['sync', 'connected']).hookEvents, 0);
    } finally { db.close(); }

    const outside = join(dir, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(rootDir, 'escape'));
    symlinkSync(rootDir, join(rootDir, 'cycle'));
    assert.equal(run(['connect', '--path', join(rootDir, 'escape')]).connected, false);
    assert.throws(() => run(['worktree', 'add', join(rootDir, 'escape/new-worktree'), '--branch', 'feat/escape']),
      error => /configured/.test(String((error as { stdout?: unknown }).stdout)));
    assert.equal(existsSync(join(outside, 'new-worktree')), false);
    assert.equal(existsSync(join(outside, '.agent-learning')), false);
    assert.equal(discoverAgentLearningLedgers(rootDir).length, 2);

    const blocked = join(dir, 'central-is-directory');
    mkdirSync(blocked);
    writeFileSync(configFile, JSON.stringify({ rootDir, corpusPath: blocked }));
    const newDirectory = join(rootDir, 'retry-registration');
    mkdirSync(newDirectory);
    run(['bob-hook', ...flags], newDirectory, { cwd: newDirectory, event: 'SessionStart', session_id: 'retry-session' });
    assert.ok(existsSync(join(newDirectory, '.agent-learning/learning.sqlite')));
    writeFileSync(configFile, JSON.stringify({ rootDir, corpusPath }));
    assert.equal(run(['sync', 'connected', '--discover']).hookEvents, 1);
    const recovered = new DatabaseSync(corpusPath, { readOnly: true });
    try { assert.equal(recovered.prepare("select count(*) n from corpus_events where session_id='retry-session'").get()!.n, 1); }
    finally { recovered.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
