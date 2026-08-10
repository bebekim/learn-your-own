import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeKernel, createKernel } from '../src/ledger.ts';
import { initLedger } from '../src/schema.ts';
import { consumeTelemetryOutbox } from '../src/telemetry/outbox.ts';

test('Shepherd outbox consumption persists and acknowledges exactly once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-outbox-'));
  const outbox = join(dir, 'lyo-outbox.ndjson');
  const dbPath = join(dir, 'learning.sqlite');
  writeFileSync(outbox, `${JSON.stringify({
    schema: 'lyo.telemetry.v1',
    eventId: 'shepherd:event-1',
    runId: 'run-1',
    source: 'shepherd',
    kind: 'command',
    occurredAt: '2026-08-10T00:00:00.000Z',
    payload: { command: 'npm test', cwd: dir },
  })}\n`);

  const kernel = createKernel({ dbPath });
  initLedger(kernel);
  try {
    const first = consumeTelemetryOutbox(kernel, { outboxPath: outbox });
    const second = consumeTelemetryOutbox(kernel, { outboxPath: outbox });
    assert.equal(first.events, 1);
    assert.equal(second.events, 0);
    assert.equal(kernel.db.prepare('select count(*) as count from hook_events').get().count, 1);
    assert.equal(kernel.db.prepare('select count(*) as count from command_activations').get().count, 1);
    assert.equal(kernel.db.prepare('select byte_offset as offset from telemetry_cursors').get().offset, first.acknowledgedOffset);
  } finally {
    closeKernel(kernel);
  }
});
