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

