import assert from 'node:assert/strict';
import test from 'node:test';

import {
  observationEffectsResponse,
  observationLoweringPlanResponse,
  observationReportResponse,
  observationSummaryResponse,
} from '../src/cli/presenters/observation.ts';

test('observation presenter wraps report variants under stable top-level keys', () => {
  assert.deepEqual(observationReportResponse('style', { runId: 'run-1' }), {
    ok: true,
    style: { runId: 'run-1' },
  });
  assert.deepEqual(observationReportResponse('atBat', { runId: 'run-2' }), {
    ok: true,
    atBat: { runId: 'run-2' },
  });
  assert.deepEqual(observationEffectsResponse({ runId: 'run-3' }), {
    ok: true,
    effects: { runId: 'run-3' },
  });
});

test('observation presenter keeps summary and lowering responses explicit', () => {
  assert.deepEqual(observationSummaryResponse({ hookEvents: 2, sessions: 1 }), {
    ok: true,
    hookEvents: 2,
    sessions: 1,
  });
  assert.deepEqual(observationLoweringPlanResponse({ verifierDrafts: ['npm test'] }), {
    ok: true,
    loweringPlan: { verifierDrafts: ['npm test'] },
  });
});
