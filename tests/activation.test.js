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

