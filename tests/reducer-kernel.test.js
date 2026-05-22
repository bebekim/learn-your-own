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

test('createKernel configures file-backed SQLite for concurrent hook writers', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const timeout = kernel.db.prepare('pragma busy_timeout').get();
    const journal = kernel.db.prepare('pragma journal_mode').get();

    assert.equal(timeout.timeout, 10000);
    assert.equal(journal.journal_mode, 'wal');
    kernel.db.close();
  } finally {
    t.cleanup();
  }
});

test('fixture replay protocol is promoted only after evidence and improves credit when followed', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordRun(kernel, {
      runId: 'run-1',
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      status: 'failed',
      tokenCost: 1200,
    });
    const gap1 = recordGap(kernel, {
      runId: 'run-1',
      kind: 'missing-fixture-replay',
      summary: 'Extraction prompt changed without replaying fixture images.',
      evidenceRef: 'review:run-1',
      status: 'observed',
    });

    const protocol = proposeProtocol(kernel, {
      protocolId: 'fixture_replay_gate',
      title: 'Fixture replay gate',
      scopeKind: 'channel',
      scopeValue: 'function.vision.extraction',
      action: 'Run baseline and post-change fixture replay before claiming extraction prompt success.',
      proposedBy: 'test',
    });

    assert.throws(
      () => promoteProtocol(kernel, { protocolId: protocol.protocolId }),
      /requires at least 2 evidence items/
    );

    recordRun(kernel, {
      runId: 'run-2',
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      status: 'failed',
      tokenCost: 900,
    });
    const gap2 = recordGap(kernel, {
      runId: 'run-2',
      kind: 'missing-fixture-replay',
      summary: 'Second extraction prompt edit skipped fixture replay.',
      evidenceRef: 'review:run-2',
      status: 'observed',
    });

    promoteProtocol(kernel, {
      protocolId: 'fixture_replay_gate',
      evidenceIds: [gap1.gapId, gap2.gapId],
      promotedBy: 'frontier-review',
    });

    const overlay = resolveProtocol(kernel, {
      taskShape: 'prompt-change',
      channel: 'function.vision.extraction',
      runId: 'run-3',
    });

    assert.equal(overlay.protocols.length, 1);
    assert.equal(overlay.protocols[0].protocolId, 'fixture_replay_gate');
    assert.equal(overlay.deliveryId, 'delivery-run-3-fixture_replay_gate');

    const outcome = recordOutcome(kernel, {
      deliveryId: overlay.deliveryId,
      runId: 'run-3',
      followed: true,
      defectRepeated: false,
      verified: true,
      costBand: 'low',
    });

    assert.equal(outcome.creditDelta, 20);
    assert.equal(getCredit(kernel).adaptiveCredit, 20);
  } finally {
    t.cleanup();
  }
});

test('model calls record provider, lane, prompt metadata, tokens, cost, and latency', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const call = recordModelCall(kernel, {
      callId: 'call-1',
      sessionId: 'session-1',
      runId: 'run-1',
      provider: 'openai',
      model: 'gpt-test-high',
      modelLane: 'high',
      promptRef: '.agent-learning/prompts/prompt-1.txt',
      promptText: 'Explain the reducer flow.',
      promptSummary: 'Explain reducer flow',
      inputTokens: 120,
      outputTokens: 80,
      estimatedCost: 0.0125,
      latencyMs: 3400,
      status: 'completed',
    });

    assert.equal(call.callId, 'call-1');
    assert.equal(call.provider, 'openai');
    assert.equal(call.modelLane, 'high');
    assert.equal(call.promptRef, '.agent-learning/prompts/prompt-1.txt');
    assert.equal(call.promptHash.length, 64);
    assert.equal(call.totalTokens, 200);
    assert.equal(call.estimatedCost, 0.0125);

    const summary = getModelCallSummary(kernel);
    assert.equal(summary.modelCalls, 1);
    assert.equal(summary.totalModelTokens, 200);
    assert.equal(summary.estimatedModelCost, 0.0125);
  } finally {
    t.cleanup();
  }
});

test('workspace activation records zones, commands, deployments, coactivations, and associations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const workspace = recordWorkspace(kernel, {
      workspaceId: 'nectr',
      rootPath: '/tmp/nectr_data_eng',
      name: 'nectr_data_eng',
    });
    assert.equal(workspace.workspaceId, 'nectr');

    recordZone(kernel, {
      zoneId: 'core',
      workspaceId: 'nectr',
      zoneKind: 'config',
      pathGlob: 'nectr_data_eng_core/**',
      name: 'core',
    });
    recordZone(kernel, {
      zoneId: 'engineering',
      workspaceId: 'nectr',
      zoneKind: 'domain',
      pathGlob: 'nectr_data_engineering/**',
      name: 'engineering',
    });
    recordZone(kernel, {
      zoneId: 'databricks_deploy',
      workspaceId: 'nectr',
      zoneKind: 'deployment',
      name: 'databricks_deploy',
    });

    recordJob(kernel, {
      jobId: 'REP-123',
      workspaceId: 'nectr',
      taskShape: 'data-platform-change',
      summary: 'Change pipeline config and deploy.',
      sourceRef: 'ticket:REP-123',
    });

    recordPathActivation(kernel, {
      jobId: 'REP-123',
      path: 'nectr_data_eng_core/config.yml',
      activationKind: 'file_written',
    });
    recordPathActivation(kernel, {
      jobId: 'REP-123',
      path: 'nectr_data_engineering/pipelines/foo.py',
      activationKind: 'file_written',
    });
    const command = recordCommandActivation(kernel, {
      jobId: 'REP-123',
      commandName: 'databricks',
      argv: 'databricks bundle deploy -t dev token=secret-value',
    });
    assert.equal(command.classification, 'deploy');
    assert.equal(command.argvSummary.includes('secret-value'), false);

    recordDeploymentAction(kernel, {
      jobId: 'REP-123',
      commandId: command.commandId,
      provider: 'databricks',
      environment: 'dev',
      status: 'succeeded',
    });

    deriveZoneActivationsForJob(kernel, { jobId: 'REP-123' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'REP-123' });
    const associations = updateZoneAssociationsFromJob(kernel, {
      jobId: 'REP-123',
      outcome: 'positive',
    });

    const report = getJobActivationReport(kernel, { jobId: 'REP-123' });
    assert.equal(report.pathActivations.length, 2);
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.deploymentActions.length, 1);
    assert.deepEqual(
      [...new Set(report.zoneActivations.map((activation) => activation.zoneId))].sort(),
      ['core', 'databricks_deploy', 'engineering']
    );
    assert.equal(report.zoneCoactivations.length, 3);
    assert.equal(associations.length, 3);

    const zoneAssociations = getZoneAssociationReport(kernel, {
      workspaceId: 'nectr',
      zoneId: 'core',
    });
    assert.equal(zoneAssociations.length, 2);
    assert.equal(zoneAssociations[0].supportCount, 1);
    assert.equal(zoneAssociations[0].positiveOutcomes, 1);

    updateZoneAssociationsFromJob(kernel, {
      jobId: 'REP-123',
      outcome: 'positive',
    });
    const idempotentAssociations = getZoneAssociationReport(kernel, {
      workspaceId: 'nectr',
      zoneId: 'core',
    });
    assert.equal(idempotentAssociations[0].supportCount, 1);
    assert.equal(idempotentAssociations[0].positiveOutcomes, 1);
  } finally {
    t.cleanup();
  }
});

test('command activation status keeps terminal evidence over attempted observations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    recordWorkspace(kernel, {
      workspaceId: 'demo',
      rootPath: '/tmp/demo',
      name: 'demo',
    });
    recordJob(kernel, {
      jobId: 'job-status-order',
      workspaceId: 'demo',
      taskShape: 'codex-hook-turn',
      summary: 'Status ordering',
      sourceRef: 'test',
      status: 'started',
    });

    recordCommandActivation(kernel, {
      jobId: 'job-status-order',
      commandName: 'node',
      argv: 'node --test',
      status: 'succeeded',
      outputSize: 2,
    });
    const command = recordCommandActivation(kernel, {
      jobId: 'job-status-order',
      commandName: 'node',
      argv: 'node --test',
      status: 'attempted',
      outputSize: 0,
    });

    assert.equal(command.status, 'succeeded');
    assert.equal(command.outputSize, 2);
    assert.equal(command.occurrenceCount, 2);
  } finally {
    t.cleanup();
  }
});

test('zone association report normalizes high-traffic zones', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordWorkspace(kernel, {
      workspaceId: 'demo',
      rootPath: '/tmp/demo',
      name: 'demo',
    });
    recordZone(kernel, {
      zoneId: 'core',
      workspaceId: 'demo',
      zoneKind: 'config',
      pathGlob: 'core/**',
      name: 'core',
    });
    recordZone(kernel, {
      zoneId: 'domain',
      workspaceId: 'demo',
      zoneKind: 'domain',
      pathGlob: 'domain/**',
      name: 'domain',
    });

    recordJob(kernel, {
      jobId: 'job-coupled',
      workspaceId: 'demo',
    });
    recordPathActivation(kernel, {
      jobId: 'job-coupled',
      path: 'core/settings.yml',
      activationKind: 'file_written',
    });
    recordPathActivation(kernel, {
      jobId: 'job-coupled',
      path: 'domain/service.rb',
      activationKind: 'file_written',
    });
    deriveZoneActivationsForJob(kernel, { jobId: 'job-coupled' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'job-coupled' });
    updateZoneAssociationsFromJob(kernel, { jobId: 'job-coupled', outcome: 'positive' });

    recordJob(kernel, {
      jobId: 'job-core-only',
      workspaceId: 'demo',
    });
    recordPathActivation(kernel, {
      jobId: 'job-core-only',
      path: 'core/other.yml',
      activationKind: 'file_written',
    });
    deriveZoneActivationsForJob(kernel, { jobId: 'job-core-only' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'job-core-only' });

    const report = getJobActivationReport(kernel, { jobId: 'job-coupled' });
    assert.deepEqual(report.summary.paths.byKind, { file_written: 2 });
    assert.deepEqual(report.summary.zones.byZoneId, { core: 1, domain: 1 });
    assert.equal(report.summary.zones.uniqueZones, 2);

    const [association] = getZoneAssociationReport(kernel, {
      workspaceId: 'demo',
      zoneId: 'core',
    });
    assert.equal(association.supportCount, 1);
    assert.equal(association.leftActivationCount + association.rightActivationCount, 3);
    assert.equal(association.coactivationSupport, 1);
    assert.equal(association.successRate, 1);
    assert.equal(association.riskRate, 0);
    assert.equal(association.unknownOutcomes, 0);
    assert.equal(association.jaccardWeight, 0.5);
    assert.equal(Math.round(association.normalizedWeight * 1000) / 1000, 0.707);
  } finally {
    t.cleanup();
  }
});

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

test('activation report includes association support and zone strength evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordWorkspace(kernel, {
      workspaceId: 'demo',
      rootPath: '/tmp/demo',
      name: 'demo',
    });
    recordZone(kernel, {
      zoneId: 'core',
      workspaceId: 'demo',
      zoneKind: 'config',
      pathGlob: 'core/**',
      name: 'core',
    });
    recordZone(kernel, {
      zoneId: 'domain',
      workspaceId: 'demo',
      zoneKind: 'domain',
      pathGlob: 'domain/**',
      name: 'domain',
    });
    recordJob(kernel, {
      jobId: 'job-report',
      workspaceId: 'demo',
    });
    recordPathActivation(kernel, {
      jobId: 'job-report',
      path: 'core/settings.yml',
      activationKind: 'file_written',
      evidenceRef: 'hook:core',
      confidence: 'high',
    });
    recordPathActivation(kernel, {
      jobId: 'job-report',
      path: 'domain/service.rb',
      activationKind: 'file_read',
      evidenceRef: 'hook:domain',
      confidence: 'medium',
    });
    deriveZoneActivationsForJob(kernel, { jobId: 'job-report' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'job-report' });
    updateZoneAssociationsFromJob(kernel, { jobId: 'job-report', outcome: 'positive' });

    const report = getJobActivationReport(kernel, { jobId: 'job-report' });
    assert.equal(report.associations.length, 1);
    assert.equal(report.associations[0].supportCount, 1);
    assert.equal(report.associations[0].positiveOutcomes, 1);
    assert.deepEqual(report.summary.zones.strengthByZoneId, { core: 1.5, domain: 1 });
    assert.deepEqual(report.summary.zones.byConfidence, { high: 1, medium: 1 });
    assert.deepEqual(report.summary.evidenceRefs, ['hook:core', 'hook:domain']);
  } finally {
    t.cleanup();
  }
});

test('Codex Stop hook normalizes pending hook events by default', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    recordWorkspace(kernel, {
      workspaceId: 'demo',
      rootPath: '/tmp/demo',
      name: 'demo',
    });
    recordZone(kernel, {
      zoneId: 'src',
      workspaceId: 'demo',
      zoneKind: 'domain',
      pathGlob: 'src/**',
      name: 'src',
    });
    recordZone(kernel, {
      zoneId: 'node_test',
      workspaceId: 'demo',
      zoneKind: 'external_command',
      name: 'node_test',
    });

    handleCodexHook(kernel, {
      session_id: 'session-stop',
      turn_id: 'turn-stop',
      cwd: '/tmp/demo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Read',
      tool_input: { file_path: 'src/index.ts' },
    }, { normalizeWorkspaceId: 'demo' });
    handleCodexHook(kernel, {
      session_id: 'session-stop',
      turn_id: 'turn-stop',
      cwd: '/tmp/demo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
    }, { normalizeWorkspaceId: 'demo' });
    handleCodexHook(kernel, {
      session_id: 'session-stop',
      turn_id: 'turn-stop',
      cwd: '/tmp/demo',
      hook_event_name: 'Stop',
      last_assistant_message: 'Finished running tests.',
    }, { normalizeWorkspaceId: 'demo' });

    const normalizedAgain = normalizeHooks(kernel, { workspaceId: 'demo' });
    assert.equal(normalizedAgain.processedEvents, 0);

    const jobId = hookJobId('session-stop', 'turn-stop');
    const report = getJobActivationReport(kernel, { jobId });
    assert.equal(report.pathActivations.length, 1);
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.zoneCoactivations.length, 1);
  } finally {
    t.cleanup();
  }
});

test('Codex PostToolUse hook normalizes pending tool events by default', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    handleCodexHook(kernel, {
      session_id: 'session-post-tool',
      turn_id: 'turn-post-tool',
      cwd: '/tmp/demo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
    });
    handleCodexHook(kernel, {
      session_id: 'session-post-tool',
      turn_id: 'turn-post-tool',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
      tool_response: {
        exit_code: 0,
        stdout: 'ok',
      },
    });

    const normalizedAgain = normalizeHooks(kernel);
    assert.equal(normalizedAgain.processedEvents, 0);

    const report = getJobActivationReport(kernel, { jobId: hookJobId('session-post-tool', 'turn-post-tool') });
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.commandActivations[0].status, 'succeeded');
    assert.equal(report.commandActivations[0].outputSize, 2);
  } finally {
    t.cleanup();
  }
});

test('Codex hook spool captures events without opening SQLite', () => {
  const t = tempDb();
  try {
    const spoolDir = join(t.dir, 'hook-spool');
    const packet = spoolCodexHookEvent({
      session_id: 'session-spool',
      turn_id: 'turn-spool',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
      tool_response: {
        exit_code: 0,
        stdout: 'ok',
      },
    }, { spoolDir });

    assert.equal(packet.eventName, 'PostToolUse');
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 1);
    assert.equal(existsSync(t.dbPath), false);
  } finally {
    t.cleanup();
  }
});

test('hook spool drain records events and runs reducer normalization', () => {
  const t = tempDb();
  try {
    const spoolDir = join(t.dir, 'hook-spool');
    spoolCodexHookEvent({
      session_id: 'session-spool-drain',
      turn_id: 'turn-spool-drain',
      cwd: '/tmp/demo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
    }, { spoolDir });
    spoolCodexHookEvent({
      session_id: 'session-spool-drain',
      turn_id: 'turn-spool-drain',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
      tool_response: {
        exit_code: 0,
        stdout: 'ok',
      },
    }, { spoolDir });

    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const drained = drainHookSpool(kernel, {
      spoolDir,
      normalize: true,
    });

    assert.equal(drained.processedPackets, 2);
    assert.equal(drained.failedPackets, 0);
    assert.equal(drained.hookEvents, 2);
    assert.equal(drained.normalized.processedEvents, 2);
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 0);

    const report = getJobActivationReport(kernel, {
      jobId: hookJobId('session-spool-drain', 'turn-spool-drain'),
    });
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.commandActivations[0].status, 'succeeded');
    assert.equal(report.commandActivations[0].outputSize, 2);
  } finally {
    t.cleanup();
  }
});

test('hook spool drain isolates malformed packets without blocking valid packets', () => {
  const t = tempDb();
  try {
    const spoolDir = join(t.dir, 'hook-spool');
    const incomingDir = join(spoolDir, 'incoming');
    mkdirSync(incomingDir, { recursive: true });
    writeFileSync(join(incomingDir, '000-malformed.json'), '{not json', 'utf8');
    spoolCodexHookEvent({
      session_id: 'session-spool-malformed',
      turn_id: 'turn-spool-malformed',
      cwd: '/tmp/demo',
      hook_event_name: 'PreToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
    }, { spoolDir });

    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const drained = drainHookSpool(kernel, { spoolDir });

    assert.equal(drained.processedPackets, 1);
    assert.equal(drained.failedPackets, 1);
    assert.equal(drained.requeuedPackets, 0);
    assert.equal(readdirSync(join(spoolDir, 'incoming')).length, 0);
    assert.equal(readdirSync(join(spoolDir, 'failed')).length, 1);
    assert.equal(readdirSync(join(spoolDir, 'processed')).length, 1);
  } finally {
    t.cleanup();
  }
});

test('Codex hook redacts large tool responses while preserving output size', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    handleCodexHook(kernel, {
      session_id: 'session-large-response',
      turn_id: 'turn-large-response',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'rg example' },
      tool_response: {
        exit_code: 0,
        stdout: 'x'.repeat(250_000),
      },
    });

    const row = kernel.db.prepare(`
      select payload_json as payloadJson
      from hook_events
      where session_id = 'session-large-response'
    `).get();
    const payload = JSON.parse(row.payloadJson);
    assert.equal(payload.tool_response.recorded, false);
    assert.equal(payload.tool_response.truncated, true);
    assert.equal(payload.tool_response.output_size, 250000);
    assert.equal(typeof payload.tool_response.sha256, 'string');
    assert.ok(row.payloadJson.length < 1000);
  } finally {
    t.cleanup();
  }
});

test('Codex adapter records canonical hook event names with runtime metadata', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    handleCodexHook(kernel, {
      session_id: 'session-canonical',
      turn_id: 'turn-canonical',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_input: { command: 'node --test' },
      tool_response: {
        exit_code: 0,
        stdout: 'ok',
      },
    });

    const row = kernel.db.prepare(`
      select event_name as eventName, payload_json as payloadJson
      from hook_events
      where session_id = 'session-canonical'
    `).get();
    const payload = JSON.parse(row.payloadJson);
    assert.equal(row.eventName, 'tool.after');
    assert.equal(payload._lyo.runtime, 'codex');
    assert.equal(payload._lyo.runtime_event_name, 'PostToolUse');
    assert.equal(payload._lyo.canonical_event_name, 'tool.after');
  } finally {
    t.cleanup();
  }
});

test('Claude adapter records tool failures and normalizes failed commands', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    handleClaudeHook(kernel, {
      session_id: 'claude-session-failure',
      turn_id: 'claude-turn-failure',
      cwd: '/tmp/demo',
      hook_event_name: 'PostToolUseFailure',
      model: 'claude-test',
      tool_name: 'Bash',
      tool_input: { command: 'npm test' },
      tool_response: {
        exit_code: 1,
        stderr: 'test failed',
      },
    });

    const row = kernel.db.prepare(`
      select event_name as eventName, payload_json as payloadJson
      from hook_events
      where session_id = 'claude-session-failure'
    `).get();
    const payload = JSON.parse(row.payloadJson);
    assert.equal(row.eventName, 'tool.failure');
    assert.equal(payload._lyo.runtime, 'claude');
    assert.equal(payload._lyo.runtime_event_name, 'PostToolUseFailure');
    assert.equal(payload._lyo.canonical_event_name, 'tool.failure');

    const report = getJobActivationReport(kernel, {
      jobId: `claude-job-${createHash('sha256').update('claude-session-failure:claude-turn-failure').digest('hex').slice(0, 16)}`,
    });
    assert.equal(report.commandActivations.length, 1);
    assert.equal(report.commandActivations[0].classification, 'test');
    assert.equal(report.commandActivations[0].status, 'failed');
  } finally {
    t.cleanup();
  }
});
