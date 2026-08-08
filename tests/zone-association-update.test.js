import assert from 'node:assert/strict';
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

/**
 * Bug: INSERT OR IGNORE in derivation.ts skips the UPDATE when the same
 * (association_id, job_id) pair is observed again. This means if a job's
 * outcome changes (e.g. from 'unknown' to 'negative' after more events
 * arrive), the association counters never get updated.
 *
 * Fix: use INSERT ... ON CONFLICT DO UPDATE to update the observation's
 * outcome, and adjust association counters based on the outcome delta.
 */
test('re-normalizing same job updates outcome from unknown to negative', () => {
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

    // First batch: two path reads (no commands yet) → outcome is 'unknown'
    recordHookEvent(kernel, {
      eventId: 'hook-read-src',
      sessionId: 'session-1',
      turnId: 'turn-1',
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
      sessionId: 'session-1',
      turnId: 'turn-1',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });

    const firstPass = normalizeHooks(kernel);
    assert.equal(firstPass.zoneCoactivations, 1);
    assert.equal(firstPass.associations, 1);

    let report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    let assoc = report[0];
    assert.ok(assoc, 'expected association after first pass');
    assert.equal(assoc.supportCount, 1);
    assert.equal(assoc.positiveOutcomes, 0);
    assert.equal(assoc.negativeOutcomes, 0);
    // unknownOutcomes is derived: support - positive - negative
    const unknownAfterFirst = assoc.supportCount - assoc.positiveOutcomes - assoc.negativeOutcomes;
    assert.equal(unknownAfterFirst, 1);

    // Second batch: a failed command arrives for the SAME job (same session+turn).
    // This changes the job's outcome from 'unknown' to 'negative'.
    recordHookEvent(kernel, {
      eventId: 'hook-bash-fail',
      sessionId: 'session-1',
      turnId: 'turn-1',
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

    const secondPass = normalizeHooks(kernel);
    assert.equal(secondPass.commandActivations, 1);
    assert.equal(secondPass.associations, 1);

    report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    assoc = report[0];
    assert.ok(assoc, 'expected association after second pass');
    // support_count should NOT double — it's the same job
    assert.equal(assoc.supportCount, 1);
    // But outcome should now be negative, not unknown
    assert.equal(assoc.negativeOutcomes, 1);
    assert.equal(assoc.positiveOutcomes, 0);
    const unknownAfterSecond = assoc.supportCount - assoc.positiveOutcomes - assoc.negativeOutcomes;
    assert.equal(unknownAfterSecond, 0);
  } finally {
    t.cleanup();
  }
});

test('re-normalizing same job updates outcome from unknown to positive', () => {
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

    // First batch: path reads only → unknown
    recordHookEvent(kernel, {
      eventId: 'hook-read-src',
      sessionId: 'session-2',
      turnId: 'turn-2',
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
      sessionId: 'session-2',
      turnId: 'turn-2',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo2',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });

    normalizeHooks(kernel);

    let report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    assert.equal(report[0].supportCount, 1);
    assert.equal(report[0].positiveOutcomes, 0);
    assert.equal(report[0].negativeOutcomes, 0);

    // Second batch: successful command → outcome becomes positive
    recordHookEvent(kernel, {
      eventId: 'hook-bash-ok',
      sessionId: 'session-2',
      turnId: 'turn-2',
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

    normalizeHooks(kernel);

    report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    const assoc = report[0];
    assert.equal(assoc.supportCount, 1);
    assert.equal(assoc.positiveOutcomes, 1);
    assert.equal(assoc.negativeOutcomes, 0);
  } finally {
    t.cleanup();
  }
});

test('re-normalizing same job does not double-count support_count', () => {
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

    // Single batch with all events (including a successful command)
    recordHookEvent(kernel, {
      eventId: 'hook-read-src',
      sessionId: 'session-3',
      turnId: 'turn-3',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo3',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/index.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-read-tests',
      sessionId: 'session-3',
      turnId: 'turn-3',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo3',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'tests/test.ts' },
      },
    });
    recordHookEvent(kernel, {
      eventId: 'hook-bash-ok',
      sessionId: 'session-3',
      turnId: 'turn-3',
      eventName: 'PostToolUse',
      cwd: '/tmp/demo3',
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

    normalizeHooks(kernel);

    let report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    assert.equal(report[0].supportCount, 1);
    assert.equal(report[0].positiveOutcomes, 1);

    // Add another event for the same job and re-normalize.
    // The job already has a positive outcome; the extra event shouldn't
    // change support_count (same job) or double-count positives.
    recordHookEvent(kernel, {
      eventId: 'hook-read-extra',
      sessionId: 'session-3',
      turnId: 'turn-3',
      eventName: 'PreToolUse',
      cwd: '/tmp/demo3',
      payload: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Read',
        tool_input: { file_path: 'src/extra.ts' },
      },
    });

    normalizeHooks(kernel);

    report = getZoneAssociationReport(kernel, { workspaceId: workspace.workspaceId });
    const assoc = report[0];
    assert.equal(assoc.supportCount, 1, 'support_count should not double for same job');
    assert.equal(assoc.positiveOutcomes, 1, 'positive_outcomes should not double');
  } finally {
    t.cleanup();
  }
});
