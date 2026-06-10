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

test('lyo learn style emits aggregate LLM usage and style learning candidates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-learn-style-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const seed = `
      import {
        createKernel,
        initLedger,
        recordHookEvent,
        recordModelCall
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      const common = {
        sessionId: 'learn-style-session',
        turnId: 'learn-style-turn',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-01-prompt',
        eventName: 'UserPromptSubmit',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: 'prompt', length: 42 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-02-inspect',
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
        eventId: 'learn-style-03-edit',
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
        eventId: 'learn-style-04-test-fail',
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
        eventId: 'learn-style-05-diagnose',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,120p' src/main.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-06-fix',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/main.ts\\n@@\\n-new\\n+newer\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-07-test-pass',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
      recordModelCall(kernel, {
        callId: 'learn-style-model-call',
        sessionId: 'learn-style-session',
        runId: 'learn-style-turn',
        provider: 'openai',
        model: 'gpt-5',
        modelLane: 'agent',
        inputTokens: 100,
        outputTokens: 40,
        status: 'completed'
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'style', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.learning.learningVersion, 'lyo/style-learning/v1');
    assert.equal(parsed.learning.mode, 'learn');
    assert.equal(parsed.learning.runCount, 1);
    assert.equal(parsed.learning.modelUsage.totalModelCalls, 1);
    assert.equal(parsed.learning.modelUsage.totalTokens, 140);
    assert.equal(parsed.learning.styleDistribution.manualOrchestrated, 1);
    assert.equal(parsed.learning.styleDistribution.loopDrivenCandidate, 0);
    assert.equal(parsed.learning.learningCandidates.some((candidate) => {
      return candidate.id === 'preserve-verifier-debug-loop';
    }), true);
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
    assert.equal(parsed.experiment.associationCredits[0].credit, 1);
    assert.equal(parsed.experiment.decision, 'generalize_candidate');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'audit', '--dir', dir],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.auditVersion, 'lyo/effect-audit/v1');
    assert.equal(parsed.ledgers, 1);
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
