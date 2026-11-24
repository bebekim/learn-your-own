import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { visibleHookContext } from '../src/lyo/hooks/context-visibility.ts';
import { hashValue } from '../src/lyo/contract/refs.ts';
import { LessonStore } from '../src/lyo/storage/lesson-store.ts';

const ROOT = new URL('..', import.meta.url).pathname;
const temporary = () => realpathSync(mkdtempSync(join(tmpdir(), 'lyo-visible-context-')));

test('user notice mirrors exact model-bound advice and retains event identity without user input', () => {
  const cwd = temporary();
  try {
    const text = 'Observed finding [finding:test] — future usefulness unvalidated.\nCheck A, then B.\n';
    const original = { systemMessage: 'Existing host warning.', hookSpecificOutput: {
      hookEventName: 'PreToolUse', additionalContext: text, permissionDecision: 'allow', updatedInput: { command: 'unchanged' } } };
    const event = { cwd, session_id: 'session', turn_id: 'turn', tool_use_id: 'call', hook_event_name: 'PreToolUse', prompt: 'private prompt', tool_input: { command: 'private command' } };
    const output = visibleHookContext(original, event, 'codex-hook');
    assert.deepEqual(output.hookSpecificOutput, original.hookSpecificOutput);
    assert.deepEqual(visibleHookContext(original, event, 'codex-hook'), output, 'duplicate callbacks preserve the output and receipt identity');
    assert.ok(output.systemMessage?.startsWith('Existing host warning.'));
    assert.ok(output.systemMessage?.endsWith(text));
    const directory = join(cwd, '.agent-learning/context-additions');
    assert.equal(readdirSync(directory).length, 1);
    const record = JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8'));
    assert.equal(record.text, text);
    assert.equal(record.textHash, hashValue(text));
    assert.equal(record.sessionId, 'session'); assert.equal(record.turnId, 'turn'); assert.equal(record.toolUseId, 'call');
    assert.match(record.observation, /display.*not established/);
    assert.doesNotMatch(JSON.stringify(record), /private prompt|private command/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('no context means no invented advice or record; storage failure preserves visible and model context', () => {
  const cwd = temporary(), outside = temporary();
  try {
    const empty = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
    assert.equal(visibleHookContext(empty, { cwd }, 'codex-hook'), empty);
    symlinkSync(outside, join(cwd, '.agent-learning'));
    const output = visibleHookContext({ hookSpecificOutput: { additionalContext: 'Real advice.' } }, { cwd }, 'codex-hook');
    assert.equal(output.hookSpecificOutput.additionalContext, 'Real advice.');
    assert.match(output.systemMessage!, /could not be saved/);
    assert.match(output.systemMessage!, /Real advice/);
    assert.deepEqual(readdirSync(outside), []);
  } finally { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('JSON session hooks expose selected lesson identity and candidate status on prompt and compaction', () => {
  const cwd = temporary(), storePath = join(cwd, 'lessons.db');
  const store = new LessonStore(storePath);
  const lesson = store.createLesson({ failure_class: 'output_generation', trigger_cue: 'test', intervention: 'Check the boundary before finishing.' })!;
  try {
    for (const event of [ { hook_event_name: 'UserPromptSubmit', turn_id: 'turn-1' },
      { hook_event_name: 'SessionStart', source: 'compact' } ]) {
      const output = JSON.parse(execFileSync(process.execPath, ['src/lyo/selection/session-hook.ts', '--json'], {
        cwd: ROOT, encoding: 'utf8', input: JSON.stringify({ ...event, cwd, session_id: 'session' }),
        env: { ...process.env, ZEROSHOT_LYO_STORE_PATH: storePath, LYO_SESSION_UNVALIDATED_LESSONS: '1' } }));
      const context = output.hookSpecificOutput.additionalContext;
      assert.ok(context.includes(lesson.lesson_id)); assert.match(context, /candidate/);
      assert.ok(output.systemMessage.endsWith(context));
      assert.match(output.systemMessage, /Delivery is not evidence/);
    }
    assert.equal(readdirSync(join(cwd, '.agent-learning/context-additions')).length, 2);
    assert.equal(store.getLesson(lesson.lesson_id)!.helpful_count, 0);
  } finally { store.close(); rmSync(cwd, { recursive: true, force: true }); }
});
