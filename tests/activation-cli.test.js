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

    const report = runLyoJson(['activation', 'report', '--db', dbPath, '--job-id', 'REP-456']);
    assert.equal(report.ok, true);
    assert.equal(report.pathActivations.length, 2);
    assert.equal(report.zoneCoactivations.length, 1);

    const associations = runLyoJson(['zone', 'associations', '--db', dbPath, '--workspace-id', 'nectr']);
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

    runLyo(['codex-hook', '--db', dbPath],
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

    const normalized = runLyoJson(['normalize', 'hooks', '--db', dbPath, '--workspace-id', 'demo']);
    assert.equal(normalized.ok, true);
    assert.equal(normalized.processedEvents, 2);
    assert.equal(normalized.pathActivations, 1);
    assert.equal(normalized.commandActivations, 1);
    assert.equal(normalized.zoneCoactivations, 1);

    const report = runLyoJson(['activation', 'report', '--db', dbPath, '--job-id', normalized.jobs[0]]);
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
      ]));
    assert.equal(initialized.ok, true);
    assert.equal(initialized.workspace.workspaceId, 'nectr_data_eng');
    assert.equal(initialized.zones.length, 8);

    runLyo(['codex-hook', '--db', dbPath, '--no-normalize-on-tool-use'],
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
      ]));
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
