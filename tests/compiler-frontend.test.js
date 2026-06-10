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
  analyzeTelemetrySemantics,
  planSemanticLowering,
  buildWorkflowStyleReport,
  buildStyleLearningReport,
  buildCandidateAtBatReport,
  buildCyberneticExperimentReport,
  recordModelCall,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-compiler-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function action(overrides) {
  const eventId = overrides.eventId ?? overrides.actionId ?? 'action';
  return {
    actionId: overrides.actionId ?? `act-${eventId}`,
    provenance: {
      eventId,
      eventName: overrides.eventName ?? 'PostToolUse',
      evidenceRef: overrides.evidenceRef ?? `hook:${eventId}`,
      sessionId: 'session-algebra',
      runId: 'turn-algebra',
      cwd: '/tmp/project',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      ordinal: overrides.ordinal ?? 0,
    },
    eventKind: overrides.eventKind ?? 'tool_use',
    operation: overrides.operation ?? 'observe',
    intent: overrides.intent ?? 'inspect',
    resources: overrides.resources ?? { read: [], written: [] },
    risk: overrides.risk ?? 'none',
    status: overrides.status ?? 'succeeded',
    facets: overrides.facets ?? ['local', 'read_only'],
    confidence: overrides.confidence ?? 'high',
    command: overrides.command,
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

test('Lyo workflow style report classifies prompt-driven runs conservatively', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-prompt';
    const sessionId = 'session-style-prompt';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-prompt-01', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-prompt-02', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPrompt(kernel, { eventId: 'style-prompt-03', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-prompt-04', sessionId, runId, cwd, path: 'src/main.ts' });
    recordPrompt(kernel, { eventId: 'style-prompt-05', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-prompt-06', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'prompt_driven');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 3);
    assert.equal(report.metrics.actionCount, 3);
    assert.equal(report.metrics.actionsPerHumanPrompt, 1);
    assert.equal(report.metrics.maxActionsBetweenPrompts, 1);
    assert.equal(report.missingSignals.includes('child agent invocation lineage'), true);
    assert.equal(report.evidence.some((line) => line === 'lineage=inferred_only'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report classifies loop-driven candidates from long verifier-gated traces', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-loop';
    const sessionId = 'session-style-loop';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-loop-01', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-loop-02', sessionId, runId, cwd, path: 'AGENT_LOOP.md' });
    recordPatch(kernel, { eventId: 'style-loop-03', sessionId, runId, cwd, path: 'tests/parser.test.ts' });
    recordPatch(kernel, { eventId: 'style-loop-04', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-loop-05', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-loop-06', sessionId, runId, cwd, command: "sed -n '1,120p' src/parser.ts" });
    recordPatch(kernel, { eventId: 'style-loop-07', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-loop-08', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-loop-09', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'loop_driven_candidate');
    assert.equal(report.confidence, 'high');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 1);
    assert.equal(report.metrics.actionCount, 8);
    assert.equal(report.metrics.maxActionsBetweenPrompts, 8);
    assert.equal(report.metrics.loopArtifactTouches > 0, true);
    assert.equal(report.metrics.testOrValidatorTouches > 0, true);
    assert.equal(report.scores.loopDriven > report.scores.promptDriven, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report does not infer loop-driven style from missing prompt lineage', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-missing-lineage';
    const sessionId = 'session-style-missing-lineage';
    const cwd = '/tmp/project';

    recordPatch(kernel, { eventId: 'style-missing-lineage-01', sessionId, runId, cwd, path: 'AGENT_LOOP.md' });
    recordPatch(kernel, { eventId: 'style-missing-lineage-02', sessionId, runId, cwd, path: 'tests/parser.test.ts' });
    recordPatch(kernel, { eventId: 'style-missing-lineage-03', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-missing-lineage-04', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-missing-lineage-05', sessionId, runId, cwd, command: "sed -n '1,120p' src/parser.ts" });
    recordPatch(kernel, { eventId: 'style-missing-lineage-06', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-missing-lineage-07', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-missing-lineage-08', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'insufficient_evidence');
    assert.equal(report.confidence, 'low');
    assert.equal(report.metrics.humanPromptCount, 0);
    assert.equal(report.metrics.actionCount, 8);
    assert.equal(report.metrics.actionsPerHumanPrompt, null);
    assert.equal(report.metrics.loopArtifactTouches > 0, true);
    assert.equal(report.missingSignals.includes('loop prompt emission event'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report treats long accepted agent sequences as manual orchestration without loop evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-manual-orchestrated';
    const sessionId = 'session-style-manual-orchestrated';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-manual-01', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-manual-02', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPatch(kernel, { eventId: 'style-manual-03', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-manual-04', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-manual-05', sessionId, runId, cwd, command: "sed -n '1,120p' src/main.ts" });
    recordPatch(kernel, { eventId: 'style-manual-06', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-manual-07', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-manual-08', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'manual_orchestrated');
    assert.equal(report.confidence, 'high');
    assert.equal(report.metrics.humanPromptCount, 1);
    assert.equal(report.metrics.actionCount, 7);
    assert.equal(report.metrics.loopArtifactTouches, 0);
    assert.equal(report.scores.manualOrchestration > 0, true);
    assert.equal(report.scores.loopDriven > report.scores.promptDriven, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report classifies mixed prompt and loop infrastructure as loop-assisted', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-assisted';
    const sessionId = 'session-style-assisted';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-assisted-01', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-assisted-02', sessionId, runId, cwd, path: '.codex/prompts/workflow.md' });
    recordCommand(kernel, { eventId: 'style-assisted-03', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPrompt(kernel, { eventId: 'style-assisted-04', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-assisted-05', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-assisted-06', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-assisted-07', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'loop_assisted');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 2);
    assert.equal(report.metrics.specOrDocsTouches > 0, true);
    assert.equal(report.scores.workflowInfrastructure > 0, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report reports insufficient evidence for tiny traces', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-empty';
    const sessionId = 'session-style-empty';
    const cwd = '/tmp/project';

    recordCommand(kernel, { eventId: 'style-empty-01', sessionId, runId, cwd, command: 'pwd' });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'insufficient_evidence');
    assert.equal(report.confidence, 'low');
    assert.equal(report.metrics.humanPromptCount, 0);
    assert.equal(report.lineageMode, 'inferred_only');
  } finally {
    t.cleanup();
  }
});

test('Lyo style learning report aggregates LLM usage and vibecoding style across runs', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const cwd = '/tmp/project';

    recordPrompt(kernel, {
      eventId: 'style-learn-loop-01-prompt',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-02-inspect',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: "sed -n '1,80p' src/main.ts",
    });
    recordPatch(kernel, {
      eventId: 'style-learn-loop-03-edit',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      path: 'src/main.ts',
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-04-test-fail',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: 'npm test',
      exitCode: 1,
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-05-diagnose',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: "sed -n '1,120p' src/main.ts",
    });
    recordPatch(kernel, {
      eventId: 'style-learn-loop-06-fix',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      path: 'src/main.ts',
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-07-test-pass',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: 'npm test',
      exitCode: 0,
    });
    recordModelCall(kernel, {
      callId: 'style-learn-model-loop',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      provider: 'openai',
      model: 'gpt-5',
      modelLane: 'agent',
      inputTokens: 1200,
      outputTokens: 450,
      status: 'completed',
    });

    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-01-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-02-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-03-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPatch(kernel, {
      eventId: 'style-learn-prompt-04-edit',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
      path: 'src/other.ts',
    });
    recordModelCall(kernel, {
      callId: 'style-learn-model-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      modelLane: 'agent',
      inputTokens: 800,
      outputTokens: 300,
      status: 'completed',
    });

    normalizeHooks(kernel);
    const report = buildStyleLearningReport(kernel);

    assert.equal(report.learningVersion, 'lyo/style-learning/v1');
    assert.equal(report.runCount, 2);
    assert.equal(report.modelUsage.totalModelCalls, 2);
    assert.equal(report.modelUsage.totalTokens, 2750);
    assert.deepEqual(report.styleDistribution, {
      promptDriven: 1,
      manualOrchestrated: 1,
      loopAssisted: 0,
      loopDrivenCandidate: 0,
      insufficientEvidence: 0,
    });
    assert.equal(report.aggregateMetrics.runsWithVerifiedEdits, 1);
    assert.equal(report.aggregateMetrics.runsStoppedAfterEditWithoutVerification, 1);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'preserve-verifier-debug-loop'), true);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'critic-require-verifier-after-edit'), true);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'convert-repeated-prompts-to-loop'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report classifies verifier-gated debugging as verified progress', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-verified';
    const sessionId = 'session-at-bat-verified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'at-bat-02-inspect', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPatch(kernel, { eventId: 'at-bat-03-edit', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'at-bat-04-test-fail', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'at-bat-05-diagnose', sessionId, runId, cwd, command: "sed -n '1,120p' src/main.ts" });
    recordPatch(kernel, { eventId: 'at-bat-06-fix', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'at-bat-07-test-pass', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'etl-debugging-v1',
      taskComplexity: 6,
      expectedPattern: 'verifier-first debugging',
      successCriteria: ['targeted verifier passes after the fix'],
      allowedTools: ['Bash', 'apply_patch'],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.reportVersion, 'lyo/candidate-at-bat/v1');
    assert.equal(report.mode, 'evaluate');
    assert.equal(report.runId, runId);
    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.scorecard.verifiedProgress, true);
    assert.equal(report.scorecard.inspectBeforeEdit, true);
    assert.equal(report.scorecard.stoppedAfterEditWithoutVerification, false);
    assert.equal(report.scorecard.failureRecovery, 'strong');
    assert.equal(report.scorecard.claimEvidenceAlignment, 'strong');
    assert.equal(report.conversion.edits, 2);
    assert.equal(report.conversion.verifierRuns, 2);
    assert.equal(report.conversion.verifierPasses, 1);
    assert.deepEqual(report.resourceChurn.writeCountsByResource, {
      'src/main.ts': 2,
    });
    assert.deepEqual(report.resourceChurn.repeatedEditHotspots, ['src/main.ts']);
    assert.equal(report.techniqueSignature.includes('debugger'), true);
    assert.equal(report.techniqueSignature.includes('verifier-first'), true);
    assert.equal(report.evidenceRefs.includes('hook:at-bat-07-test-pass'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report classifies final edits without later verification as unverified claims', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-unverified';
    const sessionId = 'session-at-bat-unverified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-unverified-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-unverified-02-edit', sessionId, runId, cwd, path: 'src/main.ts' });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'etl-debugging-v1',
      taskComplexity: 6,
      expectedPattern: 'verifier-first debugging',
      successCriteria: ['targeted verifier passes after the fix'],
      allowedTools: ['Bash', 'apply_patch'],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.scorecard.verifiedProgress, false);
    assert.equal(report.scorecard.stoppedAfterEditWithoutVerification, true);
    assert.equal(report.scorecard.inspectBeforeEdit, false);
    assert.equal(report.scorecard.failureRecovery, 'not_applicable');
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
    assert.equal(report.conversion.edits, 1);
    assert.equal(report.conversion.verifierRuns, 0);
    assert.equal(report.resourceChurn.writeCountsByResource['src/main.ts'], 1);
    assert.equal(report.limitations.includes('final assistant claim text is not semantically judged in v1'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report records unsupported final done claims', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-final-done-unverified';
    const sessionId = 'session-at-bat-final-done-unverified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-final-done-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-final-done-02-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordStop(kernel, {
      eventId: 'at-bat-final-done-03-stop',
      sessionId,
      runId,
      cwd,
      message: 'Done. I implemented the parser fix.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.finalClaim.posture, 'claims_done');
    assert.equal(report.finalClaim.mentionsVerifier, false);
    assert.equal(report.finalClaim.mentionsBlocker, false);
    assert.equal(report.finalClaim.evidenceRefs.includes('hook:at-bat-final-done-03-stop'), true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
    assert.equal(report.scorecard.cleanStopWithJustification, false);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report records final claims that cite required verifier evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-final-done-verified';
    const sessionId = 'session-at-bat-final-done-verified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-final-verified-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-final-verified-02-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordCommand(kernel, {
      eventId: 'at-bat-final-verified-03-test',
      sessionId,
      runId,
      cwd,
      command: 'pytest tests/test_parser.py',
      exitCode: 0,
    });
    recordStop(kernel, {
      eventId: 'at-bat-final-verified-04-stop',
      sessionId,
      runId,
      cwd,
      message: 'Done. pytest tests/test_parser.py passed after the fix.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.finalClaim.posture, 'cites_evidence');
    assert.equal(report.finalClaim.mentionsVerifier, true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'strong');
    assert.equal(report.shipReadiness, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report treats justified blocker stops without writes as clean stops', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-clean-stop';
    const sessionId = 'session-at-bat-clean-stop';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-clean-stop-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, {
      eventId: 'at-bat-clean-stop-02-inspect',
      sessionId,
      runId,
      cwd,
      command: "sed -n '1,80p' README.md",
      exitCode: 0,
    });
    recordStop(kernel, {
      eventId: 'at-bat-clean-stop-03-stop',
      sessionId,
      runId,
      cwd,
      message: 'Blocked: the task is underspecified and needs the target verifier before I change files.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'clean_stop_with_justification');
    assert.equal(report.finalClaim.posture, 'blocked');
    assert.equal(report.finalClaim.mentionsBlocker, true);
    assert.equal(report.scorecard.cleanStopWithJustification, true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'unknown');
    assert.equal(report.conversion.edits, 0);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report requires explicit task verifier specs, not any passing test', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-ruby-irrelevant';
    const sessionId = 'session-at-bat-ruby-irrelevant';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-ruby-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-ruby-02-edit', sessionId, runId, cwd, path: 'lib/parser.rb' });
    recordCommand(kernel, {
      eventId: 'at-bat-ruby-03-irrelevant-pass',
      sessionId,
      runId,
      cwd,
      command: 'bundle exec rspec spec/other_spec.rb',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'ruby-parser-debugging-v1',
      language: 'ruby',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['parser spec passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'ruby-parser-spec',
        commandPattern: 'bundle exec rspec spec/parser_spec.rb',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.shipReadiness, false);
    assert.equal(report.verifierQuality, 'missing');
    assert.deepEqual(report.missingRequiredVerifiers, ['ruby-parser-spec']);
    assert.deepEqual(report.matchedVerifiers, []);
    assert.equal(report.scorecard.verifiedProgress, false);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report accepts language-specific required verifier passes after the final edit', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-python-required';
    const sessionId = 'session-at-bat-python-required';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-python-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'at-bat-python-02-inspect', sessionId, runId, cwd, command: "sed -n '1,80p' src/parser.py" });
    recordPatch(kernel, { eventId: 'at-bat-python-03-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordCommand(kernel, {
      eventId: 'at-bat-python-04-required-pass',
      sessionId,
      runId,
      cwd,
      command: 'pytest tests/test_parser.py',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.shipReadiness, true);
    assert.equal(report.verifierQuality, 'moderate');
    assert.deepEqual(report.missingRequiredVerifiers, []);
    assert.deepEqual(report.matchedVerifiers.map((verifier) => ({
      id: verifier.id,
      kind: verifier.kind,
      required: verifier.required,
      command: verifier.command,
      passed: verifier.passed,
      freshAfterFinalEdit: verifier.freshAfterFinalEdit,
    })), [{
      id: 'python-parser-test',
      kind: 'targeted',
      required: true,
      command: 'pytest tests/test_parser.py',
      passed: true,
      freshAfterFinalEdit: true,
    }]);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report treats required verifier failure after edit as regression evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-java-regression';
    const sessionId = 'session-at-bat-java-regression';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-java-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-java-02-edit', sessionId, runId, cwd, path: 'src/main/java/Parser.java' });
    recordCommand(kernel, {
      eventId: 'at-bat-java-03-required-fail',
      sessionId,
      runId,
      cwd,
      command: 'mvn test -Dtest=ParserTest',
      exitCode: 1,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'java-parser-debugging-v1',
      language: 'java',
      taskComplexity: 7,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['ParserTest passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'java-parser-test',
        commandPattern: 'mvn test -Dtest=ParserTest',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'regression');
    assert.equal(report.shipReadiness, false);
    assert.equal(report.verifierQuality, 'missing');
    assert.deepEqual(report.missingRequiredVerifiers, ['java-parser-test']);
    assert.equal(report.matchedVerifiers[0].id, 'java-parser-test');
    assert.equal(report.matchedVerifiers[0].passed, false);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report upgrades verifier quality when targeted and broad C++ verifiers pass', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-cpp-strong';
    const sessionId = 'session-at-bat-cpp-strong';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-cpp-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-cpp-02-edit', sessionId, runId, cwd, path: 'src/parser.cpp' });
    recordCommand(kernel, { eventId: 'at-bat-cpp-03-build', sessionId, runId, cwd, command: 'cmake --build build', exitCode: 0 });
    recordCommand(kernel, { eventId: 'at-bat-cpp-04-targeted', sessionId, runId, cwd, command: 'ctest -R parser', exitCode: 0 });
    recordCommand(kernel, { eventId: 'at-bat-cpp-05-broad', sessionId, runId, cwd, command: 'ctest', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'cpp-parser-debugging-v1',
      language: 'cpp',
      taskComplexity: 8,
      expectedPattern: 'build plus targeted and broad tests',
      successCriteria: ['build passes', 'parser test passes', 'full ctest passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [
        {
          id: 'cpp-build',
          commandPattern: 'cmake --build build',
          kind: 'build',
          required: true,
        },
        {
          id: 'cpp-parser-test',
          commandPattern: 'ctest -R parser',
          kind: 'targeted',
          required: true,
        },
        {
          id: 'cpp-full-test',
          commandPattern: 'ctest',
          kind: 'broad',
          required: false,
          matchMode: 'exact',
        },
      ],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.shipReadiness, true);
    assert.equal(report.verifierQuality, 'strong');
    assert.deepEqual(report.matchedVerifiers.map((verifier) => verifier.id), [
      'cpp-build',
      'cpp-parser-test',
      'cpp-full-test',
    ]);
    assert.deepEqual(report.missingRequiredVerifiers, []);
    assert.equal(report.conversion.verifierRuns, 3);
    assert.equal(report.conversion.verifierPasses, 3);
  } finally {
    t.cleanup();
  }
});

test('Lyo cybernetic experiment report credits a delivered verifier artifact across treatment and variant attempts', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const sessionId = 'session-cybernetic-experiment';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'experiment-a0-01-prompt', sessionId, runId: 'experiment-a0', cwd });
    recordPatch(kernel, { eventId: 'experiment-a0-02-edit', sessionId, runId: 'experiment-a0', cwd, path: 'src/compiler/tokenizer.ts' });

    recordPrompt(kernel, { eventId: 'experiment-a1-01-prompt', sessionId, runId: 'experiment-a1', cwd });
    recordPatch(kernel, { eventId: 'experiment-a1-02-edit', sessionId, runId: 'experiment-a1', cwd, path: 'src/compiler/tokenizer.ts' });
    recordCommand(kernel, {
      eventId: 'experiment-a1-03-verifier',
      sessionId,
      runId: 'experiment-a1',
      cwd,
      command: 'node --test tests/compiler-frontend.test.js',
      exitCode: 0,
    });

    recordPrompt(kernel, { eventId: 'experiment-a2-01-prompt', sessionId, runId: 'experiment-a2', cwd });
    recordPatch(kernel, { eventId: 'experiment-a2-02-edit', sessionId, runId: 'experiment-a2', cwd, path: 'src/compiler/workflow-style.ts' });
    recordCommand(kernel, {
      eventId: 'experiment-a2-03-verifier',
      sessionId,
      runId: 'experiment-a2',
      cwd,
      command: 'node --test tests/compiler-frontend.test.js',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const report = buildCyberneticExperimentReport({
      familyId: 'lyo-compiler-classifier-v1',
      attempts: [
        {
          attemptId: 'A0',
          mode: 'baseline',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a0' }),
        },
        {
          attemptId: 'A1',
          mode: 'treatment',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a1' }),
          deliveredArtifacts: ['verifier:compiler-frontend'],
        },
        {
          attemptId: 'A2',
          mode: 'variant',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a2' }),
          deliveredArtifacts: ['verifier:compiler-frontend'],
        },
      ],
      associationEdges: [{
        edge: 'src/compiler/** -> tests/compiler-frontend.test.js',
        artifactId: 'verifier:compiler-frontend',
      }],
      nextExperiment: 'try another compiler module variant',
    });

    assert.equal(report.experimentVersion, 'lyo/cybernetic-learning-experiment/v1');
    assert.equal(report.familyId, 'lyo-compiler-classifier-v1');
    assert.deepEqual(report.attempts.map((attempt) => attempt.attemptId), ['A0', 'A1', 'A2']);
    assert.equal(report.attempts[0].verifiedCompletion, false);
    assert.equal(report.attempts[0].stoppedAfterEditWithoutVerification, true);
    assert.equal(report.attempts[1].verifiedCompletion, true);
    assert.equal(report.attempts[2].verifiedCompletion, true);
    assert.equal(report.deltas.treatmentVsBaseline.runScoreDelta > 0, true);
    assert.equal(report.deltas.variantVsTreatment.runScoreDelta, 0);
    assert.deepEqual(report.associationCredits, [{
      edge: 'src/compiler/** -> tests/compiler-frontend.test.js',
      artifactId: 'verifier:compiler-frontend',
      credit: 1,
      reason: 'delivered artifact was followed by verified completion in treatment and variant attempts',
      evidenceRefs: [
        'hook:experiment-a1-03-verifier',
        'hook:experiment-a2-03-verifier',
      ],
    }]);
    assert.equal(report.decision, 'generalize_candidate');
    assert.equal(report.nextExperiment, 'try another compiler module variant');
  } finally {
    t.cleanup();
  }
});

function recordPrompt(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'UserPromptSubmit',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'UserPromptSubmit',
      prompt: { sha256: `${input.eventId}-prompt`, length: 20 },
    },
  });
}

function recordCommand(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'PostToolUse',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: input.command },
      tool_response: { exit_code: input.exitCode ?? 0, stdout: '' },
    },
  });
}

function recordPatch(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'PostToolUse',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'PostToolUse',
      tool_name: 'apply_patch',
      tool_input: {
        patch: `*** Begin Patch\n*** Update File: ${input.path}\n@@\n-old\n+new\n*** End Patch`,
      },
      tool_response: { exit_code: 0 },
    },
  });
}

function recordStop(kernel, input) {
  recordHookEvent(kernel, {
    eventId: input.eventId,
    sessionId: input.sessionId,
    turnId: input.runId,
    eventName: 'Stop',
    cwd: input.cwd,
    payload: {
      hook_event_name: 'Stop',
      last_assistant_message: input.message,
    },
  });
}
