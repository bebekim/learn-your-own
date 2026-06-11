import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ROOT,
  runLyo,
  runLyoJson,
} from './helpers/cli.js';

test('lyo init creates a SQLite ledger at the requested path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const parsed = runLyoJson(['init', '--db', dbPath]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dbPath, dbPath);
    assert.equal(existsSync(dbPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo demo fixture-replay shows rejected first promotion and positive credit', () => {
  const parsed = runLyoJson(['demo', 'fixture-replay', '--db', ':memory:']);
  assert.equal(parsed.ok, true);
  assert.match(parsed.firstPromotionError, /requires at least 2 evidence items/);
  assert.equal(parsed.promoted.status, 'active');
  assert.equal(parsed.credit.adaptiveCredit, 20);
});

test('lyo help lists effect reports and audits', () => {
  const output = runLyo(['--help']);

  assert.match(
    output,
    /lyo report \[--db path\] \[--semantic \[--lower\] --run-id id\] \[--effects --run-id id\] \[--style --run-id id\] \[--at-bat --run-id id --task-context path\]/
  );
  assert.match(output, /lyo experiment \[--db path\] --family-id id --baseline-run-id id --treatment-run-id id/);
  assert.match(output, /lyo audit \[--dir path\]/);
  assert.match(output, /lyo learn style \[--db path\]/);
  assert.match(output, /lyo learn associations \[--dir path\] --dry-run/);
});


test('lyo experiment compares baseline, treatment, and variant attempts from a ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cybernetic-experiment-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const seed = `
      import {
        createKernel,
        initLedger,
        recordHookEvent
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      const sessionId = 'experiment-cli-session';
      const cwd = process.cwd();
      function prompt(eventId, turnId) {
        recordHookEvent(kernel, {
          eventId,
          sessionId,
          turnId,
          eventName: 'UserPromptSubmit',
          cwd,
          payload: {
            hook_event_name: 'UserPromptSubmit',
            prompt: { sha256: eventId, length: 42 }
          }
        });
      }
      function patch(eventId, turnId, path) {
        recordHookEvent(kernel, {
          eventId,
          sessionId,
          turnId,
          eventName: 'PostToolUse',
          cwd,
          payload: {
            hook_event_name: 'PostToolUse',
            tool_name: 'apply_patch',
            tool_input: {
              patch: '*** Begin Patch\\n*** Update File: ' + path + '\\n@@\\n-old\\n+new\\n*** End Patch'
            },
            tool_response: { exit_code: 0 }
          }
        });
      }
      function command(eventId, turnId, commandText) {
        recordHookEvent(kernel, {
          eventId,
          sessionId,
          turnId,
          eventName: 'PostToolUse',
          cwd,
          payload: {
            hook_event_name: 'PostToolUse',
            tool_name: 'Bash',
            tool_input: { command: commandText },
            tool_response: { exit_code: 0, stdout: 'ok' }
          }
        });
      }

      prompt('experiment-cli-a0-01-prompt', 'experiment-cli-a0');
      patch('experiment-cli-a0-02-edit', 'experiment-cli-a0', 'src/compiler/tokenizer.ts');

      prompt('experiment-cli-a1-01-prompt', 'experiment-cli-a1');
      patch('experiment-cli-a1-02-edit', 'experiment-cli-a1', 'src/compiler/tokenizer.ts');
      command('experiment-cli-a1-03-verifier', 'experiment-cli-a1', 'node --test tests/compiler-frontend.test.js');

      prompt('experiment-cli-a2-01-prompt', 'experiment-cli-a2');
      patch('experiment-cli-a2-02-edit', 'experiment-cli-a2', 'src/compiler/workflow-style.ts');
      command('experiment-cli-a2-03-verifier', 'experiment-cli-a2', 'node --test tests/compiler-frontend.test.js');
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'experiment',
        '--db',
        dbPath,
        '--family-id',
        'lyo-compiler-classifier-v1',
        '--baseline-run-id',
        'experiment-cli-a0',
        '--treatment-run-id',
        'experiment-cli-a1',
        '--variant-run-id',
        'experiment-cli-a2',
        '--artifact',
        'verifier:compiler-frontend',
        '--association-edge',
        'src/compiler/** -> tests/compiler-frontend.test.js',
        '--next-experiment',
        'try another compiler module variant',
      ]);
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.experiment.experimentVersion, 'lyo/cybernetic-learning-experiment/v1');
    assert.equal(parsed.experiment.familyId, 'lyo-compiler-classifier-v1');
    assert.equal(parsed.experiment.attempts[0].stoppedAfterEditWithoutVerification, true);
    assert.equal(parsed.experiment.attempts[1].verifiedCompletion, true);
    assert.equal(parsed.experiment.attempts[2].verifiedCompletion, true);
    assert.equal(parsed.experiment.associationHypotheses[0].credibility, 'credible');
    assert.deepEqual(
      parsed.experiment.evidenceEvents.map((event) => event.credibilityEffect),
      ['supports', 'supports']
    );
    assert.deepEqual(
      parsed.experiment.evidenceEvents.map((event) => event.polyaPattern),
      ['verifying_consequence', 'successive_varied_consequence']
    );
    assert.equal(parsed.experiment.decision, 'generalize_candidate');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
