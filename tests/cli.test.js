import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
