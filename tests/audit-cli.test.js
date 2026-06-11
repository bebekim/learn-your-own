import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ROOT,
  runLyoJson,
} from './helpers/cli.js';

test('lyo audit scans .agent-learning SQLite ledgers for effect metrics', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-effect-audit-'));
  try {
    const dbDir = join(dir, 'repo-a', '.agent-learning');
    mkdirSync(dbDir, { recursive: true });
    const dbPath = join(dbDir, 'learning.sqlite');
    const seed = `
      import {
        createKernel,
        initLedger,
        recordHookEvent
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      const common = {
        sessionId: 'audit-session',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-debug',
        eventId: 'audit-0-prompt',
        eventName: 'UserPromptSubmit',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: 'prompt', length: 42 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-debug',
        eventId: 'audit-1-edit',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/a.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-debug',
        eventId: 'audit-2-test-fail',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 1, stderr: 'fail' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-debug',
        eventId: 'audit-3-inspect',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,20p' src/a.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-incomplete',
        eventId: 'audit-edit-only',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/b.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-incomplete',
        eventId: 'audit-unknown-command',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'custom-tool --flag' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-incomplete',
        eventId: 'audit-parked-bd-ready',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'bd ready --json' },
          tool_response: { exit_code: 0, stdout: '[]' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        turnId: 'audit-turn-incomplete',
        eventId: 'audit-parked-bd-list',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'bd list --json' },
          tool_response: { exit_code: 0, stdout: '[]' }
        }
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const parsed = runLyoJson(['audit', '--dir', dir]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.auditVersion, 'lyo/effect-audit/v1');
    assert.equal(parsed.ledgers, 1);
    assert.deepEqual(parsed.scannedLedgers, [{
      dbPath,
      workspaceRoot: join(dir, 'repo-a'),
      relativeWorkspace: 'repo-a',
      depth: 1,
    }]);
    assert.deepEqual(parsed.scannedDatabases, [dbPath]);
    assert.deepEqual(parsed.skippedDatabases, []);
    assert.equal(parsed.totalRuns, 2);
    assert.equal(parsed.totalEvents, 8);
    assert.equal(parsed.normalizedActions, 8);
    assert.equal(parsed.normalizedActionRate, 1);
    assert.equal(parsed.unknownActions, 1);
    assert.equal(parsed.unknownActionRate, 0.125);
    assert.equal(parsed.parkedUnknownActions, 2);
    assert.equal(parsed.parkedUnknownActionRate, 0.25);
    assert.equal(parsed.lowConfidenceActions, 0);
    assert.equal(parsed.lowConfidenceActionRate, 0);
    assert.equal(parsed.runsWithEdits, 2);
    assert.equal(parsed.verifiedEditRuns, 0);
    assert.equal(parsed.editVerificationRate, 0);
    assert.equal(parsed.runsWithFailedVerification, 1);
    assert.equal(parsed.debuggingAfterFailureRuns, 1);
    assert.equal(parsed.debuggingAfterTestFailureRate, 1);
    assert.equal(parsed.stoppedAfterEditWithoutVerificationRuns, 1);
    assert.deepEqual(parsed.topUnknownCommands, [
      { command: 'custom-tool --flag', count: 1 },
    ]);
    assert.deepEqual(parsed.topParkedUnknownCommands, [
      { command: 'bd list --json', count: 1 },
      { command: 'bd ready --json', count: 1 },
    ]);
    assert.equal(
      parsed.topUnknownCommands.some((item) => item.command === 'boundary:boundary:unknown'),
      false
    );
    assert.deepEqual(parsed.topMisclassificationCandidates, [
      { command: 'custom-tool --flag', count: 1 },
    ]);
    assert.deepEqual(parsed.summaryLines, [
      'Found 1 ledgers, 2 runs, 8 events.',
      'Normalized action rate: 100%.',
      'Verified edit rate: 0%.',
      'Stopped after edit without verification: 1 runs.',
      'Debugging after failed test: 100%.',
      'Unsafe write runs: 0.',
      'Unknown actions: 1.',
      'Parked unknown actions: 2.',
      'Top unknown commands: custom-tool --flag (1).',
      'Top parked unknown commands: bd list --json (1), bd ready --json (1).',
    ]);
    assert.equal(parsed.summaryText, parsed.summaryLines.join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
