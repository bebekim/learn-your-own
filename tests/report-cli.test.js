import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;

test('lyo report emits semantic run analysis for a run id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-semantic-report-'));
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
      const common = {
        sessionId: 'semantic-session',
        turnId: 'semantic-turn',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        eventId: 'semantic-edit',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/main.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'semantic-test',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath, '--semantic', '--run-id', 'semantic-turn'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.semantic.runId, 'semantic-turn');
    assert.deepEqual(parsed.semantic.verifiers.map((verifier) => verifier.command), ['npm test']);
    assert.deepEqual(parsed.semantic.milestones.map((milestone) => ({
      name: milestone.name,
      associatedPaths: milestone.associatedPaths,
      failedAttempts: milestone.failedAttempts,
    })), [{
      name: 'verify_src_main_ts',
      associatedPaths: ['src/main.ts'],
      failedAttempts: 0,
    }]);

    const lowerOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath, '--semantic', '--lower', '--run-id', 'semantic-turn'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const lowerParsed = JSON.parse(lowerOutput);
    assert.equal(lowerParsed.ok, true);
    assert.deepEqual(lowerParsed.loweringPlan.verifierDrafts, ['npm test verifies src/main.ts']);
    assert.deepEqual(lowerParsed.loweringPlan.milestoneDrafts, ['verify_src_main_ts completed after 0 failed attempts']);
    assert.deepEqual(lowerParsed.loweringPlan.procedureDrafts, ['edit -> test pass']);

    const effectsOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath, '--effects', '--run-id', 'semantic-turn'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const effectsParsed = JSON.parse(effectsOutput);
    assert.equal(effectsParsed.ok, true);
    assert.equal(effectsParsed.effects.effectVersion, 'lyo/effect/v1');
    assert.match(effectsParsed.effects.effectSignature, /^sha256:[a-f0-9]{64}$/);
    assert.equal(effectsParsed.effects.runId, 'semantic-turn');
    assert.equal(effectsParsed.effects.actionCount, 2);
    assert.deepEqual(effectsParsed.effects.counts, {
      inspect: 0,
      edit: 1,
      test: 1,
      external: 0,
      unknown: 0,
    });
    assert.deepEqual(effectsParsed.effects.predicates, {
      verifiedCompletion: true,
      debugging: false,
      approvalFriction: false,
      unsafeWrite: false,
      stoppedAfterEditWithoutVerification: false,
    });
    assert.deepEqual(effectsParsed.effects.summary.writes, [
      { type: 'local_file', ref: 'src/main.ts' },
    ]);
    assert.deepEqual(effectsParsed.effects.summary.executedCommands, ['npm test']);
    assert.equal(effectsParsed.effects.summary.evidenceLength, 2);
    assert.deepEqual(effectsParsed.effects.resourceConflicts, []);
    assert.deepEqual(effectsParsed.effects.temporalFindings, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo report emits workflow style analysis for a run id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-style-report-'));
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
      const common = {
        sessionId: 'style-session',
        turnId: 'style-turn',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-01-prompt',
        eventName: 'UserPromptSubmit',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: 'style-prompt', length: 42 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-02-loop-doc',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: AGENT_LOOP.md\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-03-test-file',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: tests/parser.test.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-04-code',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/parser.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-05-test-fail',
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
        eventId: 'style-06-inspect',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,120p' src/parser.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-07-fix',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/parser.ts\\n@@\\n-new\\n+newer\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-08-test-pass',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'style-09-build',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm run build' },
          tool_response: { exit_code: 0, stdout: 'built' }
        }
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath, '--style', '--run-id', 'style-turn'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.style.styleVersion, 'lyo/workflow-style/v1');
    assert.equal(parsed.style.runId, 'style-turn');
    assert.equal(parsed.style.classification, 'loop_driven_candidate');
    assert.equal(parsed.style.lineageMode, 'inferred_only');
    assert.equal(parsed.style.metrics.humanPromptCount, 1);
    assert.equal(parsed.style.metrics.actionCount, 8);
    assert.equal(parsed.style.metrics.loopArtifactTouches > 0, true);
    assert.equal(parsed.style.missingSignals.includes('loop prompt emission event'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo report emits candidate at-bat evaluation for a run id and task context', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-at-bat-report-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const taskContextPath = join(dir, 'task-context.json');
    writeFileSync(taskContextPath, JSON.stringify({
      taskId: 'etl-debugging-v1',
      language: 'typescript',
      taskComplexity: 6,
      expectedPattern: 'verifier-first debugging',
      successCriteria: ['targeted verifier passes after the fix'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'targeted-npm-test',
        commandPattern: 'npm test',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    }), 'utf8');

    const seed = `
      import {
        createKernel,
        initLedger,
        recordHookEvent
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      const common = {
        sessionId: 'at-bat-session',
        turnId: 'at-bat-turn',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        eventId: 'at-bat-cli-01-prompt',
        eventName: 'UserPromptSubmit',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: 'prompt', length: 42 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'at-bat-cli-02-inspect',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,80p' src/main.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'at-bat-cli-03-edit',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/main.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'at-bat-cli-04-test',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'at-bat-cli-05-stop',
        eventName: 'Stop',
        payload: {
          hook_event_name: 'Stop',
          last_assistant_message: 'Done. npm test passed after the fix.'
        }
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      [
        'src/cli.ts',
        'report',
        '--db',
        dbPath,
        '--at-bat',
        '--run-id',
        'at-bat-turn',
        '--task-context',
        taskContextPath,
      ],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.atBat.reportVersion, 'lyo/candidate-at-bat/v1');
    assert.equal(parsed.atBat.runId, 'at-bat-turn');
    assert.equal(parsed.atBat.taskId, 'etl-debugging-v1');
    assert.equal(parsed.atBat.outcome, 'verified_progress');
    assert.equal(parsed.atBat.shipReadiness, true);
    assert.equal(parsed.atBat.verifierQuality, 'moderate');
    assert.equal(parsed.atBat.finalClaim.posture, 'cites_evidence');
    assert.equal(parsed.atBat.finalClaim.mentionsVerifier, true);
    assert.deepEqual(parsed.atBat.missingRequiredVerifiers, []);
    assert.deepEqual(parsed.atBat.matchedVerifiers.map((verifier) => verifier.id), ['targeted-npm-test']);
    assert.equal(parsed.atBat.scorecard.verifiedProgress, true);
    assert.equal(parsed.atBat.scorecard.inspectBeforeEdit, true);
    assert.equal(parsed.atBat.conversion.edits, 1);
    assert.equal(parsed.atBat.conversion.verifierPasses, 1);
    assert.equal(parsed.atBat.techniqueSignature.includes('verifier-first'), true);
    assert.equal(parsed.atBat.evidenceRefs.includes('hook:at-bat-cli-04-test'), true);

    const summary = JSON.parse(execFileSync(
      process.execPath,
      ['src/cli.ts', 'report', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    ));
    assert.equal(summary.hookEvents, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo report rejects malformed candidate at-bat task context clearly', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-at-bat-bad-context-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const taskContextPath = join(dir, 'task-context.json');
    writeFileSync(taskContextPath, JSON.stringify({
      taskId: 'bad-context',
      taskComplexity: 4,
      expectedPattern: 'verifier-first',
      successCriteria: ['targeted verifier passes'],
      allowedTools: [],
    }), 'utf8');

    execFileSync(process.execPath, ['src/cli.ts', 'init', '--db', dbPath], { cwd: ROOT });

    assert.throws(
      () => execFileSync(
        process.execPath,
        [
          'src/cli.ts',
          'report',
          '--db',
          dbPath,
          '--at-bat',
          '--run-id',
          'missing-run',
          '--task-context',
          taskContextPath,
        ],
        { cwd: ROOT, encoding: 'utf8' }
      ),
      (error) => {
        const output = error && typeof error === 'object' && 'stdout' in error
          ? String(error.stdout)
          : '';
        const parsed = JSON.parse(output);
        assert.equal(parsed.ok, false);
        assert.match(parsed.error.message, /missing baseline object/);
        return true;
      }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
