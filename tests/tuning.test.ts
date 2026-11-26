import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_TUNING, loadTuning } from '../src/lyo/config/tuning.ts';
import { applySuggestions, hostHookTimeouts, pendingTuneNotice, suggestTuning, tune, type Diagnostics } from '../src/lyo/config/diagnostics.ts';
import { decisionConfigSchema } from '../src/lyo/decisions/providers.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

const home = () => mkdtempSync(join(tmpdir(), 'lyo-tune-home-'));
const timing = (p90Ms: number) => ({ samples: 5, p50Ms: p90Ms, p90Ms, maxMs: p90Ms });
const diagnostics = (over: Partial<Diagnostics> = {}): Diagnostics => ({ measuredAt: 'now',
  machine: { platform: 'darwin', arch: 'arm64', node: 'v24', cpus: 8, totalMemGb: 16, freeMemGb: 4, load1: 2 },
  nodeStart: timing(60), git: timing(15), sqliteCommit: timing(1), provider: { skipped: 'quick mode' }, hostHooks: [], ...over });
const paths = { config: '/h/config.json', decisions: '/h/decisions.json' };

test('tuning comes from config with defaults; an invalid section falls back without failing', () => {
  const h = home();
  assert.deepEqual(loadTuning({ LYO_HOME: h }), DEFAULT_TUNING);
  writeFileSync(join(h, 'config.json'), JSON.stringify({ tuning: { hooks: { checkSeconds: 4 }, sqlite: { busyTimeoutMs: 9000 } } }));
  const t = loadTuning({ LYO_HOME: h });
  assert.equal(t.hooks.checkSeconds, 4);
  assert.equal(t.hooks.stdinGuardMs, DEFAULT_TUNING.hooks.stdinGuardMs);
  assert.equal(t.sqlite.busyTimeoutMs, 9000);
  const bad = home();
  writeFileSync(join(bad, 'config.json'), JSON.stringify({ tuning: { hooks: { checkSeconds: 'slow' } } }));
  assert.deepEqual(loadTuning({ LYO_HOME: bad }), DEFAULT_TUNING);
});

test('the lesson store takes its busy timeout from tuning', () => {
  const t = loadTuning(); // the isolated test home
  const store = new LessonStore(join(home(), 'lessons.db'));
  try { assert.equal((store.db.prepare('PRAGMA busy_timeout').get() as { timeout: number }).timeout, t.sqlite.busyTimeoutMs); }
  finally { store.close(); }
});

test('a fast machine keeps the defaults; a slow one gets larger budgets with the measurement as reason', () => {
  assert.deepEqual(suggestTuning(diagnostics(), DEFAULT_TUNING, null, paths), []);
  const slow = suggestTuning(diagnostics({ nodeStart: timing(600), git: timing(400), sqliteCommit: timing(40) }), DEFAULT_TUNING, null, paths);
  const by = Object.fromEntries(slow.map(s => [s.key, s]));
  assert.equal(by['tuning.hooks.checkSeconds']!.suggested, 5.5); // 8 x 0.6 s + 0.5, rounded up to 0.5
  assert.match(by['tuning.hooks.checkSeconds']!.reason, /p90 start-up 600 ms/);
  assert.equal(by['tuning.git.timeoutMs']!.suggested, 4000);
  assert.equal(by['tuning.sqlite.busyTimeoutMs']!.suggested, 20000);
  assert.ok(slow.every(s => s.file === paths.config && s.applies));
});

test('decision and host-hook suggestions follow the measured provider and memory; host files are advice only', () => {
  const decisions = decisionConfigSchema.parse({ provider: 'mlxcel' });
  const s = suggestTuning(diagnostics({ provider: { name: 'mlxcel', model: 'm', coldMs: 25000, warmMs: 3000 },
    hostHooks: [{ file: '/h/.claude/settings.json', event: 'PostToolUse', timeoutSeconds: 5, kind: 'capture' },
      { file: '/h/.claude/settings.json', event: 'SessionStart', timeoutSeconds: 5, kind: 'session' }] }), DEFAULT_TUNING, decisions, paths);
  const by = Object.fromEntries(s.map(x => [x.key, x]));
  assert.equal(by['worker.timeoutMs']!.suggested, 75000);
  assert.equal(by['worker.idleSeconds']!.suggested, 120);
  assert.equal(by['hooks.PostToolUse.timeout']!.suggested, 8);
  assert.equal(by['hooks.PostToolUse.timeout']!.applies, false);
  assert.equal(by['hooks.SessionStart.timeout'], undefined, 'the session hook runs no evaluator checks');
  // A fast cached model never lowers the decision timeout below the default or the current value.
  const fast = suggestTuning(diagnostics({ provider: { name: 'mlxcel', model: 'm', coldMs: 1900, warmMs: 1400 } }), DEFAULT_TUNING, decisions, paths);
  assert.equal(fast.find(x => x.key === 'worker.timeoutMs'), undefined);
});

test('apply writes only LYO files, backs them up, and keeps other keys', () => {
  const h = home(), file = join(h, 'config.json');
  writeFileSync(file, JSON.stringify({ rootDir: '/r', corpusPath: '/c', tuning: { git: { timeoutMs: 1000 } } }));
  const host = join(h, 'settings.json');
  const written = applySuggestions([
    { file, key: 'tuning.git.timeoutMs', current: 1000, suggested: 3000, reason: 'r', applies: true },
    { file: host, key: 'hooks.Stop.timeout', current: 5, suggested: 8, reason: 'r', applies: false },
  ], [file, host]);
  assert.deepEqual(written, [file]);
  const after = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(after.tuning.git.timeoutMs, 3000);
  assert.equal(after.rootDir, '/r');
  assert.ok(readdirSync(h).some(f => f.startsWith('config.json.bak-')));
  assert.equal(existsSync(host), false);
});

test('host hook timeouts are read from lyo entries only', () => {
  const h = home(), file = join(h, 'settings.json');
  writeFileSync(file, JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: '/n/node /n/lyo claude-hook', timeout: 10 }] }],
    SessionStart: [{ hooks: [{ type: 'command', command: '/n/node /n/lyo-session-hook --json', timeout: 5 }] }],
    Stop: [{ hooks: [{ type: 'command', command: 'other-tool', timeout: 3 }] }] } }));
  assert.deepEqual(hostHookTimeouts([file]), [{ file, event: 'PostToolUse', timeoutSeconds: 10, kind: 'capture' },
    { file, event: 'SessionStart', timeoutSeconds: 5, kind: 'session' }]);
});

test('tune measures this machine, saves a report, and an install-time report leaves a notice until reviewed', async () => {
  const h = home(), env = { LYO_HOME: h };
  assert.match(pendingTuneNotice(env)!, /not measured this machine yet/); // npm may have blocked the install script
  const report = await tune({ env, quick: true, fromInstall: true });
  assert.ok(report.diagnostics.nodeStart.samples === 5 && report.diagnostics.sqliteCommit.samples === 30);
  assert.equal(existsSync(join(h, 'tune-report.json')), true);
  assert.equal(existsSync(join(h, 'config.json')), false, 'an install never writes settings');
  if (report.suggestions.length) assert.match(pendingTuneNotice(env)!, /lyo tune/);
  await tune({ env, quick: true });
  assert.equal(pendingTuneNotice(env), null);
});
