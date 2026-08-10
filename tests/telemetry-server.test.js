import test from 'node:test';
import assert from 'node:assert/strict';
import { closeKernel, createKernel } from '../src/ledger.ts';
import { initLedger } from '../src/schema.ts';
import { startTelemetryServer } from '../src/telemetry/server.ts';

test('local telemetry server accepts canonical events and deduplicates event ids', async (t) => {
  const kernel = createKernel({ dbPath: ':memory:' });
  initLedger(kernel);
  let service;
  try {
    service = await startTelemetryServer(kernel, { port: 0 });
  } catch (error) {
    closeKernel(kernel);
    if (error?.code === 'EPERM') {
      t.skip('sandbox does not permit localhost binds');
      return;
    }
    throw error;
  }
  try {
    const health = await fetch(`http://${service.host}:${service.port}/health`);
    assert.equal(health.status, 200);
    const response = await fetch(`http://${service.host}:${service.port}/v1/telemetry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([
        {
          schema: 'lyo.telemetry.v1',
          eventId: 'server:event-1',
          runId: 'run-1',
          source: 'shepherd',
          kind: 'command',
          occurredAt: '2026-08-11T00:00:00.000Z',
          payload: { command: 'npm test' },
        },
        {
          schema: 'lyo.telemetry.v1',
          eventId: 'server:event-1',
          runId: 'run-1',
          source: 'shepherd',
          kind: 'command',
          occurredAt: '2026-08-11T00:00:00.000Z',
          payload: { command: 'npm test' },
        },
      ]),
    });
    assert.equal(response.status, 202);
    assert.equal(kernel.db.prepare('select count(*) as count from hook_events').get().count, 1);
    assert.equal(kernel.db.prepare('select count(*) as count from command_activations').get().count, 1);
  } finally {
    await service.close();
    closeKernel(kernel);
  }
});
