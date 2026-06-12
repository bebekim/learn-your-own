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

test('Lyo candidate at-bat report classifies verifier-gated debugging as verified progress', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-verified';
    const sessionId = 'session-at-bat-verified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'at-bat-02-inspect', sessionId, runId, cwd, command: "sed -n '1,80p' src/main.ts" });
    recordPatch(kernel, { eventId: 'at-bat-03-edit', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'at-bat-04-test-fail', sessionId, runId, cwd, command: 'npm test', exitCode: 1 });
    recordCommand(kernel, { eventId: 'at-bat-05-diagnose', sessionId, runId, cwd, command: "sed -n '1,120p' src/main.ts" });
    recordPatch(kernel, { eventId: 'at-bat-06-fix', sessionId, runId, cwd, path: 'src/main.ts' });
    recordCommand(kernel, { eventId: 'at-bat-07-test-pass', sessionId, runId, cwd, command: 'npm test', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'etl-debugging-v1',
      taskComplexity: 6,
      expectedPattern: 'verifier-first debugging',
      successCriteria: ['targeted verifier passes after the fix'],
      allowedTools: ['Bash', 'apply_patch'],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.reportVersion, 'lyo/candidate-at-bat/v1');
    assert.equal(report.mode, 'evaluate');
    assert.equal(report.runId, runId);
    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.scorecard.verifiedProgress, true);
    assert.equal(report.scorecard.inspectBeforeEdit, true);
    assert.equal(report.scorecard.stoppedAfterEditWithoutVerification, false);
    assert.equal(report.scorecard.failureRecovery, 'strong');
    assert.equal(report.scorecard.claimEvidenceAlignment, 'strong');
    assert.equal(report.conversion.edits, 2);
    assert.equal(report.conversion.verifierRuns, 2);
    assert.equal(report.conversion.verifierPasses, 1);
    assert.deepEqual(report.resourceChurn.writeCountsByResource, {
      'src/main.ts': 2,
    });
    assert.deepEqual(report.resourceChurn.repeatedEditHotspots, ['src/main.ts']);
    assert.equal(report.techniqueSignature.includes('debugger'), true);
    assert.equal(report.techniqueSignature.includes('verifier-first'), true);
    assert.equal(report.evidenceRefs.includes('hook:at-bat-07-test-pass'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report classifies final edits without later verification as unverified claims', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-unverified';
    const sessionId = 'session-at-bat-unverified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-unverified-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-unverified-02-edit', sessionId, runId, cwd, path: 'src/main.ts' });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'etl-debugging-v1',
      taskComplexity: 6,
      expectedPattern: 'verifier-first debugging',
      successCriteria: ['targeted verifier passes after the fix'],
      allowedTools: ['Bash', 'apply_patch'],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.scorecard.verifiedProgress, false);
    assert.equal(report.scorecard.stoppedAfterEditWithoutVerification, true);
    assert.equal(report.scorecard.inspectBeforeEdit, false);
    assert.equal(report.scorecard.failureRecovery, 'not_applicable');
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
    assert.equal(report.conversion.edits, 1);
    assert.equal(report.conversion.verifierRuns, 0);
    assert.equal(report.resourceChurn.writeCountsByResource['src/main.ts'], 1);
    assert.equal(report.limitations.includes('final assistant claim text is not semantically judged in v1'), true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report records unsupported final done claims', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-final-done-unverified';
    const sessionId = 'session-at-bat-final-done-unverified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-final-done-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-final-done-02-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordStop(kernel, {
      eventId: 'at-bat-final-done-03-stop',
      sessionId,
      runId,
      cwd,
      message: 'Done. I implemented the parser fix.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.finalClaim.posture, 'claims_done');
    assert.equal(report.finalClaim.mentionsVerifier, false);
    assert.equal(report.finalClaim.mentionsBlocker, false);
    assert.equal(report.finalClaim.evidenceRefs.includes('hook:at-bat-final-done-03-stop'), true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
    assert.equal(report.scorecard.cleanStopWithJustification, false);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report records final claims that cite required verifier evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-final-done-verified';
    const sessionId = 'session-at-bat-final-done-verified';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-final-verified-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-final-verified-02-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordCommand(kernel, {
      eventId: 'at-bat-final-verified-03-test',
      sessionId,
      runId,
      cwd,
      command: 'pytest tests/test_parser.py',
      exitCode: 0,
    });
    recordStop(kernel, {
      eventId: 'at-bat-final-verified-04-stop',
      sessionId,
      runId,
      cwd,
      message: 'Done. pytest tests/test_parser.py passed after the fix.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.finalClaim.posture, 'cites_evidence');
    assert.equal(report.finalClaim.mentionsVerifier, true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'strong');
    assert.equal(report.shipReadiness, true);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report treats justified blocker stops without writes as clean stops', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-clean-stop';
    const sessionId = 'session-at-bat-clean-stop';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-clean-stop-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, {
      eventId: 'at-bat-clean-stop-02-inspect',
      sessionId,
      runId,
      cwd,
      command: "sed -n '1,80p' README.md",
      exitCode: 0,
    });
    recordStop(kernel, {
      eventId: 'at-bat-clean-stop-03-stop',
      sessionId,
      runId,
      cwd,
      message: 'Blocked: the task is underspecified and needs the target verifier before I change files.',
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'clean_stop_with_justification');
    assert.equal(report.finalClaim.posture, 'blocked');
    assert.equal(report.finalClaim.mentionsBlocker, true);
    assert.equal(report.scorecard.cleanStopWithJustification, true);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'unknown');
    assert.equal(report.conversion.edits, 0);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report requires explicit task verifier specs, not any passing test', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-ruby-irrelevant';
    const sessionId = 'session-at-bat-ruby-irrelevant';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-ruby-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-ruby-02-edit', sessionId, runId, cwd, path: 'lib/parser.rb' });
    recordCommand(kernel, {
      eventId: 'at-bat-ruby-03-irrelevant-pass',
      sessionId,
      runId,
      cwd,
      command: 'bundle exec rspec spec/other_spec.rb',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'ruby-parser-debugging-v1',
      language: 'ruby',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['parser spec passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'ruby-parser-spec',
        commandPattern: 'bundle exec rspec spec/parser_spec.rb',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'unverified_claim');
    assert.equal(report.shipReadiness, false);
    assert.equal(report.verifierQuality, 'missing');
    assert.deepEqual(report.missingRequiredVerifiers, ['ruby-parser-spec']);
    assert.deepEqual(report.matchedVerifiers, []);
    assert.equal(report.scorecard.verifiedProgress, false);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report accepts language-specific required verifier passes after the final edit', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-python-required';
    const sessionId = 'session-at-bat-python-required';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-python-01-prompt', sessionId, runId, cwd });
    recordCommand(kernel, { eventId: 'at-bat-python-02-inspect', sessionId, runId, cwd, command: "sed -n '1,80p' src/parser.py" });
    recordPatch(kernel, { eventId: 'at-bat-python-03-edit', sessionId, runId, cwd, path: 'src/parser.py' });
    recordCommand(kernel, {
      eventId: 'at-bat-python-04-required-pass',
      sessionId,
      runId,
      cwd,
      command: 'pytest tests/test_parser.py',
      exitCode: 0,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'python-parser-debugging-v1',
      language: 'python',
      taskComplexity: 5,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['targeted parser test passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'python-parser-test',
        commandPattern: 'pytest tests/test_parser.py',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.shipReadiness, true);
    assert.equal(report.verifierQuality, 'moderate');
    assert.deepEqual(report.missingRequiredVerifiers, []);
    assert.deepEqual(report.matchedVerifiers.map((verifier) => ({
      id: verifier.id,
      kind: verifier.kind,
      required: verifier.required,
      command: verifier.command,
      passed: verifier.passed,
      freshAfterFinalEdit: verifier.freshAfterFinalEdit,
    })), [{
      id: 'python-parser-test',
      kind: 'targeted',
      required: true,
      command: 'pytest tests/test_parser.py',
      passed: true,
      freshAfterFinalEdit: true,
    }]);
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report treats required verifier failure after edit as regression evidence', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-java-regression';
    const sessionId = 'session-at-bat-java-regression';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-java-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-java-02-edit', sessionId, runId, cwd, path: 'src/main/java/Parser.java' });
    recordCommand(kernel, {
      eventId: 'at-bat-java-03-required-fail',
      sessionId,
      runId,
      cwd,
      command: 'mvn test -Dtest=ParserTest',
      exitCode: 1,
    });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'java-parser-debugging-v1',
      language: 'java',
      taskComplexity: 7,
      expectedPattern: 'targeted verifier after edit',
      successCriteria: ['ParserTest passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [{
        id: 'java-parser-test',
        commandPattern: 'mvn test -Dtest=ParserTest',
        kind: 'targeted',
        required: true,
      }],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'regression');
    assert.equal(report.shipReadiness, false);
    assert.equal(report.verifierQuality, 'missing');
    assert.deepEqual(report.missingRequiredVerifiers, ['java-parser-test']);
    assert.equal(report.matchedVerifiers[0].id, 'java-parser-test');
    assert.equal(report.matchedVerifiers[0].passed, false);
    assert.equal(report.scorecard.claimEvidenceAlignment, 'weak');
  } finally {
    t.cleanup();
  }
});

test('Lyo candidate at-bat report upgrades verifier quality when targeted and broad C++ verifiers pass', () => {
  const t = tempDb();
  try {
    const kernel = createKernel({ dbPath: t.dbPath });
    initLedger(kernel);
    const runId = 'turn-at-bat-cpp-strong';
    const sessionId = 'session-at-bat-cpp-strong';
    const cwd = '/tmp/project';

    recordPrompt(kernel, { eventId: 'at-bat-cpp-01-prompt', sessionId, runId, cwd });
    recordPatch(kernel, { eventId: 'at-bat-cpp-02-edit', sessionId, runId, cwd, path: 'src/parser.cpp' });
    recordCommand(kernel, { eventId: 'at-bat-cpp-03-build', sessionId, runId, cwd, command: 'cmake --build build', exitCode: 0 });
    recordCommand(kernel, { eventId: 'at-bat-cpp-04-targeted', sessionId, runId, cwd, command: 'ctest -R parser', exitCode: 0 });
    recordCommand(kernel, { eventId: 'at-bat-cpp-05-broad', sessionId, runId, cwd, command: 'ctest', exitCode: 0 });

    normalizeHooks(kernel);
    const ast = compileTelemetryRunAst(kernel, { runId });
    const report = buildCandidateAtBatReport(kernel, ast, {
      taskId: 'cpp-parser-debugging-v1',
      language: 'cpp',
      taskComplexity: 8,
      expectedPattern: 'build plus targeted and broad tests',
      successCriteria: ['build passes', 'parser test passes', 'full ctest passes'],
      allowedTools: ['Bash', 'apply_patch'],
      verifiers: [
        {
          id: 'cpp-build',
          commandPattern: 'cmake --build build',
          kind: 'build',
          required: true,
        },
        {
          id: 'cpp-parser-test',
          commandPattern: 'ctest -R parser',
          kind: 'targeted',
          required: true,
        },
        {
          id: 'cpp-full-test',
          commandPattern: 'ctest',
          kind: 'broad',
          required: false,
          matchMode: 'exact',
        },
      ],
      baseline: {
        existingTestsPass: true,
        buildSucceeds: true,
        knownIssues: [],
      },
    });

    assert.equal(report.outcome, 'verified_progress');
    assert.equal(report.shipReadiness, true);
    assert.equal(report.verifierQuality, 'strong');
    assert.deepEqual(report.matchedVerifiers.map((verifier) => verifier.id), [
      'cpp-build',
      'cpp-parser-test',
      'cpp-full-test',
    ]);
    assert.deepEqual(report.missingRequiredVerifiers, []);
    assert.equal(report.conversion.verifierRuns, 3);
    assert.equal(report.conversion.verifierPasses, 3);
  } finally {
    t.cleanup();
  }
});
