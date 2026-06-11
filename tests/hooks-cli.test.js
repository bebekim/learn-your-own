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
    const parsed = runLyoJson(['codex-hook', '--db', dbPath, '--channel', 'function.vision.extraction'], {
      input: JSON.stringify(hookEvent),
    });
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

    runLyo(['codex-hook', '--db', dbPath, '--prompt-dir', promptDir], {
      input: JSON.stringify({
        session_id: 'codex-session-1',
        cwd: ROOT,
        hook_event_name: 'SessionStart',
        model: 'gpt-test',
        source: 'startup',
      }),
    });

    runLyo(['codex-hook', '--db', dbPath, '--prompt-dir', promptDir], {
      input: JSON.stringify({
        session_id: 'codex-session-1',
        turn_id: 'turn-1',
        cwd: ROOT,
        hook_event_name: 'UserPromptSubmit',
        model: 'gpt-test',
        prompt: 'Record this prompt.\nWith a second line.',
      }),
    });

    runLyo(['codex-hook', '--db', dbPath], {
      input: JSON.stringify({
        session_id: 'codex-session-1',
        turn_id: 'turn-1',
        cwd: ROOT,
        hook_event_name: 'Stop',
        model: 'gpt-test',
        last_assistant_message: 'Recorded the prompt successfully.',
      }),
    });

    assert.equal(
      readFileSync(join(promptDir, 'turn-1-user.txt'), 'utf8'),
      'Record this prompt.\nWith a second line.'
    );

    const summary = runLyoJson(['report', '--db', dbPath]);
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

    const sessionOutput = runLyo(['claude-hook', '--db', dbPath, '--prompt-dir', promptDir], {
      input: JSON.stringify({
        session_id: 'claude-session-1',
        cwd: ROOT,
        hook_event_name: 'SessionStart',
        model: 'claude-test',
        source: 'startup',
      }),
    });
    assert.deepEqual(JSON.parse(sessionOutput), {});

    const promptOutput = runLyo(['claude-hook', '--db', dbPath, '--prompt-dir', promptDir], {
      input: JSON.stringify({
        session_id: 'claude-session-1',
        turn_id: 'turn-1',
        cwd: ROOT,
        hook_event_name: 'UserPromptSubmit',
        model: 'claude-test',
        prompt: 'Record this Claude prompt.',
      }),
    });
    assert.deepEqual(JSON.parse(promptOutput), {});
    assert.equal(readFileSync(join(promptDir, 'turn-1-user.txt'), 'utf8'), 'Record this Claude prompt.');

    const summary = runLyoJson(['report', '--db', dbPath]);
    assert.equal(summary.ok, true);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.promptBoundaries, 1);
    assert.equal(summary.hookEvents, 2);
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

    const summary = runLyoJson(['report', '--db', dbPath]);
    assert.equal(summary.ok, true);
    assert.equal(summary.sessions, 1);
    assert.equal(summary.promptBoundaries, 1);
    assert.equal(summary.hookEvents, 1);
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

    const normalized = runLyoJson(['normalize', 'hooks', '--db', dbPath, '--spool-dir', spoolDir]);
    assert.equal(normalized.ok, true);
    assert.equal(normalized.spool.processedPackets, 1);
    assert.equal(normalized.processedEvents, 1);
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 0);

    const report = runLyoJson(['activation', 'report', '--db', dbPath, '--job-id', normalized.jobs[0]]);
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
    runLyo(['init', '--db', dbPath]);
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
