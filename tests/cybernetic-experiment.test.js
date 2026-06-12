import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  createKernel,
  initLedger,
  recordHookEvent,
  normalizeHooks,
  actionToEffect,
  areConflicting,
  areIndependent,
  concatEffects,
  deriveTelemetryTokens,
  emptyEffect,
  foldTrace,
  hasApprovalFriction,
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
  isEditAction,
  isExternalAction,
  isInspectAction,
  isTestAction,
  tokenizeTelemetryActions,
  tokenizeTelemetryRun,
  parseTelemetryEpisodes,
  compileTelemetryRunAst,
  analyzeTelemetrySemantics,
  planSemanticLowering,
  buildWorkflowStyleReport,
  buildStyleLearningReport,
  buildCandidateAtBatReport,
  buildCyberneticExperimentReport,
  buildExplanationGraphReport,
  computeRivalOutcomeMessage,
  recordModelCall,
} from '../src/index.ts';
import { recordPrompt, recordCommand, recordPatch, recordStop } from './helpers/record.js';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-compiler-'));
  return {
    dir,
    dbPath: join(dir, 'learning.sqlite'),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

function action(overrides) {
  const eventId = overrides.eventId ?? overrides.actionId ?? 'action';
  return {
    actionId: overrides.actionId ?? `act-${eventId}`,
    provenance: {
      eventId,
      eventName: overrides.eventName ?? 'PostToolUse',
      evidenceRef: overrides.evidenceRef ?? `hook:${eventId}`,
      sessionId: 'session-algebra',
      runId: 'turn-algebra',
      cwd: '/tmp/project',
      createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
      ordinal: overrides.ordinal ?? 0,
    },
    eventKind: overrides.eventKind ?? 'tool_use',
    operation: overrides.operation ?? 'observe',
    intent: overrides.intent ?? 'inspect',
    resources: overrides.resources ?? { read: [], written: [] },
    risk: overrides.risk ?? 'none',
    status: overrides.status ?? 'succeeded',
    facets: overrides.facets ?? ['local', 'read_only'],
    confidence: overrides.confidence ?? 'high',
    command: overrides.command,
  };
}

test('Lyo cybernetic experiment report updates association hypotheses from evidence events', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const sessionId = 'session-cybernetic-experiment';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'experiment-a0-01-prompt', sessionId, runId: 'experiment-a0', cwd });
    recordPatch(kernel, { eventId: 'experiment-a0-02-edit', sessionId, runId: 'experiment-a0', cwd, path: 'src/compiler/tokenizer.ts' });

    recordPrompt(kernel, { eventId: 'experiment-a1-01-prompt', sessionId, runId: 'experiment-a1', cwd });
    recordPatch(kernel, { eventId: 'experiment-a1-02-edit', sessionId, runId: 'experiment-a1', cwd, path: 'src/compiler/tokenizer.ts' });
    recordCommand(kernel, {
      eventId: 'experiment-a1-03-verifier',
      sessionId,
      runId: 'experiment-a1',
      cwd,
      command: 'node --test tests/compiler-frontend.test.js',
      exitCode: 0,
    });

    recordPrompt(kernel, { eventId: 'experiment-a2-01-prompt', sessionId, runId: 'experiment-a2', cwd });
    recordPatch(kernel, { eventId: 'experiment-a2-02-edit', sessionId, runId: 'experiment-a2', cwd, path: 'src/compiler/workflow-style.ts' });
    recordCommand(kernel, {
      eventId: 'experiment-a2-03-verifier',
      sessionId,
      runId: 'experiment-a2',
      cwd,
      command: 'node --test tests/compiler-frontend.test.js',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const report = buildCyberneticExperimentReport({
      familyId: 'lyo-compiler-classifier-v1',
      attempts: [
        {
          attemptId: 'A0',
          mode: 'baseline',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a0' }),
        },
        {
          attemptId: 'A1',
          mode: 'treatment',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a1' }),
          deliveredArtifacts: ['verifier:compiler-frontend'],
        },
        {
          attemptId: 'A2',
          mode: 'variant',
          telemetry: compileTelemetryRunAst(kernel, { runId: 'experiment-a2' }),
          deliveredArtifacts: ['verifier:compiler-frontend'],
        },
      ],
      associationEdges: [{
        edge: 'src/compiler/** -> tests/compiler-frontend.test.js',
        artifactId: 'verifier:compiler-frontend',
      }],
      nextExperiment: 'try another compiler module variant',
    });

    assert.equal(report.experimentVersion, 'lyo/cybernetic-learning-experiment/v1');
    assert.equal(report.familyId, 'lyo-compiler-classifier-v1');
    assert.deepEqual(report.attempts.map((attempt) => attempt.attemptId), ['A0', 'A1', 'A2']);
    assert.equal(report.attempts[0].verifiedCompletion, false);
    assert.equal(report.attempts[0].stoppedAfterEditWithoutVerification, true);
    assert.equal(report.attempts[1].verifiedCompletion, true);
    assert.equal(report.attempts[2].verifiedCompletion, true);
    assert.equal(report.deltas.treatmentVsBaseline.runScoreDelta > 0, true);
    assert.equal(report.deltas.variantVsTreatment.runScoreDelta, 0);
    assert.deepEqual(report.associationHypotheses, [{
      id: 'hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js',
      source: 'src/compiler/**',
      relation: 'verified_by',
      target: 'tests/compiler-frontend.test.js',
      scope: 'lyo-compiler-classifier-v1',
      artifactId: 'verifier:compiler-frontend',
      predictedConsequences: [
        'fresh passing verifier evidence after a related source activation',
      ],
      prerequisites: [
        'artifact is delivered into the attempt',
        'source scope is activated before the predicted consequence',
      ],
      knownDefeaters: [
        'artifact was delivered but source scope was not activated',
        'verifier failed after source activation without recovery',
        'run stopped after local mutation without a later verifier',
        'unsafe write occurred in the attempt',
      ],
      credibility: 'credible',
      evidenceEventIds: [
        'ev-A1-hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js',
        'ev-A2-hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js',
      ],
    }]);
    assert.deepEqual(report.evidenceEvents.map((event) => ({
      evidenceEventId: event.evidenceEventId,
      runId: event.runId,
      credibilityEffect: event.credibilityEffect,
      polyaPattern: event.polyaPattern,
      consequenceFreshness: event.consequenceFreshness,
      sourceWasActivated: event.sourceWasActivated,
      defeatersPresent: event.defeatersPresent,
      provenanceRefs: event.provenanceRefs,
    })), [
      {
        evidenceEventId: 'ev-A1-hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js',
        runId: 'experiment-a1',
        credibilityEffect: 'supports',
        polyaPattern: 'verifying_consequence',
        consequenceFreshness: 'fresh_after_source',
        sourceWasActivated: true,
        defeatersPresent: [],
        provenanceRefs: ['hook:experiment-a1-03-verifier'],
      },
      {
        evidenceEventId: 'ev-A2-hyp-verifier-compiler-frontend-src-compiler-tests-compiler-frontend-test-js',
        runId: 'experiment-a2',
        credibilityEffect: 'supports',
        polyaPattern: 'successive_varied_consequence',
        consequenceFreshness: 'fresh_after_source',
        sourceWasActivated: true,
        defeatersPresent: [],
        provenanceRefs: ['hook:experiment-a2-03-verifier'],
      },
    ]);
    assert.equal(report.decision, 'generalize_candidate');
    assert.equal(report.nextExperiment, 'try another compiler module variant');
  } finally {
    t.cleanup();
  }
});
