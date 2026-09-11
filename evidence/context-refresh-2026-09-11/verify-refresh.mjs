import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const packageRoot = dirname(dirname(realpathSync(join(dirname(process.execPath), 'lyo'))));
const { LessonStore } = await import(pathToFileURL(join(packageRoot, 'src/lyo/storage/lesson-store.js')));
const version = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
assert.equal(version, '0.4.3-adaptive.8');
const hash = text => createHash('sha256').update(text).digest('hex');
const results = [];
for (const host of ['codex', 'claude']) {
  const config = readFileSync(join(homedir(), host === 'codex' ? '.codex/hooks.json' : '.claude/settings.json'), 'utf8');
  const hooks = JSON.parse(config).hooks;
  const command = event => hooks[event].flatMap(group => group.hooks)
    .find(hook => hook.command?.includes('/lyo-session-hook')).command;
  const cwd = realpathSync(mkdtempSync(join(tmpdir(), `lyo-refresh-${host}-`)));
  const storePath = join(cwd, 'lessons.db'), store = new LessonStore(storePath);
  try {
    const lesson = store.createLesson({ failure_class: 'output_generation', trigger_cue: 'fixture-only',
      intervention: 'Check this synthetic counterexample before accepting the flag.' });
    const session_id = `isolated-${host}-${cwd}`;
    const events = [
      { hook_event_name: 'SessionStart', source: 'startup' },
      { hook_event_name: 'UserPromptSubmit', turn_id: 'one', prompt: 'Check a flag.' },
      { hook_event_name: 'UserPromptSubmit', turn_id: 'two', prompt: 'Review the flag.' },
      { hook_event_name: 'SessionStart', source: 'compact' },
      { hook_event_name: 'SessionStart', source: 'compact' },
      { hook_event_name: 'SessionStart', source: 'resume' },
    ].map(event => {
      const start = performance.now();
      const output = execFileSync('/bin/sh', ['-c', command(event.hook_event_name)], {
        cwd, encoding: 'utf8', input: JSON.stringify({ ...event, cwd, session_id }),
        env: { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath, TMPDIR: cwd }, timeout: 5000,
      });
      assert.match(output, /LYO reasoning mandate/);
      assert.match(output, /Check this synthetic counterexample/);
      return { event: event.hook_event_name, source: event.source ?? null, elapsedMs: Math.round(performance.now() - start),
        mandate: true, lesson: true, outputHash: hash(output) };
    });
    assert.equal(store.getLesson(lesson.lesson_id).uses, 1);
    assert.equal(store.applyValidationOutcome({ run_id: session_id, outcome: 'passed' }).updated, 0);
    assert.equal(store.getLesson(lesson.lesson_id).helpful_count + store.getLesson(lesson.lesson_id).harmful_count, 0);
    results.push({ host, configHash: hash(config), command: command('SessionStart'), events,
      applicationCount: 1, helpful: 0, harmful: 0, runPassAwardsCredit: false });
  } finally { store.close(); rmSync(cwd, { recursive: true, force: true }); }
}
console.log(JSON.stringify({ version, packageRoot, checkedAt: new Date().toISOString(),
  actualHostDispatchObserved: false, realUsefulnessEstablished: false, results }, null, 2));
