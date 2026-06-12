import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordHookEvent,
  normalizeHooks,
  actionToEffect,
  areConflicting,
  areIndependent,
  concatEffects,
  deriveTelemetryTokens,
  emptyEffect,
  foldTrace,
  hasApprovalFriction,
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isExternalAction,
  isInspectAction,
  isTestAction,
  tokenizeTelemetryActions,
  tokenizeTelemetryRun,
  parseTelemetryEpisodes,
  compileTelemetryRunAst,
  compileTelemetryRun,
  analyzeTelemetrySemantics,
  planSemanticLowering,
  buildWorkflowStyleReport,
  buildStyleLearningReport,
  buildCandidateAtBatReport,
  buildCyberneticExperimentReport,
  buildExplanationGraphReport,
  computeRivalOutcomeMessage,
  recordModelCall,
} from '../src/index.ts';
import {
  compiledTelemetryRun,
  telemetryAction as action,
} from './helpers/telemetry.js';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-compiler-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('Lyo compiler frontend tokenizes and parses a standard verify-edit-debug-pass loop', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const sessionId = 'session-1';
    const turnId = 'turn-1';
    const cwd = '/tmp/project';

    // 1. Session start / Prompt Submit
    recordHookEvent(kernel, {
      eventId: 'event-0',
      sessionId,
      turnId,
      eventName: 'UserPromptSubmit',
      cwd,
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: { sha256: 'p-1', length: 50 },
      },
    });

    // 2. PreToolUse + PostToolUse for inspect (rg)
    recordHookEvent(kernel, {
      eventId: 'event-1-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rg "foo" src/' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'event-1-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rg "foo" src/' },
        tool_response: { exit_code: 0, stdout: 'match' },
      },
    });

    // 3. PreToolUse + PostToolUse for edit (apply_patch)
    recordHookEvent(kernel, {
      eventId: 'event-2-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-foo\n+bar\n*** End Patch',
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'event-2-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-foo\n+bar\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });

    // 4. PreToolUse + PostToolUse for test (npm test) -> failed
    recordHookEvent(kernel, {
      eventId: 'event-3-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'event-3-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 1, stderr: 'test failed' },
      },
    });

    // 5. PreToolUse + PostToolUse for edit 2 (apply_patch)
    recordHookEvent(kernel, {
      eventId: 'event-4-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-bar\n+baz\n*** End Patch',
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'event-4-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-bar\n+baz\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });

    // 6. PreToolUse + PostToolUse for test 2 (npm test) -> succeeded
    recordHookEvent(kernel, {
      eventId: 'event-5-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'event-5-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 0, stdout: 'all passed' },
      },
    });

    // 7. Stop
    recordHookEvent(kernel, {
      eventId: 'event-6',
      sessionId,
      turnId,
      eventName: 'Stop',
      cwd,
      payload: {
        hook_event_name: 'Stop',
      },
    });

    // Normalize events
    const normalized = normalizeHooks(kernel);
    assert.equal(normalized.processedEvents > 0, true);

    // Tokenize
    const tokens = tokenizeTelemetryRun(kernel, { runId: turnId });

    // Assert tokens
    assert.equal(tokens.length, 7);
    assert.deepEqual(tokens.map(t => t.kind), [
      'PROMPT',
      'INSPECT',
      'EDIT',
      'TEST',
      'EDIT',
      'TEST',
      'STOP'
    ]);

    // Check ordinals
    assert.deepEqual(tokens.map(t => t.provenance.ordinal), [0, 1, 2, 3, 4, 5, 6]);

    // Check token specifics
    assert.equal(tokens[0].kind, 'PROMPT');
    
    assert.equal(tokens[1].kind, 'INSPECT');
    assert.equal(tokens[1].command?.name, 'rg');

    assert.equal(tokens[2].kind, 'EDIT');
    assert.deepEqual(tokens[2].paths, ['src/main.ts']);

    assert.equal(tokens[3].kind, 'TEST');
    assert.equal(tokens[3].command?.status, 'failed');
    assert.equal(tokens[3].command?.exitCode, 1);

    assert.equal(tokens[4].kind, 'EDIT');
    assert.deepEqual(tokens[4].paths, ['src/main.ts']);

    assert.equal(tokens[5].kind, 'TEST');
    assert.equal(tokens[5].command?.status, 'succeeded');
    assert.equal(tokens[5].command?.exitCode, 0);

    assert.equal(tokens[6].kind, 'STOP');

    // Parse episodes
    const episodes = parseTelemetryEpisodes(tokens);

    // Assert episodes
    // ep-1: orientation (PROMPT, INSPECT)
    // ep-2: implementation (EDIT)
    // ep-3: failed_verification (TEST)
    // ep-4: debugging (EDIT after failed verifier)
    // ep-5: passed_verification (TEST)
    // ep-6: orientation (STOP)
    assert.equal(episodes.length, 6);
    assert.deepEqual(episodes.map(e => e.phase), [
      'orientation',
      'implementation',
      'failed_verification',
      'debugging',
      'passed_verification',
      'orientation'
    ]);

    assert.deepEqual(episodes[0].tokenIds, [tokens[0].provenance.eventId, tokens[1].provenance.eventId]);
    assert.deepEqual(episodes[1].tokenIds, [tokens[2].provenance.eventId]);
    assert.deepEqual(episodes[1].paths, ['src/main.ts']);

    assert.deepEqual(episodes[2].tokenIds, [tokens[3].provenance.eventId]);
    assert.deepEqual(episodes[3].tokenIds, [tokens[4].provenance.eventId]);
    assert.deepEqual(episodes[4].tokenIds, [tokens[5].provenance.eventId]);
    assert.deepEqual(episodes[5].tokenIds, [tokens[6].provenance.eventId]);

    assert.equal(episodes[0].startedAfter, 'start');
    assert.equal(episodes[1].startedAfter, episodes[0].endedAt);
    assert.equal(episodes[2].startedAfter, episodes[1].endedAt);
    assert.equal(episodes[3].startedAfter, episodes[2].endedAt);
    assert.equal(episodes[4].startedAfter, episodes[3].endedAt);
    assert.equal(episodes[5].startedAfter, episodes[4].endedAt);

    // Compile AST
	    const ast = compileTelemetryRunAst(kernel, { runId: turnId });
	    assert.equal(ast.runId, turnId);
	    assert.equal(ast.actions.length, 7);
	    assert.equal(ast.tokens.length, 7);
	    assert.equal(ast.episodes.length, 6);

	    const semantic = analyzeTelemetrySemantics(ast);
	    assert.equal(semantic.runId, turnId);
	    assert.deepEqual(semantic.verifiers.map((verifier) => verifier.command), ['npm test']);
	    assert.deepEqual(semantic.verifiers[0].scopePaths, ['src/main.ts']);
	    assert.deepEqual(semantic.milestones, [{
	      name: 'verify_src_main_ts',
	      provenance: tokens[5].provenance,
	      associatedPaths: ['src/main.ts'],
	      failedAttempts: 1,
	    }]);

      const compiled = compileTelemetryRun(kernel, { runId: turnId });
      assert.equal(compiled.runId, ast.runId);
      assert.deepEqual(compiled.actions, ast.actions);
      assert.deepEqual(compiled.tokens, ast.tokens);
      assert.deepEqual(compiled.episodes, ast.episodes);
      assert.deepEqual(compiled.semantic, semantic);
	  } finally {
	    t.cleanup();
	  }
	});

test('Lyo compiler frontend normalizes telemetry into effect actions before compatibility tokens', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const sessionId = 'session-effects';
    const turnId = 'turn-effects';
    const cwd = '/tmp/project';

    recordHookEvent(kernel, {
      eventId: 'a-sed',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: "sed -n '1,80p' src/main.ts" },
        tool_response: { exit_code: 0, stdout: 'source excerpt' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'b-edit',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-old\n+new\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'c-test',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 0, stdout: 'ok' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'd-railway',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'railway up' },
        tool_response: { exit_code: 0, stdout: 'deployed' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'e-rm',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf src/' },
        tool_response: { exit_code: 0, stdout: '' },
      },
    });

    const actions = tokenizeTelemetryActions(kernel, { runId: turnId });

    assert.deepEqual(actions.map((action) => action.operation), [
      'observe',
      'mutate_local',
      'verify',
      'mutate_external',
      'mutate_local',
    ]);
    assert.deepEqual(actions.map((action) => action.intent), [
      'inspect',
      'implement',
      'verify',
      'deploy',
      'implement',
    ]);
    assert.deepEqual(actions.map((action) => action.risk), [
      'none',
      'low',
      'none',
      'deploy',
      'destructive',
    ]);
    assert.deepEqual(actions.map((action) => action.status), [
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
      'succeeded',
    ]);

    assert.deepEqual(actions[0].resources, {
      read: [{ type: 'local_file', ref: 'src/main.ts' }],
      written: [],
    });
    assert.deepEqual(actions[1].resources.written, [{ type: 'local_file', ref: 'src/main.ts' }]);
    assert.deepEqual(actions[2].resources.read, [{ type: 'local_repo', ref: '.' }]);
    assert.deepEqual(actions[3].resources.written, [{ type: 'external_resource', ref: 'railway' }]);
    assert.deepEqual(actions[4].resources.written, [{ type: 'local_file', ref: 'src' }]);

    assert.deepEqual(actions[0].facets, ['local', 'read_only']);
    assert.equal(actions[1].facets.includes('write'), true);
    assert.equal(actions[2].facets.includes('test'), true);
    assert.equal(actions[3].facets.includes('external'), true);
    assert.equal(actions[3].facets.includes('deploy'), true);
    assert.equal(actions[4].facets.includes('destructive'), true);

    assert.deepEqual(
      tokenizeTelemetryRun(kernel, { runId: turnId }).map((token) => token.kind),
      ['INSPECT', 'EDIT', 'TEST', 'EXTERNAL', 'EDIT']
    );

    const projected = deriveTelemetryTokens(actions);
    assert.deepEqual(projected.map((token) => token.kind), [
      isInspectAction(actions[0]) ? 'INSPECT' : 'unexpected',
      isEditAction(actions[1]) ? 'EDIT' : 'unexpected',
      isTestAction(actions[2]) ? 'TEST' : 'unexpected',
      isExternalAction(actions[3]) ? 'EXTERNAL' : 'unexpected',
      isEditAction(actions[4]) ? 'EDIT' : 'unexpected',
    ]);
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies common package verification commands deterministically', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['typecheck', 'npm run typecheck', 'TEST'],
      ['lint', 'npm run lint', 'TEST'],
      ['node-test', 'node --test', 'TEST'],
      ['pnpm-test', 'pnpm test', 'TEST'],
      ['build', 'npm run build', 'BUILD'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `pkg-${suffix}`,
        sessionId: 'session-package-classifier',
        turnId: 'turn-package-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: 'ok' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-package-classifier' });

    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    for (const command of ['npm run typecheck', 'npm run lint', 'node --test', 'pnpm test']) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'verify');
      assert.equal(action.intent, 'verify');
      assert.deepEqual(action.resources.read, [{ type: 'local_repo', ref: '.' }]);
      assert.equal(action.facets.includes('test'), true);
    }

    const buildAction = byCommand.get('npm run build');
    assert.ok(buildAction);
    assert.equal(buildAction.operation, 'build');
    assert.equal(buildAction.intent, 'build');
    assert.deepEqual(buildAction.resources.read, [{ type: 'local_repo', ref: '.' }]);
    assert.equal(buildAction.facets.includes('test'), false);

    assert.deepEqual(
      tokenizeTelemetryRun(kernel, { runId: 'turn-package-classifier' }).map((token) => token.kind).sort(),
      ['BUILD', 'TEST', 'TEST', 'TEST', 'TEST']
    );
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies classic command families without overfitting generic scripts', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['lsof', 'lsof -nP -iTCP:18080 -sTCP:LISTEN'],
      ['tar-list', 'tar -tzf dist/lyo-kernel-0.2.1.tgz | sort'],
      ['node-check', 'node --check src/index.ts'],
      ['xcodebuild-test', "xcodebuild test -quiet -scheme DoSets -project dosets-ios.xcodeproj -destination 'id=sim'"],
      ['node-pack', 'node scripts/pack-npm.mjs'],
      ['node-custom', 'node scripts/custom.mjs'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `classic-${suffix}`,
        sessionId: 'session-classic-classifier',
        turnId: 'turn-classic-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: 'ok' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-classic-classifier' });
    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    for (const command of [
      'lsof -nP -iTCP:18080 -sTCP:LISTEN',
      'tar -tzf dist/lyo-kernel-0.2.1.tgz | sort',
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'observe');
      assert.equal(action.intent, 'inspect');
      assert.equal(action.risk, 'none');
      assert.equal(action.facets.includes('read_only'), true);
    }

    for (const command of [
      'node --check src/index.ts',
      "xcodebuild test -quiet -scheme DoSets -project dosets-ios.xcodeproj -destination 'id=sim'",
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'verify');
      assert.equal(action.intent, 'verify');
      assert.deepEqual(action.resources.read, [{ type: 'local_repo', ref: '.' }]);
      assert.equal(action.facets.includes('test'), true);
    }

    const packAction = byCommand.get('node scripts/pack-npm.mjs');
    assert.ok(packAction);
    assert.equal(packAction.operation, 'build');
    assert.equal(packAction.intent, 'build');
    assert.deepEqual(packAction.resources.read, [{ type: 'local_repo', ref: '.' }]);
    assert.equal(packAction.facets.includes('package'), true);

    const customAction = byCommand.get('node scripts/custom.mjs');
    assert.ok(customAction);
    assert.equal(customAction.operation, 'unknown');
    assert.equal(customAction.intent, 'unknown');
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies wait and polling commands as non-mutating wait actions', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['sleep-short', 'sleep 30'],
      ['sleep-long', 'sleep 120'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `wait-${suffix}`,
        sessionId: 'session-wait-classifier',
        turnId: 'turn-wait-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: '' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-wait-classifier' });
    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    for (const command of ['sleep 30', 'sleep 120']) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'wait');
      assert.equal(action.intent, 'wait');
      assert.equal(action.risk, 'none');
      assert.deepEqual(action.resources.read, []);
      assert.deepEqual(action.resources.written, []);
      assert.equal(action.facets.includes('read_only'), true);
    }
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies database and project-generation commands conservatively', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['sqlite-read', 'sqlite3 -header -column .agent-learning/learning.sqlite "select event_name,count(*) from hook_events group by event_name"'],
      ['sqlite-write', 'sqlite3 .agent-learning/learning.sqlite "delete from hook_events where event_id = \'e1\'"'],
      ['dbt-parse', 'UV_CACHE_DIR=.uv-cache uv run dbt parse --project-dir dbt/aus_personas --profiles-dir dbt/aus_personas'],
      ['dbt-build', 'UV_CACHE_DIR=.uv-cache uv run dbt build --project-dir dbt/aus_personas --profiles-dir dbt/aus_personas'],
      ['xcodegen', 'xcodegen generate'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `domain-${suffix}`,
        sessionId: 'session-domain-classifier',
        turnId: 'turn-domain-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: 'ok' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-domain-classifier' });
    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    const sqliteRead = byCommand.get('sqlite3 -header -column .agent-learning/learning.sqlite "select event_name,count(*) from hook_events group by event_name"');
    assert.ok(sqliteRead);
    assert.equal(sqliteRead.operation, 'observe');
    assert.equal(sqliteRead.intent, 'inspect');
    assert.equal(sqliteRead.facets.includes('database'), true);
    assert.equal(sqliteRead.facets.includes('read_only'), true);
    assert.deepEqual(sqliteRead.resources.read, [
      { type: 'local_file', ref: '.agent-learning/learning.sqlite' },
    ]);

    const sqliteWrite = byCommand.get('sqlite3 .agent-learning/learning.sqlite "delete from hook_events where event_id = \'e1\'"');
    assert.ok(sqliteWrite);
    assert.equal(sqliteWrite.operation, 'mutate_local');
    assert.equal(sqliteWrite.intent, 'implement');
    assert.equal(sqliteWrite.facets.includes('database'), true);
    assert.equal(sqliteWrite.facets.includes('write'), true);
    assert.equal(sqliteWrite.facets.includes('read_only'), false);

    const dbtParse = byCommand.get('UV_CACHE_DIR=.uv-cache uv run dbt parse --project-dir dbt/aus_personas --profiles-dir dbt/aus_personas');
    assert.ok(dbtParse);
    assert.equal(dbtParse.operation, 'verify');
    assert.equal(dbtParse.intent, 'verify');
    assert.equal(dbtParse.facets.includes('database'), true);
    assert.equal(dbtParse.facets.includes('test'), true);

    const dbtBuild = byCommand.get('UV_CACHE_DIR=.uv-cache uv run dbt build --project-dir dbt/aus_personas --profiles-dir dbt/aus_personas');
    assert.ok(dbtBuild);
    assert.equal(dbtBuild.operation, 'build');
    assert.equal(dbtBuild.intent, 'build');
    assert.equal(dbtBuild.facets.includes('database'), true);
    assert.equal(dbtBuild.facets.includes('package'), true);

    const xcodegen = byCommand.get('xcodegen generate');
    assert.ok(xcodegen);
    assert.equal(xcodegen.operation, 'mutate_local');
    assert.equal(xcodegen.intent, 'implement');
    assert.equal(xcodegen.risk, 'low');
    assert.equal(xcodegen.facets.includes('write'), true);
    assert.deepEqual(xcodegen.resources.written, [{ type: 'local_repo', ref: '.' }]);
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies read-only metadata commands without blessing package mutations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['npm-view', 'npm view lyo-kernel version --registry=https://registry.npmjs.org'],
      ['npm-list', 'npm list -g lyo-kernel --depth=0'],
      ['lyo-report', 'lyo report --db :memory:'],
      ['packaged-report', 'node dist/npm/package/src/cli.js report --db :memory:'],
      ['printf', "printf 'lyo-hook-smoke\\n'"],
      ['uv-help', 'uv add --help'],
      ['uv-sync', 'uv sync'],
      ['npm-version', 'npm version 0.2.1 --no-git-tag-version'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `metadata-${suffix}`,
        sessionId: 'session-metadata-classifier',
        turnId: 'turn-metadata-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: 'ok' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-metadata-classifier' });
    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    for (const command of [
      'npm view lyo-kernel version --registry=https://registry.npmjs.org',
      'npm list -g lyo-kernel --depth=0',
      'lyo report --db :memory:',
      'node dist/npm/package/src/cli.js report --db :memory:',
      "printf 'lyo-hook-smoke\\n'",
      'uv add --help',
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'observe');
      assert.equal(action.intent, 'inspect');
      assert.equal(action.facets.includes('read_only'), true);
    }

    const registryRead = byCommand.get('npm view lyo-kernel version --registry=https://registry.npmjs.org');
    assert.ok(registryRead);
    assert.deepEqual(registryRead.resources.read, [
      { type: 'external_resource', ref: 'package_registry' },
    ]);
    assert.equal(registryRead.facets.includes('external'), true);
    assert.equal(registryRead.facets.includes('network'), true);

    for (const command of [
      'uv sync',
      'npm version 0.2.1 --no-git-tag-version',
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'unknown');
      assert.equal(action.intent, 'unknown');
    }
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies audit-driven local tooling command families conservatively', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const commands = [
      ['lyo-audit', 'node src/cli.ts audit --dir /Users/marcus.kim/repositories/individual'],
      ['simctl-list', 'xcrun simctl list devices booted'],
      ['pack-local', 'npm run pack:local'],
      ['docker-up', 'docker compose up --build -d'],
      ['npm-publish', 'npm publish ./dist/lyo-kernel-0.2.1.tgz --userconfig /tmp/npmrc'],
      ['emacs-parse', 'emacs --batch sicp-study-outline.org --eval "(progn (require \'org) (org-mode) (message \\"org parse ok\\"))"'],
      ['emacs-compile', 'emacs --batch -Q -f batch-byte-compile /Users/marcus.kim/.emacs.d/init.el'],
      ['emacs-inspect', 'emacs --batch -Q --eval "(message \\"where-is=%S\\" (where-is-internal \'goto-line nil t))"'],
      ['sqlite-read-nested', 'sqlite3 -header -column .agent-learning/learning.sqlite "select count(*) as current_incoming_unprocessed from hook_events where created_at >= (select max(created_at) from hook_events);"'],
      ['sed-dockerfile', "sed -n '1,220p' Dockerfile"],
      ['uv-domain', 'UV_CACHE_DIR=.uv-cache uv run aus-personas pgm seed-profiles --schema aus_personas_dbt --container censusloader-postgres --sa2 213041359 --sample-size 2 --seed 1 --format csv'],
      ['server-start', '/Users/marcus.kim/.codex/plugins/cache/openai-curated/superpowers/fef63ecf/skills/brainstorming/scripts/start-server.sh --project-dir /Users/marcus.kim/repositories/individual/iOS/dosets-ios'],
    ];

    for (const [suffix, command] of commands) {
      recordHookEvent(kernel, {
        eventId: `audit-driven-${suffix}`,
        sessionId: 'session-audit-driven-classifier',
        turnId: 'turn-audit-driven-classifier',
        eventName: 'PostToolUse',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command },
          tool_response: { exit_code: 0, stdout: 'ok' },
        },
      });
    }

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-audit-driven-classifier' });
    const byCommand = new Map(actions.map((action) => [action.command?.argvSummary, action]));

    for (const command of [
      'node src/cli.ts audit --dir /Users/marcus.kim/repositories/individual',
      'xcrun simctl list devices booted',
      'emacs --batch -Q --eval "(message \\"where-is=%S\\" (where-is-internal \'goto-line nil t))"',
      'sqlite3 -header -column .agent-learning/learning.sqlite "select count(*) as current_incoming_unprocessed from hook_events where created_at >= (select max(created_at) from hook_events);"',
      "sed -n '1,220p' Dockerfile",
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'observe');
      assert.equal(action.intent, 'inspect');
      assert.equal(action.facets.includes('read_only'), true);
    }

    const packLocal = byCommand.get('npm run pack:local');
    assert.ok(packLocal);
    assert.equal(packLocal.operation, 'build');
    assert.equal(packLocal.intent, 'build');
    assert.equal(packLocal.facets.includes('package'), true);

    const dockerUp = byCommand.get('docker compose up --build -d');
    assert.ok(dockerUp);
    assert.equal(dockerUp.operation, 'mutate_local');
    assert.equal(dockerUp.intent, 'implement');
    assert.equal(dockerUp.risk, 'low');
    assert.deepEqual(dockerUp.resources.written, [{ type: 'local_cache', ref: 'docker' }]);

    const npmPublish = byCommand.get('npm publish ./dist/lyo-kernel-0.2.1.tgz --userconfig /tmp/npmrc');
    assert.ok(npmPublish);
    assert.equal(npmPublish.operation, 'mutate_external');
    assert.equal(npmPublish.intent, 'deploy');
    assert.equal(npmPublish.risk, 'external_write');
    assert.deepEqual(npmPublish.resources.written, [
      { type: 'external_resource', ref: 'package_registry' },
    ]);
    assert.equal(npmPublish.facets.includes('external'), true);
    assert.equal(npmPublish.facets.includes('read_only'), false);

    const emacsParse = byCommand.get('emacs --batch sicp-study-outline.org --eval "(progn (require \'org) (org-mode) (message \\"org parse ok\\"))"');
    assert.ok(emacsParse);
    assert.equal(emacsParse.operation, 'verify');
    assert.equal(emacsParse.intent, 'verify');
    assert.equal(emacsParse.facets.includes('test'), true);

    const emacsCompile = byCommand.get('emacs --batch -Q -f batch-byte-compile /Users/marcus.kim/.emacs.d/init.el');
    assert.ok(emacsCompile);
    assert.equal(emacsCompile.operation, 'build');
    assert.equal(emacsCompile.intent, 'build');
    assert.equal(emacsCompile.facets.includes('package'), true);

    for (const command of [
      'UV_CACHE_DIR=.uv-cache uv run aus-personas pgm seed-profiles --schema aus_personas_dbt --container censusloader-postgres --sa2 213041359 --sample-size 2 --seed 1 --format csv',
      '/Users/marcus.kim/.codex/plugins/cache/openai-curated/superpowers/fef63ecf/skills/brainstorming/scripts/start-server.sh --project-dir /Users/marcus.kim/repositories/individual/iOS/dosets-ios',
    ]) {
      const action = byCommand.get(command);
      assert.ok(action, `expected action for ${command}`);
      assert.equal(action.operation, 'unknown');
      assert.equal(action.intent, 'unknown');
    }
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend assigns low risk to path-only local writes', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'path-only-write',
      sessionId: 'session-path-only',
      turnId: 'turn-path-only',
      eventName: 'PostToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Write',
        tool_input: {
          file_path: 'src/path-only.ts',
          content: 'export const value = 1;',
        },
        tool_response: { ok: true },
      },
    });

    const actions = tokenizeTelemetryActions(kernel, { runId: 'turn-path-only' });

    assert.equal(actions.length, 1);
    assert.equal(actions[0].operation, 'mutate_local');
    assert.equal(actions[0].risk, 'low');
    assert.deepEqual(actions[0].resources.written, [
      { type: 'local_file', ref: 'src/path-only.ts' },
    ]);
  } finally {
    t.cleanup();
  }
});

test('Lyo effect algebra satisfies identity and associativity laws', () => {
  const read = action({
    eventId: 'algebra-read',
    operation: 'observe',
    intent: 'inspect',
    resources: { read: [{ type: 'local_file', ref: 'src/a.ts' }], written: [] },
    facets: ['local', 'read_only'],
    command: { name: 'sed', argvSummary: "sed -n '1,20p' src/a.ts", exitCode: 0 },
  });
  const write = action({
    eventId: 'algebra-write',
    operation: 'mutate_local',
    intent: 'implement',
    resources: { read: [], written: [{ type: 'local_file', ref: 'src/a.ts' }] },
    risk: 'low',
    facets: ['local', 'write'],
  });
  const verify = action({
    eventId: 'algebra-test',
    operation: 'verify',
    intent: 'verify',
    resources: { read: [{ type: 'local_repo', ref: '.' }], written: [] },
    facets: ['local', 'test', 'read_only'],
    command: { name: 'npm', argvSummary: 'npm test', exitCode: 0 },
  });

  const readEffect = actionToEffect(read);
  assert.deepEqual(concatEffects(emptyEffect(), readEffect), readEffect);
  assert.deepEqual(concatEffects(readEffect, emptyEffect()), readEffect);

  const leftAssociated = concatEffects(
    concatEffects(actionToEffect(read), actionToEffect(write)),
    actionToEffect(verify)
  );
  const rightAssociated = concatEffects(
    actionToEffect(read),
    concatEffects(actionToEffect(write), actionToEffect(verify))
  );

  assert.deepEqual(leftAssociated, rightAssociated);
  assert.deepEqual(foldTrace([read, write, verify]), leftAssociated);
  assert.deepEqual(foldTrace([read, write, verify]), foldTrace([read, write, verify]));
  assert.deepEqual(leftAssociated.evidenceRefs, [
    'hook:algebra-read',
    'hook:algebra-write',
    'hook:algebra-test',
  ]);
});

test('Lyo telemetry fixtures build compiled runs without SQLite', () => {
  const edit = action({
    eventId: 'fixture-edit',
    operation: 'mutate_local',
    intent: 'implement',
    resources: { read: [], written: [{ type: 'local_file', ref: 'src/a.ts' }] },
    risk: 'low',
    facets: ['local', 'write'],
  });
  const verifier = action({
    eventId: 'fixture-test',
    operation: 'verify',
    intent: 'verify',
    resources: { read: [{ type: 'local_repo', ref: '.' }], written: [] },
    facets: ['local', 'test', 'read_only'],
    command: { name: 'npm', argvSummary: 'npm test', exitCode: 0 },
  });

  const compiled = compiledTelemetryRun({
    runId: 'fixture-run',
    actions: [edit, verifier],
  });

  assert.equal(compiled.runId, 'fixture-run');
  assert.deepEqual(compiled.episodes.map((episode) => episode.phase), [
    'implementation',
    'passed_verification',
  ]);
  assert.deepEqual(compiled.semantic.verifiers.map((semanticVerifier) => semanticVerifier.command), [
    'npm test',
  ]);
  assert.deepEqual(compiled.semantic.verifiers[0].scopePaths, ['src/a.ts']);
});

test('Lyo effect algebra detects independent, conflicting, and external actions', () => {
  const readA = action({
    eventId: 'read-a',
    operation: 'observe',
    resources: { read: [{ type: 'local_file', ref: 'src/a.ts' }], written: [] },
  });
  const readB = action({
    eventId: 'read-b',
    operation: 'observe',
    resources: { read: [{ type: 'local_file', ref: 'src/b.ts' }], written: [] },
  });
  const writeA = action({
    eventId: 'write-a',
    operation: 'mutate_local',
    intent: 'implement',
    resources: { read: [], written: [{ type: 'local_file', ref: 'src/a.ts' }] },
    risk: 'low',
    facets: ['local', 'write'],
  });
  const externalDeploy = action({
    eventId: 'deploy',
    operation: 'mutate_external',
    intent: 'deploy',
    resources: { read: [], written: [{ type: 'external_resource', ref: 'railway' }] },
    risk: 'deploy',
    facets: ['external', 'cloud', 'deploy', 'write'],
  });

  assert.equal(areIndependent(readA, readB), true);
  assert.equal(areIndependent(readA, readB), areIndependent(readB, readA));
  assert.equal(areConflicting(readA, readB), false);
  assert.equal(areConflicting(readA, readB), !areIndependent(readA, readB));
  assert.equal(areIndependent(readA, writeA), false);
  assert.equal(areIndependent(readA, writeA), areIndependent(writeA, readA));
  assert.equal(areConflicting(readA, writeA), true);
  assert.equal(areConflicting(readA, writeA), !areIndependent(readA, writeA));
  assert.equal(areIndependent(readA, externalDeploy), false);
  assert.equal(areIndependent(readA, externalDeploy), areIndependent(externalDeploy, readA));
  assert.equal(areConflicting(readA, externalDeploy), !areIndependent(readA, externalDeploy));
});

test('Lyo temporal predicates classify verified completion, debugging, approval friction, and unsafe writes', () => {
  const edit = action({
    eventId: 'temporal-edit',
    operation: 'mutate_local',
    intent: 'implement',
    resources: { read: [], written: [{ type: 'local_file', ref: 'src/a.ts' }] },
    risk: 'low',
    facets: ['local', 'write'],
  });
  const failedVerifier = action({
    eventId: 'temporal-test-fail',
    operation: 'verify',
    intent: 'verify',
    resources: { read: [{ type: 'local_repo', ref: '.' }], written: [] },
    status: 'failed',
    facets: ['local', 'test', 'read_only'],
    command: { name: 'npm', argvSummary: 'npm test', exitCode: 1 },
  });
  const inspectAfterFailure = action({
    eventId: 'temporal-inspect',
    operation: 'observe',
    intent: 'inspect',
    resources: { read: [{ type: 'local_file', ref: 'src/a.ts' }], written: [] },
    facets: ['local', 'read_only'],
  });
  const passedVerifier = action({
    eventId: 'temporal-test-pass',
    operation: 'verify',
    intent: 'verify',
    resources: { read: [{ type: 'local_repo', ref: '.' }], written: [] },
    status: 'succeeded',
    facets: ['local', 'test', 'read_only'],
    command: { name: 'npm', argvSummary: 'npm test', exitCode: 0 },
  });
  const deniedApproval = action({
    eventId: 'temporal-approval',
    eventKind: 'approval',
    operation: 'approve',
    intent: 'unknown',
    status: 'denied',
    facets: [],
  });
  const unsafeWrite = action({
    eventId: 'temporal-unsafe',
    operation: 'mutate_local',
    intent: 'implement',
    resources: { read: [], written: [{ type: 'local_file', ref: 'src/a.ts' }] },
    risk: 'destructive',
    facets: ['local', 'write', 'destructive'],
  });

  assert.equal(hasVerifiedCompletion([edit, failedVerifier, inspectAfterFailure, passedVerifier]), true);
  assert.equal(hasVerifiedCompletion([passedVerifier, edit]), false);
  assert.equal(hasDebugging([edit, failedVerifier, inspectAfterFailure, passedVerifier]), true);
  assert.equal(hasDebugging([edit, passedVerifier, inspectAfterFailure]), false);
  assert.equal(hasApprovalFriction([edit, deniedApproval]), true);
  assert.equal(hasApprovalFriction([edit, passedVerifier]), false);
  assert.equal(hasUnsafeWrite([edit, unsafeWrite]), true);
  assert.equal(hasUnsafeWrite([edit, passedVerifier]), false);
  assert.equal(hasStoppedAfterEditWithoutVerification([edit, inspectAfterFailure]), true);
  assert.equal(hasStoppedAfterEditWithoutVerification([edit, failedVerifier]), false);
  assert.equal(hasStoppedAfterEditWithoutVerification([edit, passedVerifier]), false);
});

test('Lyo compiler frontend parses unverified_claim_candidate on Stop right after an Edit', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const sessionId = 'session-2';
    const turnId = 'turn-2';
    const cwd = '/tmp/project';

    recordHookEvent(kernel, {
      eventId: 'event-2-0',
      sessionId,
      turnId,
      eventName: 'UserPromptSubmit',
      cwd,
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: { sha256: 'p-1', length: 50 },
      },
    });

    recordHookEvent(kernel, {
      eventId: 'event-2-1-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-foo\n+bar\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });

    recordHookEvent(kernel, {
      eventId: 'event-2-2',
      sessionId,
      turnId,
      eventName: 'Stop',
      cwd,
      payload: {
        hook_event_name: 'Stop',
      },
    });

    normalizeHooks(kernel);
    const tokens = tokenizeTelemetryRun(kernel, { runId: turnId });
    const episodes = parseTelemetryEpisodes(tokens);

    assert.equal(episodes.length, 3);
    assert.deepEqual(episodes.map(e => e.phase), [
      'orientation',
      'implementation',
      'unverified_claim_candidate'
    ]);
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend classifies read-only sed commands as inspection', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'sed-inspect',
      sessionId: 'session-sed',
      turnId: 'turn-sed',
      eventName: 'PostToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: "sed -n '1,80p' src/compiler/tokenizer.ts" },
        tool_response: { exit_code: 0, stdout: 'source excerpt' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'sed-pipe-inspect',
      sessionId: 'session-sed',
      turnId: 'turn-sed',
      eventName: 'PostToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: "sed -n '1,80p' src/compiler/tokenizer.ts | head" },
        tool_response: { exit_code: 0, stdout: 'source excerpt' },
      },
    });

    const tokens = tokenizeTelemetryRun(kernel, { runId: 'turn-sed' });

    assert.deepEqual(tokens.map((token) => token.kind), ['INSPECT', 'INSPECT']);
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend keeps session fallback from mixing separate turns', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    for (const turnId of ['turn-a', 'turn-b']) {
      recordHookEvent(kernel, {
        eventId: `${turnId}-prompt`,
        sessionId: 'shared-session',
        turnId,
        eventName: 'UserPromptSubmit',
        cwd: '/tmp/project',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: `${turnId}-prompt`, length: 10 },
        },
      });
    }

    assert.equal(tokenizeTelemetryRun(kernel, { runId: 'shared-session' }).length, 0);
    assert.deepEqual(
      tokenizeTelemetryRun(kernel, { runId: 'turn-a' }).map((token) => token.provenance.runId),
      ['turn-a']
    );
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler frontend keeps unmatched pre-tool attempts', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'attempted-test',
      sessionId: 'session-attempt',
      turnId: 'turn-attempt',
      eventName: 'PreToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_use_id: 'tool-attempt-1',
        tool_input: { command: 'npm test' },
      },
    });

    const tokens = tokenizeTelemetryRun(kernel, { runId: 'turn-attempt' });

    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].kind, 'TEST');
    assert.equal(tokens[0].command?.status, 'attempted');
    assert.equal(tokens[0].provenance.toolUseId, 'tool-attempt-1');
  } finally {
    t.cleanup();
  }
});

test('Lyo semantic analyzer extracts policy and risk observations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'risk-external',
      sessionId: 'session-risk',
      turnId: 'turn-risk',
      eventName: 'PostToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'railway up' },
        tool_response: { exit_code: 0, stdout: 'deployed' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'risk-destructive',
      sessionId: 'session-risk',
      turnId: 'turn-risk',
      eventName: 'PostToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf .agent-learning' },
        tool_response: { exit_code: 0, stdout: '' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'policy-attempt',
      sessionId: 'session-risk',
      turnId: 'turn-risk',
      eventName: 'PreToolUse',
      cwd: '/tmp/project',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_use_id: 'attempt-risk-1',
        tool_input: { command: 'npm test' },
      },
    });

    const semantic = analyzeTelemetrySemantics(compileTelemetryRunAst(kernel, { runId: 'turn-risk' }));

    assert.deepEqual(
      semantic.policyObservations.map((observation) => ({
        action: observation.action,
        riskClass: observation.riskClass,
        decision: observation.decision,
      })).sort((left, right) => left.action.localeCompare(right.action)),
      [
        { action: 'npm test', riskClass: 'local_test', decision: 'attempted' },
        { action: 'railway up', riskClass: 'external_deploy', decision: 'allowed' },
        { action: 'rm -rf .agent-learning', riskClass: 'destructive', decision: 'allowed' },
      ]
    );
    assert.deepEqual(
      semantic.riskObservations.map((observation) => ({
        command: observation.command,
        reason: observation.reason,
      })).sort((left, right) => left.command.localeCompare(right.command)),
      [
        { command: 'railway up', reason: 'external_command' },
        { command: 'rm -rf .agent-learning', reason: 'destructive_command' },
      ]
    );
  } finally {
    t.cleanup();
  }
});

test('Lyo compiler backend plans semantic lowering without persistence side effects', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const sessionId = 'session-lower-1';
    const turnId = 'turn-lower-1';
    const cwd = '/tmp/project';

    // 1. User Prompt
    recordHookEvent(kernel, {
      eventId: 'ev-0',
      sessionId,
      turnId,
      eventName: 'UserPromptSubmit',
      cwd,
      payload: {
        hook_event_name: 'UserPromptSubmit',
        prompt: { sha256: 'prompt-lower', length: 30 },
      },
    });

    // 2. PreToolUse + PostToolUse for inspect (rg)
    recordHookEvent(kernel, {
      eventId: 'ev-1-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rg "foo" src/' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-1-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rg "foo" src/' },
        tool_response: { exit_code: 0, stdout: 'match' },
      },
    });

    // 3. Edit (apply_patch)
    recordHookEvent(kernel, {
      eventId: 'ev-2-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-foo\n+bar\n*** End Patch',
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-2-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-foo\n+bar\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });

    // 4. Test fail (npm test)
    recordHookEvent(kernel, {
      eventId: 'ev-3-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-3-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 1, stderr: 'test failed' },
      },
    });

    // 5. Edit 2 (apply_patch)
    recordHookEvent(kernel, {
      eventId: 'ev-4-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-bar\n+baz\n*** End Patch',
        },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-4-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: '*** Begin Patch\n*** Update File: src/main.ts\n@@\n-bar\n+baz\n*** End Patch',
        },
        tool_response: { exit_code: 0 },
      },
    });

    // 6. Test pass (npm test)
    recordHookEvent(kernel, {
      eventId: 'ev-5-pre',
      sessionId,
      turnId,
      eventName: 'PreToolUse',
      cwd,
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-5-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'npm test' },
        tool_response: { exit_code: 0, stdout: 'all passed' },
      },
    });

    // 7. Dangerous and policy-relevant commands for observations
    recordHookEvent(kernel, {
      eventId: 'ev-6-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'railway up' },
        tool_response: { exit_code: 0, stdout: 'deployed' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'ev-7-post',
      sessionId,
      turnId,
      eventName: 'PostToolUse',
      cwd,
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'rm -rf src/' },
        tool_response: { exit_code: 0, stdout: '' },
      },
    });

    normalizeHooks(kernel);

    const telemetry = compileTelemetryRunAst(kernel, { runId: turnId });
    const semantic = analyzeTelemetrySemantics(telemetry);

    // 1. Verify Lowering Plan (Dry-run planning)
    const plan = planSemanticLowering({ telemetry, semantic });

    assert.deepEqual(plan.verifierDrafts, ['npm test verifies src/main.ts']);
    assert.deepEqual(plan.milestoneDrafts, ['verify_src_main_ts completed after 1 failed attempt']);
    assert.deepEqual(plan.procedureDrafts, ['inspect -> edit -> test fail -> debug -> test pass -> inspect -> edit']);
    assert.ok(plan.criticDrafts.includes('if edit happens after failed verifier, classify as debugging and rerun verifier'));
    assert.ok(plan.policyDrafts.includes("local tests/edits can proceed without restriction"));
    assert.deepEqual(
      plan.policyDrafts.filter((draft) => draft.includes('requires explicit approval')).sort(),
      [
        "destructive command 'rm -rf src/' requires explicit approval",
        "external deployment 'railway up' requires explicit approval",
      ]
    );
    assert.equal(plan.policyDrafts.some((draft) => /npm test.*requires explicit approval/.test(draft)), false);
    assert.equal(plan.policyDrafts.some((draft) => /apply_patch.*requires explicit approval/.test(draft)), false);
    assert.ok(plan.contextPackDrafts.some(draft => draft.includes('src/main.ts')));
    assert.deepEqual(
      plan.contextPackDrafts.filter((draft) => draft.startsWith('reusable verification commands:')),
      ['reusable verification commands: npm test']
    );

    const tapeCount = kernel.db.prepare('select count(*) as count from run_tape_cells').get();
    const protocolCount = kernel.db.prepare('select count(*) as count from protocols').get();
    assert.equal(tapeCount.count, 0);
    assert.equal(protocolCount.count, 0);
  } finally {
    t.cleanup();
  }
});
