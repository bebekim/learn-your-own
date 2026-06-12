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

test('Lyo workflow style report classifies prompt-driven runs conservatively', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-prompt';
    const sessionId = 'session-style-prompt';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-prompt-01', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-prompt-02', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPrompt(kernel, { eventId: 'style-prompt-03', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-prompt-04', sessionId, runId, cwd, path: 'src/main.ts' });
    recordPrompt(kernel, { eventId: 'style-prompt-05', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-prompt-06', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'prompt_driven');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 3);
    assert.equal(report.metrics.actionCount, 3);
    assert.equal(report.metrics.actionsPerHumanPrompt, 1);
    assert.equal(report.metrics.maxActionsBetweenPrompts, 1);
    assert.equal(report.missingSignals.includes('child agent invocation lineage'), true);
    assert.equal(report.evidence.some((line) => line === 'lineage=inferred_only'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report classifies loop-driven candidates from long verifier-gated traces', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-loop';
    const sessionId = 'session-style-loop';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-loop-01', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-loop-02', sessionId, runId, cwd, path: 'AGENT_LOOP.md' });
    recordPatch(kernel, { eventId: 'style-loop-03', sessionId, runId, cwd, path: 'tests/parser.test.ts' });
    recordPatch(kernel, { eventId: 'style-loop-04', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-loop-05', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-loop-06', sessionId, runId, cwd, command: "sed -n '1,120p' src/parser.ts" });
    recordPatch(kernel, { eventId: 'style-loop-07', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-loop-08', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-loop-09', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'loop_driven_candidate');
    assert.equal(report.confidence, 'high');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 1);
    assert.equal(report.metrics.actionCount, 8);
    assert.equal(report.metrics.maxActionsBetweenPrompts, 8);
    assert.equal(report.metrics.loopArtifactTouches > 0, true);
    assert.equal(report.metrics.testOrValidatorTouches > 0, true);
    assert.equal(report.scores.loopDriven > report.scores.promptDriven, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report does not infer loop-driven style from missing prompt lineage', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-missing-lineage';
    const sessionId = 'session-style-missing-lineage';
    const cwd = '/tmp/project';

    recordPatch(kernel, { eventId: 'style-missing-lineage-01', sessionId, runId, cwd, path: 'AGENT_LOOP.md' });
    recordPatch(kernel, { eventId: 'style-missing-lineage-02', sessionId, runId, cwd, path: 'tests/parser.test.ts' });
    recordPatch(kernel, { eventId: 'style-missing-lineage-03', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-missing-lineage-04', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-missing-lineage-05', sessionId, runId, cwd, command: "sed -n '1,120p' src/parser.ts" });
    recordPatch(kernel, { eventId: 'style-missing-lineage-06', sessionId, runId, cwd, path: 'src/parser.ts' });
    recordCommand(kernel, { eventId: 'style-missing-lineage-07', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-missing-lineage-08', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'insufficient_evidence');
    assert.equal(report.confidence, 'low');
    assert.equal(report.metrics.humanPromptCount, 0);
    assert.equal(report.metrics.actionCount, 8);
    assert.equal(report.metrics.actionsPerHumanPrompt, null);
    assert.equal(report.metrics.loopArtifactTouches > 0, true);
    assert.equal(report.missingSignals.includes('loop prompt emission event'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report treats long accepted agent sequences as manual orchestration without loop evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-manual-orchestrated';
    const sessionId = 'session-style-manual-orchestrated';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-manual-01', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'style-manual-02', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPatch(kernel, { eventId: 'style-manual-03', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-manual-04', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'style-manual-05', sessionId, runId, cwd, command: "sed -n '1,120p' src/main.ts" });
    recordPatch(kernel, { eventId: 'style-manual-06', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-manual-07', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-manual-08', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'manual_orchestrated');
    assert.equal(report.confidence, 'high');
    assert.equal(report.metrics.humanPromptCount, 1);
    assert.equal(report.metrics.actionCount, 7);
    assert.equal(report.metrics.loopArtifactTouches, 0);
    assert.equal(report.scores.manualOrchestration > 0, true);
    assert.equal(report.scores.loopDriven > report.scores.promptDriven, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report classifies mixed prompt and loop infrastructure as loop-assisted', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-assisted';
    const sessionId = 'session-style-assisted';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'style-assisted-01', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-assisted-02', sessionId, runId, cwd, path: '.codex/prompts/workflow.md' });
    recordCommand(kernel, { eventId: 'style-assisted-03', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPrompt(kernel, { eventId: 'style-assisted-04', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'style-assisted-05', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'style-assisted-06', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });
    recordCommand(kernel, { eventId: 'style-assisted-07', sessionId, runId, cwd, command: 'npm run build', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'loop_assisted');
    assert.equal(report.lineageMode, 'inferred_only');
    assert.equal(report.metrics.humanPromptCount, 2);
    assert.equal(report.metrics.specOrDocsTouches > 0, true);
    assert.equal(report.scores.workflowInfrastructure > 0, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo workflow style report reports insufficient evidence for tiny traces', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-style-empty';
    const sessionId = 'session-style-empty';
    const cwd = '/tmp/project';

    recordCommand(kernel, { eventId: 'style-empty-01', sessionId, runId, cwd, command: 'pwd' });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildWorkflowStyleReport(kernel, ast);

    assert.equal(report.classification, 'insufficient_evidence');
    assert.equal(report.confidence, 'low');
    assert.equal(report.metrics.humanPromptCount, 0);
    assert.equal(report.lineageMode, 'inferred_only');
  } finally {
    t.cleanup();
  }
});

test('Lyo style learning report aggregates LLM usage and vibecoding style across runs', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const cwd = '/tmp/project';

    recordPrompt(kernel, {
      eventId: 'style-learn-loop-01-prompt',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-02-inspect',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: "sed -n '1,80p' src/main.ts",
    });
    recordPatch(kernel, {
      eventId: 'style-learn-loop-03-edit',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      path: 'src/main.ts',
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-04-test-fail',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: 'npm test',
      exitCode: 1,
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-05-diagnose',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: "sed -n '1,120p' src/main.ts",
    });
    recordPatch(kernel, {
      eventId: 'style-learn-loop-06-fix',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      path: 'src/main.ts',
    });
    recordCommand(kernel, {
      eventId: 'style-learn-loop-07-test-pass',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      cwd,
      command: 'npm test',
      exitCode: 0,
    });
    recordModelCall(kernel, {
      callId: 'style-learn-model-loop',
      sessionId: 'session-style-learn-loop',
      runId: 'turn-style-learn-loop',
      provider: 'openai',
      model: 'gpt-5',
      modelLane: 'agent',
      inputTokens: 1200,
      outputTokens: 450,
      status: 'completed',
    });

    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-01-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-02-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPrompt(kernel, {
      eventId: 'style-learn-prompt-03-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
    });
    recordPatch(kernel, {
      eventId: 'style-learn-prompt-04-edit',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      cwd,
      path: 'src/other.ts',
    });
    recordModelCall(kernel, {
      callId: 'style-learn-model-prompt',
      sessionId: 'session-style-learn-prompt',
      runId: 'turn-style-learn-prompt',
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      modelLane: 'agent',
      inputTokens: 800,
      outputTokens: 300,
      status: 'completed',
    });

    normalizeHooks(kernel);
    const report = buildStyleLearningReport(kernel);

    assert.equal(report.learningVersion, 'lyo/style-learning/v1');
    assert.equal(report.runCount, 2);
    assert.equal(report.modelUsage.totalModelCalls, 2);
    assert.equal(report.modelUsage.totalTokens, 2750);
    assert.deepEqual(report.styleDistribution, {
      promptDriven: 1,
      manualOrchestrated: 1,
      loopAssisted: 0,
      loopDrivenCandidate: 0,
      insufficientEvidence: 0,
    });
    assert.equal(report.aggregateMetrics.runsWithVerifiedEdits, 1);
    assert.equal(report.aggregateMetrics.runsStoppedAfterEditWithoutVerification, 1);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'preserve-verifier-debug-loop'), true);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'critic-require-verifier-after-edit'), true);
    assert.equal(report.learningCandidates.some((candidate) => candidate.id === 'convert-repeated-prompts-to-loop'), true);
  } finally {
    t.cleanup();
  }
});
