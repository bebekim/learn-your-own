import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordRun,
  recordGap,
  proposeProtocol,
  promoteProtocol,
  resolveProtocol,
  recordOutcome,
  getCredit,
  recordModelCall,
  getModelCallSummary,
  recordWorkspace,
  recordZone,
  recordJob,
  recordPathActivation,
  recordCommandActivation,
  recordDeploymentAction,
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  updateZoneAssociationsFromJob,
  getJobActivationReport,
  getZoneAssociationReport,
  recordHookEvent,
  normalizeHooks,
  handleCodexHook,
  handleClaudeHook,
  spoolCodexHookEvent,
  drainHookSpool,
} from '../src/index.ts';
import { classifyHookEvent } from '../src/hooks/normalizer.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-kernel-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function hookJobId(sessionId, turnId) {
  return `codex-job-${createHash('sha256').update(`${sessionId}:${turnId ?? 'session'}`).digest('hex').slice(0, 16)}`;
}

test('hook normalizer passively records command, deployment, path, and zone activations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const workspace = recordWorkspace(kernel, {
      workspaceId: 'nectr',
      rootPath: '/tmp/nectr_data_eng',
      name: 'nectr_data_eng',
    });
    recordZone(kernel, {
      zoneId: 'core',
      workspaceId: workspace.workspaceId,
      zoneKind: 'config',
      pathGlob: 'nectr_data_eng_core/**',
      name: 'core',
    });
    recordZone(kernel, {
      zoneId: 'databricks_deploy',
      workspaceId: workspace.workspaceId,
      zoneKind: 'deployment',
      name: 'databricks_deploy',
    });

    recordHookEvent(kernel, {
      eventId: 'hook-read',
      sessionId: 'session-1',
      turnId: 'turn-1',
      eventName: 'PreToolUse',
      cwd: '/tmp/nectr_data_eng',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'nectr_data_eng_core/config.yml' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-bash',
      sessionId: 'session-1',
      turnId: 'turn-1',
      eventName: 'PreToolUse',
      cwd: '/tmp/nectr_data_eng',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'databricks bundle deploy -t dev token=secret-value' },
      },
    });

    const normalized = normalizeHooks(kernel, { outcome: 'positive' });
    assert.equal(normalized.processedEvents, 2);
    assert.equal(normalized.pathActivations, 1);
    assert.equal(normalized.commandActivations, 1);
    assert.equal(normalized.deploymentActions, 1);
    assert.equal(normalized.zoneCoactivations, 1);

    const report = getJobActivationReport(kernel, { jobId: normalized.jobs[0] });
    assert.equal(report.commandActivations[0].classification, 'deploy');
    assert.equal(report.commandActivations[0].argvSummary.includes('secret-value'), false);
    assert.deepEqual(
      [...new Set(report.zoneActivations.map((activation) => activation.zoneId))].sort(),
      ['core', 'databricks_deploy']
    );

    const secondPass = normalizeHooks(kernel);
    assert.equal(secondPass.processedEvents, 0);
  } finally {
    t.cleanup();
  }
});

test('hook classifier turns a stored hook row into behavioral facts without SQLite writes', () => {
  const classified = classifyHookEvent({
    eventId: 'hook-classifier',
    sessionId: 'session-classifier',
    turnId: 'turn-classifier',
    eventName: 'PostToolUse',
    cwd: '/tmp/demo',
    payloadJson: JSON.stringify({
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: {
        command: 'databricks bundle deploy -t dev token=secret-value',
      },
      tool_response: {
        exit_code: 0,
        stdout: 'deployed\n',
      },
    }),
  });

  assert.equal(classified.jobId, hookJobId('session-classifier', 'turn-classifier'));
  assert.equal(classified.evidenceRef, 'hook:hook-classifier');
  assert.equal(classified.commands.length, 1);
  assert.equal(classified.commands[0].commandName, 'databricks');
  assert.equal(classified.commands[0].classification, 'deploy');
  assert.equal(classified.commands[0].status, 'succeeded');
  assert.equal(classified.commands[0].phase, 'fix');
  assert.equal(classified.commands[0].argvSummary.includes('secret-value'), false);
  assert.equal(classified.commands[0].outputSize, 9);
  assert.deepEqual(classified.commands[0].deployment, {
    provider: 'databricks',
    environment: 'dev',
    target: null,
    status: 'succeeded',
  });
  assert.deepEqual(classified.paths, []);
});

test('hook normalizer records failed shell PostToolUse status', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      sessionId: 'session-failure',
      turnId: 'turn-failure',
      eventName: 'PostToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'node --test' },
        tool_response: {
          exit_code: 1,
          stderr: 'not ok',
        },
      },
    });

    const normalized = normalizeHooks(kernel);
    const report = getJobActivationReport(kernel, { jobId: normalized.jobs[0] });
    assert.equal(report.commandActivations[0].status, 'failed');
  } finally {
    t.cleanup();
  }
});

test('hook normalizer extracts patch file kinds, repeated paths, and behavior phases', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordHookEvent(kernel, {
      eventId: 'hook-read-1',
      sessionId: 'session-patch',
      turnId: 'turn-patch',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-read-2',
      sessionId: 'session-patch',
      turnId: 'turn-patch',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-patch',
      sessionId: 'session-patch',
      turnId: 'turn-patch',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'apply_patch',
        tool_input: {
          patch: [
            '*** Begin Patch',
            '*** Update File: src/index.ts',
            '@@',
            '-old',
            '+new',
            '*** Add File: tests/new.test.js',
            '+test',
            '*** Delete File: stale.txt',
            '*** End Patch',
          ].join('\n'),
        },
      },
    });

    const normalized = normalizeHooks(kernel);
    const report = getJobActivationReport(kernel, { jobId: normalized.jobs[0] });
    const facts = report.pathActivations.map((activation) => [
      activation.path,
      activation.activationKind,
      activation.phase,
    ]).sort();
    assert.deepEqual(facts, [
      ['src/index.ts', 'file_read', 'explore'],
      ['src/index.ts', 'file_read', 'explore'],
      ['src/index.ts', 'file_written', 'fix'],
      ['stale.txt', 'file_deleted', 'fix'],
      ['tests/new.test.js', 'file_created', 'fix'],
    ]);
    assert.deepEqual(report.summary.paths.byPhase, { explore: 2, fix: 3 });
    assert.deepEqual(report.summary.paths.repeated, [
      { path: 'src/index.ts', activationKind: 'file_read', count: 2 },
    ]);
    assert.deepEqual(report.summary.evidenceRefs, ['hook:hook-patch', 'hook:hook-read-1', 'hook:hook-read-2']);
  } finally {
    t.cleanup();
  }
});

test('hook normalizer records shell output size, repeated commands, and validate phase', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    for (const eventId of ['hook-test-1', 'hook-test-2']) {
      recordHookEvent(kernel, {
        eventId,
        sessionId: 'session-test',
        turnId: 'turn-test',
        eventName: 'PostToolUse',
          cwd: '/tmp/demo',
          payload: {
            hook_event_name: 'PostToolUse',
            tool_name: 'Bash',
          tool_input: { command: 'pnpm exec vitest run' },
            tool_response: {
              exit_code: 0,
              stdout: 'ok\n',
            stderr: 'warn\n',
          },
        },
      });
    }

    const normalized = normalizeHooks(kernel);
    const report = getJobActivationReport(kernel, { jobId: normalized.jobs[0] });
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.commandActivations[0].classification, 'test');
    assert.equal(report.commandActivations[0].status, 'succeeded');
    assert.equal(report.commandActivations[0].phase, 'validate');
    assert.equal(report.commandActivations[0].outputSize, 8);
    assert.equal(report.commandActivations[0].occurrenceCount, 2);
    assert.deepEqual(report.summary.commands.byPhase, { validate: 1 });
    assert.equal(report.summary.commands.totalOutputSize, 8);
    assert.deepEqual(report.summary.commands.repeated, [
      {
        commandName: 'pnpm',
        argvSummary: 'pnpm exec vitest run',
        count: 2,
      },
    ]);
  } finally {
    t.cleanup();
  }
});

