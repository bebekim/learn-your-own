import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

test('lyo init creates a SQLite ledger at the requested path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'init', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dbPath, dbPath);
    assert.equal(existsSync(dbPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo demo fixture-replay shows rejected first promotion and positive credit', () => {
  const output = execFileSync(
    process.execPath,
    ['src/cli.ts', 'demo', 'fixture-replay', '--db', ':memory:'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  const parsed = JSON.parse(output);
  assert.equal(parsed.ok, true);
  assert.match(parsed.firstPromotionError, /requires at least 2 evidence items/);
  assert.equal(parsed.promoted.status, 'active');
  assert.equal(parsed.credit.adaptiveCredit, 20);
});

test('lyo help lists effect reports and audits', () => {
  const output = execFileSync(
    process.execPath,
    ['src/cli.ts', '--help'],
    { cwd: ROOT, encoding: 'utf8' }
  );

  assert.match(
    output,
    /lyo report \[--db path\] \[--semantic \[--lower\] --run-id id\] \[--effects --run-id id\] \[--style --run-id id\] \[--at-bat --run-id id --task-context path\]/
  );
  assert.match(output, /lyo experiment \[--db path\] --family-id id --baseline-run-id id --treatment-run-id id/);
  assert.match(output, /lyo audit \[--dir path\]/);
  assert.match(output, /lyo learn style \[--db path\]/);
  assert.match(output, /lyo learn associations \[--dir path\] --dry-run/);
});

test('lyo codex-hook records a hook event and emits protocol overlay context', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-codex-hook-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const seed = `
      import {
        createKernel,
        initLedger,
        recordRun,
        recordGap,
        proposeProtocol,
        promoteProtocol
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      recordRun(kernel, {
        runId: 'run-1',
        taskShape: 'prompt-change',
        channel: 'function.vision.extraction',
        status: 'failed'
      });
      const gap1 = recordGap(kernel, {
        runId: 'run-1',
        kind: 'missing-fixture-replay',
        summary: 'Prompt changed without fixture replay.',
        evidenceRef: 'review:1',
        status: 'observed'
      });
      recordRun(kernel, {
        runId: 'run-2',
        taskShape: 'prompt-change',
        channel: 'function.vision.extraction',
        status: 'failed'
      });
      const gap2 = recordGap(kernel, {
        runId: 'run-2',
        kind: 'missing-fixture-replay',
        summary: 'Second prompt changed without fixture replay.',
        evidenceRef: 'review:2',
        status: 'observed'
      });
      proposeProtocol(kernel, {
        protocolId: 'fixture_replay_gate',
        title: 'Fixture replay gate',
        scopeKind: 'channel',
        scopeValue: 'function.vision.extraction',
        action: 'Run fixture replay before claiming extraction prompt success.'
      });
      promoteProtocol(kernel, {
        protocolId: 'fixture_replay_gate',
        evidenceIds: [gap1.gapId, gap2.gapId]
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const hookEvent = {
      session_id: 'session-1',
      turn_id: 'turn-1',
      cwd: ROOT,
      hook_event_name: 'UserPromptSubmit',
      model: 'gpt-test',
      prompt: 'Please change the extraction prompt',
    };
    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--channel', 'function.vision.extraction'],
      { cwd: ROOT, input: JSON.stringify(hookEvent), encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);
    assert.equal(parsed.continue, true);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(parsed.hookSpecificOutput.additionalContext, /Fixture replay gate/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /fixture_replay_gate/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo codex-hook records Codex session, prompt, response, and optional prompt blob', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-codex-recording-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const promptDir = join(dir, 'prompts');

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--prompt-dir', promptDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'codex-session-1',
          cwd: ROOT,
          hook_event_name: 'SessionStart',
          model: 'gpt-test',
          source: 'startup',
        }),
        encoding: 'utf8',
      }
    );

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--prompt-dir', promptDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'codex-session-1',
          turn_id: 'turn-1',
          cwd: ROOT,
          hook_event_name: 'UserPromptSubmit',
          model: 'gpt-test',
          prompt: 'Record this prompt.\nWith a second line.',
        }),
        encoding: 'utf8',
      }
    );

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'codex-session-1',
          turn_id: 'turn-1',
          cwd: ROOT,
          hook_event_name: 'Stop',
          model: 'gpt-test',
          last_assistant_message: 'Recorded the prompt successfully.',
        }),
        encoding: 'utf8',
      }
    );

    assert.equal(
      readFileSync(join(promptDir, 'turn-1-user.txt'), 'utf8'),
      'Record this prompt.\nWith a second line.'
    );

    const summary = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(summary.ok, true);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.promptBoundaries, 2);
    assert.equal(summary.hookEvents, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo claude-hook records Claude session and prompt events', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-claude-recording-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const promptDir = join(dir, 'prompts');

    const sessionOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'claude-hook', '--db', dbPath, '--prompt-dir', promptDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'claude-session-1',
          cwd: ROOT,
          hook_event_name: 'SessionStart',
          model: 'claude-test',
          source: 'startup',
        }),
        encoding: 'utf8',
      }
    );
    assert.deepEqual(JSON.parse(sessionOutput), {});

    const promptOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'claude-hook', '--db', dbPath, '--prompt-dir', promptDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'claude-session-1',
          turn_id: 'turn-1',
          cwd: ROOT,
          hook_event_name: 'UserPromptSubmit',
          model: 'claude-test',
          prompt: 'Record this Claude prompt.',
        }),
        encoding: 'utf8',
      }
    );
    assert.deepEqual(JSON.parse(promptOutput), {});
    assert.equal(readFileSync(join(promptDir, 'turn-1-user.txt'), 'utf8'), 'Record this Claude prompt.');

    const summary = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(summary.ok, true);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.promptBoundaries, 1);
    assert.equal(summary.hookEvents, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
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
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
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


test('lyo codex-hook can store records under the event cwd', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-event-cwd-'));
  try {
    const output = execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'codex-hook',
        '--db-from-event-cwd',
        '--prompt-dir-from-event-cwd',
      ],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'event-cwd-session',
          turn_id: 'turn-1',
          cwd: dir,
          hook_event_name: 'UserPromptSubmit',
          model: 'gpt-test',
          prompt: 'Record this in the event workspace.',
        }),
        encoding: 'utf8',
      }
    );
    const parsed = JSON.parse(output);
    assert.equal(parsed.continue, true);

    const dbPath = join(dir, '.agent-learning', 'learning.sqlite');
    assert.equal(existsSync(dbPath), true);
    assert.equal(
      readFileSync(join(dir, '.agent-learning', 'prompts', 'turn-1-user.txt'), 'utf8'),
      'Record this in the event workspace.'
    );

    const summary = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(summary.ok, true);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.promptBoundaries, 1);
    assert.equal(summary.hookEvents, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo session-start and record-prompt write observer rows without an external database client', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-observer-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const promptFile = join(dir, 'prompt.txt');
    writeFileSync(promptFile, 'Summarize the reducer flow.', 'utf8');

    const session = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'session-start',
        '--db',
        dbPath,
        '--session-id',
        'session-cli-1',
        '--repo-path',
        ROOT,
        '--platform',
        'codex',
        '--model',
        'gpt-test',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(session.ok, true);
    assert.equal(session.session.sessionId, 'session-cli-1');

    const prompt = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'record-prompt',
        '--db',
        dbPath,
        '--session-id',
        'session-cli-1',
        '--role',
        'user',
        '--kind',
        'user_prompt',
        '--prompt-file',
        promptFile,
        '--summary',
        'Summarize reducer flow',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(prompt.ok, true);
    assert.equal(prompt.prompt.promptId, 'session-cli-1:prompt:0');

    const report = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(report.sessions, 1);
    assert.equal(report.promptBoundaries, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo run-start and run-finish update run state through reducers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-run-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const started = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'run-start',
        '--db',
        dbPath,
        '--run-id',
        'run-cli-1',
        '--task-shape',
        'local-dev',
        '--channel',
        'agent.task',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(started.run.status, 'started');

    const finished = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'run-finish',
        '--db',
        dbPath,
        '--run-id',
        'run-cli-1',
        '--status',
        'completed',
        '--token-cost',
        '42',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(finished.run.status, 'completed');
    assert.equal(finished.run.tokenCost, 42);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo context goal records a native run goal without an external tracker', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-context-goal-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const recorded = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'context',
        'goal',
        '--db',
        dbPath,
        '--run-id',
        'run-goal-cli-1',
        '--goal',
        'Dogfood the Lyo learning loop.',
        '--success-criteria',
        'The run has a declared goal before later traces and outcomes.',
        '--stop-condition',
        'Stop after reducer and CLI verification pass.',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));

    assert.equal(recorded.ok, true);
    assert.equal(recorded.goal.runId, 'run-goal-cli-1');
    assert.equal(recorded.goal.goal, 'Dogfood the Lyo learning loop.');
    assert.equal(recorded.goal.successCriteria, 'The run has a declared goal before later traces and outcomes.');
    assert.equal(recorded.goal.stopCondition, 'Stop after reducer and CLI verification pass.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo tape records a verifier-gated closed loop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-tape-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'run-start', '--db', dbPath, '--run-id', 'run-tape-cli', '--task-shape', 'local-dev', '--channel', 'agent.task'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'run_goal', '--summary', 'Install acli.', '--evidence-ref', 'goal:run-tape-cli'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'verifier_spec', '--summary', 'acli -v must pass.', '--evidence-ref', 'verifier:acli-version'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'worker_action', '--summary', 'Attempted install.', '--evidence-ref', 'action:install-1'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'verifier_result', '--summary', 'acli -v exited 127.', '--evidence-ref', 'cmd:acli-version-1', '--passed', 'false'],
      { cwd: ROOT }
    );

    const failedView = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'view', '--db', dbPath, '--run-id', 'run-tape-cli'],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(failedView.ok, true);
    assert.equal(failedView.view.state, 'verifying');
    assert.equal(failedView.view.scan.passed, false);
    assert.deepEqual(failedView.view.legalNextKinds, ['gap', 'worker_action', 'blocked']);

    let rejectedOutcome;
    try {
      execFileSync(
        process.execPath,
        ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'outcome_completed', '--summary', 'Install completed.', '--evidence-ref', 'outcome:premature'],
        { cwd: ROOT, encoding: 'utf8' }
      );
    } catch (error) {
      rejectedOutcome = JSON.parse(error.stdout);
    }
    assert.match(rejectedOutcome.error.message, /illegal tape transition/);

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'gap', '--summary', 'Binary missing from PATH.', '--evidence-ref', 'gap:missing-path'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'worker_action', '--summary', 'Fixed PATH.', '--evidence-ref', 'action:install-2'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'verifier_result', '--summary', 'acli -v exited 0.', '--evidence-ref', 'cmd:acli-version-2', '--passed', 'true'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'outcome_completed', '--summary', 'Install completed after verifier passed.', '--evidence-ref', 'outcome:run-tape-cli'],
      { cwd: ROOT }
    );

    const completedView = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'view', '--db', dbPath, '--run-id', 'run-tape-cli'],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(completedView.view.state, 'completed');
    assert.equal(completedView.view.cells.length, 8);
    assert.deepEqual(completedView.view.legalNextKinds, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo harness learns a verifier gate from observed tapes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-harness-learn-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'run-start', '--db', dbPath, '--run-id', 'run-unverified-cli', '--task-shape', 'local-dev', '--channel', 'agent.task', '--status', 'completed'],
      { cwd: ROOT }
    );
    for (const args of [
      ['run_goal', 'Fix parser behavior.', 'goal:run-unverified-cli'],
      ['verifier_spec', 'Targeted parser test should pass.', 'verifier:parser-test'],
      ['worker_action', 'Edited parser code.', 'diff:parser-edit'],
      ['assistant_claim', 'Assistant claimed completion without verifier evidence.', 'assistant:claim-unverified'],
    ]) {
      execFileSync(
        process.execPath,
        ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-unverified-cli', '--kind', args[0], '--summary', args[1], '--evidence-ref', args[2]],
        { cwd: ROOT }
      );
    }

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'run-start', '--db', dbPath, '--run-id', 'run-verified-cli', '--task-shape', 'local-dev', '--channel', 'agent.task', '--status', 'completed'],
      { cwd: ROOT }
    );
    for (const args of [
      ['run_goal', 'Fix parser behavior.', 'goal:run-verified-cli'],
      ['verifier_spec', 'Targeted parser test should pass.', 'verifier:parser-test'],
      ['worker_action', 'Edited parser code.', 'diff:parser-edit-2'],
    ]) {
      execFileSync(
        process.execPath,
        ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-verified-cli', '--kind', args[0], '--summary', args[1], '--evidence-ref', args[2]],
        { cwd: ROOT }
      );
    }
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-verified-cli', '--kind', 'verifier_result', '--summary', 'Targeted parser test passed.', '--evidence-ref', 'test:parser-pass', '--passed', 'true'],
      { cwd: ROOT }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-verified-cli', '--kind', 'outcome_completed', '--summary', 'Parser fix completed after verifier passed.', '--evidence-ref', 'outcome:run-verified-cli'],
      { cwd: ROOT }
    );

    const learned = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'harness',
        'learn-verifier-gate',
        '--db',
        dbPath,
        '--chosen-run-id',
        'run-verified-cli',
        '--rejected-run-id',
        'run-unverified-cli',
        '--protocol-id',
        'harness_verifier_gate_cli',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));

    assert.equal(learned.ok, true);
    assert.equal(learned.learned.protocol.protocolId, 'harness_verifier_gate_cli');
    assert.equal(learned.learned.protocol.status, 'candidate');
    assert.equal(learned.learned.preference.confidence, 'high');
    assert.equal(learned.learned.chosenTrace.runId, 'run-verified-cli');
    assert.equal(learned.learned.rejectedTrace.runId, 'run-unverified-cli');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo model-call record writes model usage into the ledger report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-model-call-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const promptFile = join(dir, 'prompt.txt');
    writeFileSync(promptFile, 'Compare low and high model traces.', 'utf8');

    const recorded = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'model-call',
        'record',
        '--db',
        dbPath,
        '--call-id',
        'call-cli-1',
        '--session-id',
        'session-cli-1',
        '--provider',
        'openai',
        '--model',
        'gpt-test-low',
        '--model-lane',
        'low',
        '--prompt-file',
        promptFile,
        '--summary',
        'Compare model traces',
        '--input-tokens',
        '75',
        '--output-tokens',
        '25',
        '--estimated-cost',
        '0.003',
        '--latency-ms',
        '1200',
        '--status',
        'completed',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(recorded.ok, true);
    assert.equal(recorded.modelCall.callId, 'call-cli-1');
    assert.equal(recorded.modelCall.totalTokens, 100);
    assert.equal(recorded.modelCall.promptHash.length, 64);

    const report = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(report.modelCalls, 1);
    assert.equal(report.totalModelTokens, 100);
    assert.equal(report.estimatedModelCost, 0.003);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo CLI records workspace activation tracer bullet and reports associations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-workspace-activation-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    execFileSync(process.execPath, [
      'src/cli.ts', 'workspace', 'register',
      '--db', dbPath,
      '--workspace-id', 'nectr',
      '--root', dir,
      '--name', 'nectr_data_eng',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'zone', 'add',
      '--db', dbPath,
      '--workspace-id', 'nectr',
      '--zone-id', 'core',
      '--name', 'core',
      '--kind', 'config',
      '--path-glob', 'nectr_data_eng_core/**',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'zone', 'add',
      '--db', dbPath,
      '--workspace-id', 'nectr',
      '--zone-id', 'engineering',
      '--name', 'engineering',
      '--kind', 'domain',
      '--path-glob', 'nectr_data_engineering/**',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'job', 'start',
      '--db', dbPath,
      '--job-id', 'REP-456',
      '--workspace-id', 'nectr',
      '--task-shape', 'data-platform-change',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'activate', 'path',
      '--db', dbPath,
      '--job-id', 'REP-456',
      '--path', 'nectr_data_eng_core/config.yml',
      '--kind', 'file_written',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'activate', 'path',
      '--db', dbPath,
      '--job-id', 'REP-456',
      '--path', 'nectr_data_engineering/pipelines/foo.py',
      '--kind', 'file_written',
    ], { cwd: ROOT });

    const derived = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts', 'activation', 'derive',
        '--db', dbPath,
        '--job-id', 'REP-456',
        '--outcome', 'positive',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(derived.ok, true);
    assert.equal(derived.zoneCoactivations.length, 1);

    const report = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'activation', 'report', '--db', dbPath, '--job-id', 'REP-456'],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(report.ok, true);
    assert.equal(report.pathActivations.length, 2);
    assert.equal(report.zoneCoactivations.length, 1);

    const associations = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'zone', 'associations', '--db', dbPath, '--workspace-id', 'nectr'],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(associations.ok, true);
    assert.equal(associations.associations.length, 1);
    assert.equal(associations.associations[0].positiveOutcomes, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo normalize hooks turns Codex hook events into activation records', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-normalize-hooks-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    execFileSync(process.execPath, [
      'src/cli.ts', 'workspace', 'register',
      '--db', dbPath,
      '--workspace-id', 'demo',
      '--root', dir,
      '--name', 'demo',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'zone', 'add',
      '--db', dbPath,
      '--workspace-id', 'demo',
      '--zone-id', 'src',
      '--name', 'src',
      '--kind', 'domain',
      '--path-glob', 'src/**',
    ], { cwd: ROOT });
    execFileSync(process.execPath, [
      'src/cli.ts', 'zone', 'add',
      '--db', dbPath,
      '--workspace-id', 'demo',
      '--zone-id', 'node_test',
      '--name', 'node_test',
      '--kind', 'external_command',
    ], { cwd: ROOT });

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-normalize',
          turn_id: 'turn-normalize',
          cwd: dir,
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
          tool_input: { file_path: 'src/index.ts' },
        }),
      }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-normalize',
          turn_id: 'turn-normalize',
          cwd: dir,
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'node --test' },
        }),
      }
    );

    const normalized = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'normalize', 'hooks', '--db', dbPath, '--workspace-id', 'demo'],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(normalized.ok, true);
    assert.equal(normalized.processedEvents, 2);
    assert.equal(normalized.pathActivations, 1);
    assert.equal(normalized.commandActivations, 1);
    assert.equal(normalized.zoneCoactivations, 1);

    const report = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'activation', 'report', '--db', dbPath, '--job-id', normalized.jobs[0]],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(report.ok, true);
    assert.equal(report.commandActivations[0].classification, 'unknown');
    assert.equal(report.pathActivations[0].path, 'src/index.ts');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo CLI initializes Nectr defaults and recommends associated zones from passive hooks', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-nectr-associations-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    const initialized = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts', 'workspace', 'init-nectr',
        '--db', dbPath,
        '--root', dir,
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(initialized.ok, true);
    assert.equal(initialized.workspace.workspaceId, 'nectr_data_eng');
    assert.equal(initialized.zones.length, 8);

    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--no-normalize-on-tool-use'],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-nectr',
          turn_id: 'turn-nectr',
          cwd: dir,
          hook_event_name: 'PostToolUse',
          tool_name: 'Edit',
          tool_input: { file_path: 'nectr_data_engineering/domains/billing/model.sql' },
        }),
      }
    );
    execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--no-normalize-on-tool-use'],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-nectr',
          turn_id: 'turn-nectr',
          cwd: dir,
          hook_event_name: 'PostToolUse',
          tool_name: 'Read',
          tool_input: { file_path: 'nectr_data_eng_core/configs/billing.yml' },
        }),
      }
    );

    const normalized = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts', 'normalize', 'hooks',
        '--db', dbPath,
        '--workspace-id', 'nectr_data_eng',
        '--outcome', 'positive',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(normalized.ok, true);
    assert.equal(normalized.zoneCoactivations, 1);

    const recommendations = JSON.parse(execFileSync(
      process.execPath,
      [
        'src/cli.ts', 'associations', 'recommend',
        '--db', dbPath,
        '--workspace-id', 'nectr_data_eng',
        '--seed-zone-id', 'nectr_data_eng:business_logic',
      ],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(recommendations.ok, true);
    assert.equal(recommendations.recommendations[0].targetZoneId, 'nectr_data_eng:platform_core');
    assert.deepEqual(recommendations.recommendations[0].evidenceJobIds, [normalized.jobs[0]]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo codex-hook can spool events before normalize hooks drains them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-hook-spool-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const spoolDir = join(dir, 'hook-spool');

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath, '--spool-dir', spoolDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-spool-cli',
          turn_id: 'turn-spool-cli',
          cwd: dir,
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'node --test' },
        }),
        encoding: 'utf8',
      }
    );
    const parsed = JSON.parse(output);
    assert.equal(Object.hasOwn(parsed, 'continue'), false);
    assert.equal(existsSync(dbPath), false);
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 1);

    const normalized = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'normalize', 'hooks', '--db', dbPath, '--spool-dir', spoolDir],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(normalized.ok, true);
    assert.equal(normalized.spool.processedPackets, 1);
    assert.equal(normalized.processedEvents, 1);
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 0);

    const report = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'activation', 'report', '--db', dbPath, '--job-id', normalized.jobs[0]],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(report.ok, true);
    assert.equal(report.commandActivations[0].classification, 'unknown');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo codex-hook preserves spooled capture when stop-time drain cannot open the database', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-hook-spool-capture-first-'));
  try {
    const spoolDir = join(dir, 'hook-spool');
    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dir, '--spool-dir', spoolDir],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-capture-first',
          turn_id: 'turn-capture-first',
          cwd: dir,
          hook_event_name: 'Stop',
          model: 'gpt-test',
          last_assistant_message: 'Stop hook should not lose the raw event when DB drain fails.',
        }),
        encoding: 'utf8',
      }
    );

    assert.deepEqual(JSON.parse(output), { continue: true });
    const packets = readdirSync(join(spoolDir, 'incoming'));
    assert.equal(packets.length, 1);
    const packet = JSON.parse(readFileSync(join(spoolDir, 'incoming', packets[0]), 'utf8'));
    assert.equal(packet.hookEvent.eventName, 'turn.stop');
    assert.equal(packet.hookEvent.sessionId, 'session-capture-first');
    assert.equal(packet.hookEvent.payload.hook_event_name, 'Stop');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo codex-hook avoids unsupported continue field for PreToolUse output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-codex-pretool-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    execFileSync(process.execPath, ['src/cli.ts', 'init', '--db', dbPath], { cwd: ROOT });
    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'codex-hook', '--db', dbPath],
      {
        cwd: ROOT,
        input: JSON.stringify({
          session_id: 'session-1',
          turn_id: 'turn-1',
          cwd: ROOT,
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
          tool_use_id: 'tool-1',
          tool_input: { command: 'node --test' },
        }),
        encoding: 'utf8',
      }
    );
    const parsed = JSON.parse(output);
    assert.equal(Object.hasOwn(parsed, 'continue'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
