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

    const report = runLyoJson(['report', '--db', dbPath]);
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

    const report = runLyoJson(['report', '--db', dbPath]);
    assert.equal(report.modelCalls, 1);
    assert.equal(report.totalModelTokens, 100);
    assert.equal(report.estimatedModelCost, 0.003);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo context preference records a user preference pair', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-context-pref-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    // 1. Start two runs
    execFileSync(process.execPath, [
      'src/cli.ts', 'run-start',
      '--db', dbPath,
      '--run-id', 'run-chosen',
      '--task-shape', 'local-dev',
      '--channel', 'agent.task',
    ], { cwd: ROOT, encoding: 'utf8' });

    execFileSync(process.execPath, [
      'src/cli.ts', 'run-start',
      '--db', dbPath,
      '--run-id', 'run-rejected',
      '--task-shape', 'local-dev',
      '--channel', 'agent.task',
    ], { cwd: ROOT, encoding: 'utf8' });

    // Set goals to initialize the tapes
    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-chosen',
      '--kind', 'run_goal',
      '--summary', 'Implement local media player.',
      '--evidence-ref', 'goal-chosen',
    ], { cwd: ROOT, encoding: 'utf8' });

    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-rejected',
      '--kind', 'run_goal',
      '--summary', 'Implement Telegram bot daemon.',
      '--evidence-ref', 'goal-rejected',
    ], { cwd: ROOT, encoding: 'utf8' });

    // Record verifier specifications to transition the tape to verifier_gated
    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-chosen',
      '--kind', 'verifier_spec',
      '--summary', 'Verify local CLI player output and tests pass.',
      '--evidence-ref', 'verifier-chosen',
    ], { cwd: ROOT, encoding: 'utf8' });

    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-rejected',
      '--kind', 'verifier_spec',
      '--summary', 'Verify Telegram bot replies and mock tests pass.',
      '--evidence-ref', 'verifier-rejected',
    ], { cwd: ROOT, encoding: 'utf8' });

    // 2. Record tape cells for both runs (tape state setup)
    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-chosen',
      '--kind', 'worker_action',
      '--summary', 'Preferred implementation strategy.',
      '--evidence-ref', 'evidence-chosen',
    ], { cwd: ROOT, encoding: 'utf8' });

    execFileSync(process.execPath, [
      'src/cli.ts', 'tape', 'record',
      '--db', dbPath,
      '--run-id', 'run-rejected',
      '--kind', 'worker_action',
      '--summary', 'Rejected complex solution.',
      '--evidence-ref', 'evidence-rejected',
    ], { cwd: ROOT, encoding: 'utf8' });

    // 3. Record learning traces to reference in the preference pair.
    // Tape cells are not traces; traces are explicit learning_traces rows.
    const chosenTrace = JSON.parse(execFileSync(process.execPath, [
      'src/cli.ts', 'context', 'trace',
      '--db', dbPath,
      '--trace-id', 'trace-chosen-implementation',
      '--run-id', 'run-chosen',
      '--kind', 'behavior',
      '--summary', 'Preferred implementation strategy.',
      '--ref', 'evidence-chosen',
    ], { cwd: ROOT, encoding: 'utf8' }));

    const rejectedTrace = JSON.parse(execFileSync(process.execPath, [
      'src/cli.ts', 'context', 'trace',
      '--db', dbPath,
      '--trace-id', 'trace-rejected-implementation',
      '--run-id', 'run-rejected',
      '--kind', 'behavior',
      '--summary', 'Rejected complex solution.',
      '--ref', 'evidence-rejected',
    ], { cwd: ROOT, encoding: 'utf8' }));

    const chosenTraceId = chosenTrace.trace.traceId;
    const rejectedTraceId = rejectedTrace.trace.traceId;

    // 4. Record preference pair
    const recorded = JSON.parse(execFileSync(process.execPath, [
      'src/cli.ts', 'context', 'preference',
      '--db', dbPath,
      '--chosen-trace-id', chosenTraceId,
      '--rejected-trace-id', rejectedTraceId,
      '--reason', 'Prefer simple local CLI player over complex Telegram bot daemon.',
      '--evidence-ref', 'github-issue-12',
      '--confidence', 'high',
      '--recorded-by', 'user-preference-test',
    ], { cwd: ROOT, encoding: 'utf8' }));

    assert.equal(recorded.ok, true);
    assert.equal(recorded.preference.chosenTraceId, chosenTraceId);
    assert.equal(recorded.preference.rejectedTraceId, rejectedTraceId);
    assert.equal(recorded.preference.reason, 'Prefer simple local CLI player over complex Telegram bot daemon.');
    assert.equal(recorded.preference.confidence, 'high');
    assert.equal(recorded.preference.recordedBy, 'user-preference-test');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
