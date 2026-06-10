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
  ensureNectrWorkspaceDefaults,
  deriveZoneActivationsForJob,
  deriveZoneCoactivationsForJob,
  recommendZoneAssociations,
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
      zoneId: 'deploy_command',
      workspaceId: 'nectr',
      zoneKind: 'deployment',
      name: 'deploy',
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
      commandName: 'releasectl',
      argv: 'releasectl deploy --target dev token=secret-value',
    });
    assert.equal(command.classification, 'unknown');
    assert.equal(command.argvSummary.includes('secret-value'), false);

    recordDeploymentAction(kernel, {
      jobId: 'REP-123',
      commandId: command.commandId,
      provider: 'release-system',
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
      ['core', 'deploy_command', 'engineering']
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

test('old passive hook ledgers upgrade to activation-capable schemas without losing rows', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    kernel.db.exec(`
      create table hook_events (
        event_id text primary key,
        session_id text not null,
        turn_id text,
        event_name text not null,
        cwd text not null,
        model text,
        payload_json text not null,
        created_at text not null
      );
      insert into hook_events (
        event_id, session_id, turn_id, event_name, cwd, model, payload_json, created_at
      )
      values (
        'hook-old', 'session-old', 'turn-old', 'PreToolUse', '/tmp/nectr_data_eng',
        'gpt-test', '{}', '2026-05-20T00:00:00.000Z'
      );
    `);

    initLedger(kernel);

    const hookCount = kernel.db.prepare('select count(*) as count from hook_events').get().count;
    const lyoVersionColumn = kernel.db.prepare('pragma table_info(hook_events)').all()
      .some((column) => column.name === 'lyo_version');
    const workspace = recordWorkspace(kernel, {
      workspaceId: 'nectr_data_eng',
      rootPath: '/tmp/nectr_data_eng',
      name: 'nectr_data_eng',
    });
    recordJob(kernel, {
      jobId: 'old-ledger-job',
      workspaceId: workspace.workspaceId,
    });

    assert.equal(hookCount, 1);
    assert.equal(lyoVersionColumn, true);
    assert.equal(workspace.workspaceId, 'nectr_data_eng');
  } finally {
    t.cleanup();
  }
});

test('Nectr workspace defaults map passive data engineering activity across zones', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const preset = ensureNectrWorkspaceDefaults(kernel, {
      rootPath: '/Users/marcus.kim/repositories/work/nectr_data_eng',
    });
    assert.equal(preset.workspace.workspaceId, 'nectr_data_eng');
    assert.deepEqual(
      preset.zones.map((zone) => zone.name).sort(),
      ['artifacts', 'business_logic', 'checks', 'docs', 'guardrails', 'platform_core', 'specs', 'tools']
    );

    recordJob(kernel, {
      jobId: 'nectr-passive-job',
      workspaceId: 'nectr_data_eng',
      taskShape: 'databricks-migration',
      status: 'completed',
    });
    recordPathActivation(kernel, {
      jobId: 'nectr-passive-job',
      path: 'nectr_data_engineering/domains/customer_billing/model.sql',
      activationKind: 'file_written',
      evidenceRef: 'hook:business',
    });
    recordPathActivation(kernel, {
      jobId: 'nectr-passive-job',
      path: 'nectr_data_eng_core/configs/customer_billing.yml',
      activationKind: 'file_read',
      evidenceRef: 'hook:core',
    });

    deriveZoneActivationsForJob(kernel, { jobId: 'nectr-passive-job' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'nectr-passive-job' });
    updateZoneAssociationsFromJob(kernel, {
      jobId: 'nectr-passive-job',
      outcome: 'positive',
    });

    const recommendations = recommendZoneAssociations(kernel, {
      workspaceId: 'nectr_data_eng',
      seedZoneIds: ['nectr_data_eng:business_logic'],
    });

    assert.equal(recommendations[0].targetZoneId, 'nectr_data_eng:platform_core');
    assert.equal(recommendations[0].targetZoneName, 'platform_core');
    assert.equal(recommendations[0].localEvidence, true);
    assert.deepEqual(recommendations[0].evidenceJobIds, ['nectr-passive-job']);
  } finally {
    t.cleanup();
  }
});

test('negative association evidence suppresses risky Nectr recommendations', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    ensureNectrWorkspaceDefaults(kernel, {
      rootPath: '/Users/marcus.kim/repositories/work/nectr_data_eng',
    });

    recordJob(kernel, {
      jobId: 'positive-platform-job',
      workspaceId: 'nectr_data_eng',
      status: 'completed',
    });
    recordPathActivation(kernel, {
      jobId: 'positive-platform-job',
      path: 'nectr_data_engineering/domains/retail/model.sql',
      activationKind: 'file_written',
    });
    recordPathActivation(kernel, {
      jobId: 'positive-platform-job',
      path: 'nectr_data_eng_core/configs/retail.yml',
      activationKind: 'file_read',
    });
    deriveZoneActivationsForJob(kernel, { jobId: 'positive-platform-job' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'positive-platform-job' });
    updateZoneAssociationsFromJob(kernel, {
      jobId: 'positive-platform-job',
      outcome: 'positive',
    });

    recordJob(kernel, {
      jobId: 'negative-checks-job',
      workspaceId: 'nectr_data_eng',
      status: 'failed',
    });
    recordPathActivation(kernel, {
      jobId: 'negative-checks-job',
      path: 'nectr_data_engineering/domains/retail/model.sql',
      activationKind: 'file_written',
    });
    recordPathActivation(kernel, {
      jobId: 'negative-checks-job',
      path: 'checks/legacy_probe.py',
      activationKind: 'file_read',
    });
    deriveZoneActivationsForJob(kernel, { jobId: 'negative-checks-job' });
    deriveZoneCoactivationsForJob(kernel, { jobId: 'negative-checks-job' });
    updateZoneAssociationsFromJob(kernel, {
      jobId: 'negative-checks-job',
      outcome: 'negative',
    });

    const recommendations = recommendZoneAssociations(kernel, {
      workspaceId: 'nectr_data_eng',
      seedZoneIds: ['nectr_data_eng:business_logic'],
    });
    const riskyRecommendations = recommendZoneAssociations(kernel, {
      workspaceId: 'nectr_data_eng',
      seedZoneIds: ['nectr_data_eng:business_logic'],
      includeNonPositive: true,
    });

    assert.equal(recommendations.some((item) => item.targetZoneId === 'nectr_data_eng:checks'), false);
    assert.equal(recommendations[0].targetZoneId, 'nectr_data_eng:platform_core');
    const checks = riskyRecommendations.find((item) => item.targetZoneId === 'nectr_data_eng:checks');
    assert.equal(checks.riskRate, 1);
    assert.equal(checks.score, 0);
  } finally {
    t.cleanup();
  }
});
