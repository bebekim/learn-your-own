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

test('Lyo explanation graph computes provisional belief from factor messages', () => {
  const report = buildExplanationGraphReport({
    hypothesis: {
      id: 'hyp-compiler-verifier',
      label: 'changes under src/compiler/** are usefully verified by tests/compiler-frontend.test.js',
    },
    prior: { notH: 0.75, h: 0.25 },
    factors: [
      {
        factorId: 'scope_match',
        label: 'source scope matched before verifier',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.60],
          h: [0.20, 1],
        },
      },
      {
        factorId: 'chronology',
        label: 'verifier happened after source activation',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.50],
          h: [0.10, 1],
        },
      },
      {
        factorId: 'verifier_passed',
        label: 'predicted verifier passed',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.30],
          h: [0.10, 1],
        },
      },
      {
        factorId: 'freshness',
        label: 'verifier was fresh after the relevant source change',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.70],
          h: [0.20, 1],
        },
      },
      {
        factorId: 'no_defeater',
        label: 'no known defeater was present',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.80],
          h: [0.20, 1],
        },
      },
      {
        factorId: 'no_rival',
        label: 'no stronger rival explanation was present',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.85],
          h: [0.20, 1],
        },
      },
      {
        factorId: 'independent_evidence',
        label: 'evidence was not merely a duplicate of prior evidence',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.80],
          h: [0.20, 1],
        },
      },
    ],
  });

  assert.equal(report.explanationGraphVersion, 'lyo/explanation-graph/v1');
  assert.equal(report.hypothesis.id, 'hyp-compiler-verifier');
  assert.deepEqual(report.factorMessages.map((message) => message.message), [
    { notH: 0.6, h: 1 },
    { notH: 0.5, h: 1 },
    { notH: 0.3, h: 1 },
    { notH: 0.7, h: 1 },
    { notH: 0.8, h: 1 },
    { notH: 0.85, h: 1 },
    { notH: 0.8, h: 1 },
  ]);
  assert.equal(report.unnormalized.notH, 0.025704);
  assert.equal(report.unnormalized.h, 0.25);
  assert.equal(Number(report.belief.h.toFixed(4)), 0.9068);
  assert.equal(Number(report.belief.notH.toFixed(4)), 0.0932);
  assert.equal(report.credibility, 'provisionally_supported');
});

test('Lyo explanation graph sums over rival explanations before updating credibility', () => {
  const message = computeRivalOutcomeMessage({
    outcomeId: 'fresh_verifier_pass',
    rivals: [
      {
        rivalId: 'none',
        prior: 0.60,
        likelihood: { notH: 0.20, h: 0.80 },
      },
      {
        rivalId: 'repo_already_healthy',
        prior: 0.25,
        likelihood: { notH: 0.85, h: 0.90 },
      },
      {
        rivalId: 'user_manual_correction',
        prior: 0.15,
        likelihood: { notH: 0.75, h: 0.85 },
      },
    ],
  });

  assert.equal(message.outcomeId, 'fresh_verifier_pass');
  assert.deepEqual(message.rivalPriors, {
    none: 0.6,
    repo_already_healthy: 0.25,
    user_manual_correction: 0.15,
  });
  assert.deepEqual(message.message, { notH: 0.445, h: 0.8325 });
});

test('Lyo explanation graph includes rival outcome messages in report belief updates', () => {
  const report = buildExplanationGraphReport({
    hypothesis: {
      id: 'hyp-outcome-with-rivals',
      label: 'fresh verifier pass is explained by the delivered artifact',
    },
    prior: { notH: 0.75, h: 0.25 },
    factors: [],
    rivalOutcomes: [{
      outcomeId: 'fresh_verifier_pass',
      rivals: [
        {
          rivalId: 'none',
          prior: 0.60,
          likelihood: { notH: 0.20, h: 0.80 },
        },
        {
          rivalId: 'repo_already_healthy',
          prior: 0.25,
          likelihood: { notH: 0.85, h: 0.90 },
        },
        {
          rivalId: 'user_manual_correction',
          prior: 0.15,
          likelihood: { notH: 0.75, h: 0.85 },
        },
      ],
    }],
  });

  assert.deepEqual(report.rivalOutcomeMessages.map((message) => message.message), [
    { notH: 0.445, h: 0.8325 },
  ]);
  assert.equal(report.unnormalized.notH, 0.33375);
  assert.equal(report.unnormalized.h, 0.208125);
  assert.equal(Number(report.belief.h.toFixed(4)), 0.3841);
  assert.equal(report.credibility, 'weakened');
});
