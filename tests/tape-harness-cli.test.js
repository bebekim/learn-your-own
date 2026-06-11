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

test('lyo tape records a verifier-gated closed loop', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-tape-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');

    runLyo(['run-start', '--db', dbPath, '--run-id', 'run-tape-cli', '--task-shape', 'local-dev', '--channel', 'agent.task'],
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

    const failedView = runLyoJson(['tape', 'view', '--db', dbPath, '--run-id', 'run-tape-cli']);
    assert.equal(failedView.ok, true);
    assert.equal(failedView.view.state, 'verifying');
    assert.equal(failedView.view.scan.passed, false);
    assert.deepEqual(failedView.view.legalNextKinds, ['gap', 'worker_action', 'blocked']);

    let rejectedOutcome;
    try {
      execFileSync(
        process.execPath,
        ['src/cli.ts', 'tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'outcome_completed', '--summary', 'Install completed.', '--evidence-ref', 'outcome:premature']);
    } catch (error) {
      rejectedOutcome = JSON.parse(error.stdout);
    }
    assert.match(rejectedOutcome.error.message, /illegal tape transition/);

    runLyo(['tape', 'record', '--db', dbPath, '--run-id', 'run-tape-cli', '--kind', 'gap', '--summary', 'Binary missing from PATH.', '--evidence-ref', 'gap:missing-path'],
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

    const completedView = runLyoJson(['tape', 'view', '--db', dbPath, '--run-id', 'run-tape-cli']);
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
      ]));

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
