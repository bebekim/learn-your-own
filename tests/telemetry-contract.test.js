import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeTelemetry,
  encodeTelemetry,
  compileTelemetryArtifact,
  nativeHookToTelemetry,
  shepherdExportToTelemetry,
  summarizeTelemetry,
  shepherdEffectToTelemetry,
} from '../src/index.ts';

test('canonical telemetry round-trips native and Shepherd events', () => {
  const events = [
    nativeHookToTelemetry({
      eventId: 'native-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      eventName: 'UserPromptSubmit',
      cwd: '/tmp/project',
      payload: { prompt: 'fix it' },
    }, '2026-08-10T00:00:00.000Z'),
    shepherdEffectToTelemetry({
      eventId: 'shepherd-1',
      runId: 'run-1',
      effectType: 'FilePatch',
      occurredAt: '2026-08-10T00:00:01.000Z',
      payload: { path: 'src/main.ts' },
    }),
  ];

  assert.deepEqual(decodeTelemetry(encodeTelemetry(events)), events);
  assert.equal(events[0].source, 'native');
  assert.equal(events[0].kind, 'prompt');
  assert.equal(events[1].source, 'shepherd');
  assert.equal(events[1].kind, 'file');
  assert.deepEqual(summarizeTelemetry(events), {
    events: 2,
    runs: 2,
    bySource: { native: 1, shepherd: 1 },
    byKind: { prompt: 1, file: 1 },
  });
});

test('telemetry parser rejects a different schema', () => {
  assert.throws(() => decodeTelemetry('{"schema":"other","eventId":"x"}'), /unsupported telemetry schema/);
});

test('Shepherd flat and trajectory exports become canonical telemetry', () => {
  const flat = shepherdExportToTelemetry(JSON.stringify({
    total_effects: 1,
    timeline: [{
      _sequence: 4,
      effect_type: 'file_patch',
      path: 'src/main.ts',
      timestamp: 1_756_339_200,
    }],
  }), 'run-flat');
  const trajectory = shepherdExportToTelemetry(JSON.stringify({
    effect: {
      effect_type: 'prompt_sent',
      timestamp: 1_756_339_201,
      user_prompt: 'fix it',
    },
    sequence: 5,
  }), 'run-trajectory');

  assert.equal(flat[0].source, 'shepherd');
  assert.equal(flat[0].kind, 'file');
  assert.equal(flat[0].runId, 'run-flat');
  assert.equal(trajectory[0].kind, 'prompt');
  assert.equal(trajectory[0].evidenceRef, 'shepherd:run-trajectory:5');
});

test('canonical Shepherd telemetry compiles through Lyo episodes and semantics', () => {
  const events = shepherdExportToTelemetry(JSON.stringify({ timeline: [
    { effect_type: 'prompt_sent', user_prompt: 'fix it', timestamp: 1_756_339_200 },
    { effect_type: 'file_patch', path: 'src/main.ts', timestamp: 1_756_339_201 },
    { effect_type: 'task_completed', timestamp: 1_756_339_202 },
  ] }), 'run-compile');
  const compiled = compileTelemetryArtifact(events);

  assert.ok(compiled.actions.length >= 2);
  assert.ok(compiled.episodes.length >= 1);
});
