import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordWorkspace,
  recordZone,
  recordHookEvent,
  normalizeHooks,
  getZoneAssociationReport,
} from '../src/index.ts';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-kernel-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test('zone association tracks negative outcome when command fails', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const workspace = recordWorkspace(kernel, {
      workspaceId: 'demo',
      rootPath: '/tmp/demo',
      name: 'demo',
    });
    recordZone(kernel, {
      zoneId: 'zone_a',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'src/**',
      name: 'src',
    });
    recordZone(kernel, {
      zoneId: 'zone_b',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'tests/**',
      name: 'tests',
    });

    // Three hook events in the same job:
    // - Read of src/index.ts → activates zone_a (src/**)
    // - Read of tests/test.ts → activates zone_b (tests/**)
    // - Bash that fails → provides the negative outcome signal
    // The two path activations create a zone coactivation; the failed command
    // makes the association outcome negative.
    recordHookEvent(kernel, {
      eventId: 'hook-read-src',
      sessionId: 'session-neg',
      turnId: 'turn-neg',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-read-tests',
      sessionId: 'session-neg',
      turnId: 'turn-neg',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-bash-fail',
      sessionId: 'session-neg',
      turnId: 'turn-neg',
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
    assert.equal(normalized.processedEvents, 3);
    assert.equal(normalized.commandActivations, 1);
    assert.equal(normalized.zoneCoactivations, 1);
    assert.equal(normalized.associations, 1);

    // The job has a failed command, so the association outcome should be negative.
    const report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    console.log('NEG TEST report.length:', report.length);
    if (report.length > 0) console.log('NEG TEST report[0]:', JSON.stringify(report[0]));
    const assoc = report[0];
    assert.ok(assoc, 'expected at least one zone association');
    assert.ok(
      assoc.negativeOutcomes > 0,
      `expected negativeOutcomes > 0, got ${assoc.negativeOutcomes}`
    );
    assert.equal(assoc.positiveOutcomes, 0);
  } finally {
    t.cleanup();
  }
});

test('zone association tracks positive outcome when all commands succeed', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const workspace = recordWorkspace(kernel, {
      workspaceId: 'demo2',
      rootPath: '/tmp/demo2',
      name: 'demo2',
    });
    recordZone(kernel, {
      zoneId: 'zone_a',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'src/**',
      name: 'src',
    });
    recordZone(kernel, {
      zoneId: 'zone_b',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'tests/**',
      name: 'tests',
    });

    // Three hook events in the same job:
    // - Read of src/index.ts → activates zone_a (src/**)
    // - Read of tests/test.ts → activates zone_b (tests/**)
    // - Bash that succeeds → provides the positive outcome signal
    recordHookEvent(kernel, {
      eventId: 'hook-read-src',
      sessionId: 'session-pos',
      turnId: 'turn-pos',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo2',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-read-tests',
      sessionId: 'session-pos',
      turnId: 'turn-pos',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo2',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-bash-ok',
      sessionId: 'session-pos',
      turnId: 'turn-pos',
      eventName: 'PostToolUse',
      cwd: '/tmp/demo2',
      payload: {
        hook_event_name: 'PostToolUse',
        tool_name: 'Bash',
        tool_input: { command: 'node --version' },
        tool_response: {
          exit_code: 0,
          stdout: 'v24.0.0\n',
        },
      },
    });

    const normalized = normalizeHooks(kernel);
    assert.equal(normalized.processedEvents, 3);
    assert.equal(normalized.commandActivations, 1);
    assert.equal(normalized.zoneCoactivations, 1);
    assert.equal(normalized.associations, 1);

    const report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    const assoc = report[0];
    assert.ok(assoc, 'expected at least one zone association');
    assert.ok(
      assoc.positiveOutcomes > 0,
      `expected positiveOutcomes > 0, got ${assoc.positiveOutcomes}`
    );
    assert.equal(assoc.negativeOutcomes, 0);
  } finally {
    t.cleanup();
  }
});

test('zone association stays unknown when job has no commands', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);

    const workspace = recordWorkspace(kernel, {
      workspaceId: 'demo3',
      rootPath: '/tmp/demo3',
      name: 'demo3',
    });
    recordZone(kernel, {
      zoneId: 'zone_a',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'src/**',
      name: 'src',
    });
    recordZone(kernel, {
      zoneId: 'zone_b',
      workspaceId: workspace.workspaceId,
      zoneKind: 'code',
      pathGlob: 'tests/**',
      name: 'tests',
    });

    // Only path activations, no commands — outcome should stay unknown.
    recordHookEvent(kernel, {
      eventId: 'hook-read-a',
      sessionId: 'session-unk',
      turnId: 'turn-unk',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo3',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-read-b',
      sessionId: 'session-unk',
      turnId: 'turn-unk',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo3',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });

    const normalized = normalizeHooks(kernel);
    assert.equal(normalized.processedEvents, 2);
    assert.equal(normalized.commandActivations, 0);
    // Two zones co-activated via path activations.
    assert.equal(normalized.zoneCoactivations, 1);
    assert.equal(normalized.associations, 1);

    const report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    const assoc = report[0];
    assert.ok(assoc, 'expected at least one zone association');
    // No commands at all → unknown
    assert.equal(assoc.positiveOutcomes, 0);
    assert.equal(assoc.negativeOutcomes, 0);
  } finally {
    t.cleanup();
  }
});
