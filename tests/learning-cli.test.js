import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  seedEditThenVerifierLedger,
  seedEditVerifierThenExternalLedger,
} from './helpers/ledger-fixtures.js';

const ROOT = new URL('..', import.meta.url).pathname;

test('lyo learn style emits aggregate LLM usage and style learning candidates', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-learn-style-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const seed = `
      import {
        createKernel,
        initLedger,
        recordHookEvent,
        recordModelCall
      } from './src/index.ts';

      const kernel = createKernel({ dbPath: process.argv[1] });
      initLedger(kernel);
      const common = {
        sessionId: 'learn-style-session',
        turnId: 'learn-style-turn',
        cwd: process.cwd()
      };
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-01-prompt',
        eventName: 'UserPromptSubmit',
        payload: {
          hook_event_name: 'UserPromptSubmit',
          prompt: { sha256: 'prompt', length: 42 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-02-inspect',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,80p' src/main.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-03-edit',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/main.ts\\n@@\\n-old\\n+new\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-04-test-fail',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 1, stderr: 'fail' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-05-diagnose',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: "sed -n '1,120p' src/main.ts" },
          tool_response: { exit_code: 0, stdout: 'source' }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-06-fix',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'apply_patch',
          tool_input: {
            patch: '*** Begin Patch\\n*** Update File: src/main.ts\\n@@\\n-new\\n+newer\\n*** End Patch'
          },
          tool_response: { exit_code: 0 }
        }
      });
      recordHookEvent(kernel, {
        ...common,
        eventId: 'learn-style-07-test-pass',
        eventName: 'PostToolUse',
        payload: {
          hook_event_name: 'PostToolUse',
          tool_name: 'Bash',
          tool_input: { command: 'npm test' },
          tool_response: { exit_code: 0, stdout: 'ok' }
        }
      });
      recordModelCall(kernel, {
        callId: 'learn-style-model-call',
        sessionId: 'learn-style-session',
        runId: 'learn-style-turn',
        provider: 'openai',
        model: 'gpt-5',
        modelLane: 'agent',
        inputTokens: 100,
        outputTokens: 40,
        status: 'completed'
      });
    `;
    execFileSync(process.execPath, ['--eval', seed, dbPath], { cwd: ROOT });

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'style', '--db', dbPath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.learning.learningVersion, 'lyo/style-learning/v1');
    assert.equal(parsed.learning.mode, 'learn');
    assert.equal(parsed.learning.runCount, 1);
    assert.equal(parsed.learning.analyzedRunCount, 1);
    assert.deepEqual(parsed.learning.analyzedRunIdPreview, ['learn-style-turn']);
    assert.equal(parsed.learning.analyzedRunIds, undefined);
    assert.match(parsed.learning.summaryText, /Analyzed 1 telemetry runs/);
    assert.equal(parsed.learning.summaryLines.some((line) => line.includes('Top learning candidates')), true);
    assert.equal(parsed.learning.modelUsage.totalModelCalls, 1);
    assert.equal(parsed.learning.modelUsage.totalTokens, 140);
    assert.equal(parsed.learning.styleDistribution.manualOrchestrated, 1);
    assert.equal(parsed.learning.styleDistribution.loopDrivenCandidate, 0);
    assert.equal(parsed.learning.learningCandidates.some((candidate) => {
      return candidate.id === 'preserve-verifier-debug-loop';
    }), true);
    assert.equal(parsed.learning.learningCandidates.some((candidate) => {
      return candidate.id === 'preserve-verifier-debug-loop'
        && candidate.evidenceRunCount === 1
        && candidate.evidenceRunIdPreview[0] === 'learn-style-turn';
    }), true);

    const verboseOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'style', '--db', dbPath, '--verbose'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const verbose = JSON.parse(verboseOutput);
    assert.deepEqual(verbose.learning.analyzedRunIds, ['learn-style-turn']);
    assert.deepEqual(
      verbose.learning.learningCandidates.find((candidate) => candidate.id === 'preserve-verifier-debug-loop').evidenceRunIds,
      ['learn-style-turn']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo learn associations discovers verifier hypotheses across ledger corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-learn-associations-'));
  try {
    const seedLedger = (repoName, runId, sourcePath, verifierCommand) => {
      seedEditThenVerifierLedger({
        root: ROOT,
        corpusDir: dir,
        repoName,
        runId,
        sourcePath,
        verifierCommand,
      });
    };
    const seedLedgerWithPostVerifierExternal = (repoName, runId, sourcePath) => {
      seedEditVerifierThenExternalLedger({
        root: ROOT,
        corpusDir: dir,
        repoName,
        runId,
        sourcePath,
      });
    };

    seedLedger('repo-a', 'assoc-run-a', 'src/compiler/parser.ts');
    seedLedger('repo-b', 'assoc-run-b', 'src/compiler/tokenizer.ts');
    seedLedger('repo-c', 'assoc-run-noisy-test-source', 'tests/compiler-frontend.test.js');
    seedLedger(
      'repo-d',
      'assoc-run-absolute-work-path',
      '/Users/marcus.kim/repositories/work/nao/jobs/utilibill/main.py'
    );
    seedLedger('repo-e', 'assoc-run-top-level-file', 'src/index.ts');
    seedLedgerWithPostVerifierExternal('repo-f', 'assoc-run-post-verifier-external', 'src/external.ts');
    seedLedger('repo-g', 'assoc-run-pytest-canonical-a', 'src/pytest.ts', 'uv run pytest tests/test_rep655_market_meter_data_report.py');
    seedLedger('repo-h', 'assoc-run-pytest-canonical-b', 'src/pytest.ts', 'uv run pytest tests/test_rep655_market_meter_data_report.py -q');

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'associations', '--dir', dir, '--dry-run'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.learning.learningVersion, 'lyo/association-learning/v1');
    assert.equal(parsed.learning.mode, 'learn');
    assert.equal(parsed.learning.dryRun, true);
    assert.equal(parsed.learning.ledgers, 8);
    assert.equal(parsed.learning.scannedLedgers.length, 8);
    assert.equal(parsed.learning.scannedLedgers.some((ledger) => {
      return ledger.dbPath === join(dir, 'repo-a', '.agent-learning', 'learning.sqlite')
        && ledger.workspaceRoot === join(dir, 'repo-a')
        && ledger.relativeWorkspace === 'repo-a'
        && ledger.depth === 1;
    }), true);
    assert.equal(parsed.learning.persisted, false);
    assert.match(parsed.learning.summaryText, /Discovered/);

    const primary = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'src/compiler/**'
        && hypothesis.relation === 'verified_by'
        && hypothesis.target === 'npm test -- tests/compiler-frontend.test.js';
    });
    assert.ok(primary);
    assert.equal(primary.credibility, 'credible');
    assert.equal(primary.supportCount, 2);
    assert.equal(primary.distinctRunCount, 2);
    assert.equal(primary.distinctLedgerCount, 2);
    assert.equal(primary.promotionCandidate, true);
    assert.deepEqual(primary.promotionBlockers, []);
    assert.deepEqual(primary.scopeWarnings, []);
    assert.equal(primary.predictedConsequences.includes('fresh passing verifier after source mutation'), true);
    assert.equal(primary.knownDefeaters.includes('target verifier fails after source mutation'), true);

    const primaryBelief = parsed.learning.explanationBeliefs.find((belief) => {
      return belief.hypothesisId === primary.id;
    });
    assert.ok(primaryBelief);
    assert.equal(primaryBelief.explanation.explanationGraphVersion, 'lyo/explanation-graph/v1');
    assert.equal(primaryBelief.associationCounters.supportCount, 2);
    assert.equal(primaryBelief.explanation.hypothesis.source, 'src/compiler/**');
    assert.equal(primaryBelief.explanation.hypothesis.target, 'npm test -- tests/compiler-frontend.test.js');
    assert.equal(primaryBelief.explanation.credibility, 'provisionally_supported');
    assert.equal(primaryBelief.explanation.factorMessages.some((message) => {
      return message.factorId === 'scope_quality';
    }), true);
    assert.equal(primaryBelief.explanation.factorMessages.some((message) => {
      return message.factorId.startsWith('evidence_supports_');
    }), true);

    const primaryEvidence = parsed.learning.evidenceEvents.filter((event) => {
      return event.hypothesisId === primary.id;
    });
    assert.equal(primaryEvidence.length, 2);
    assert.equal(primaryEvidence.every((event) => event.credibilityEffect === 'supports'), true);
    assert.equal(primaryEvidence.every((event) => event.sourceWasActivated), true);
    assert.equal(primaryEvidence.every((event) => event.consequenceFreshness === 'fresh_after_source'), true);
    assert.equal(primaryEvidence.some((event) => event.polyaPattern === 'successive_varied_consequence'), true);
    assert.equal(primaryEvidence.every((event) => event.provenanceRefs.length > 0), true);

    const noisy = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'tests/**'
        && hypothesis.target === 'npm test -- tests/compiler-frontend.test.js';
    });
    assert.ok(noisy);
    assert.equal(noisy.promotionCandidate, false);
    assert.equal(noisy.promotionBlockers.includes('scope_warning:source_scope_is_test_tree'), true);
    assert.equal(noisy.scopeWarnings.includes('source_scope_is_test_tree'), true);
    const noisyBelief = parsed.learning.explanationBeliefs.find((belief) => belief.hypothesisId === noisy.id);
    assert.ok(noisyBelief);
    assert.equal(noisyBelief.explanation.belief.h < primaryBelief.explanation.belief.h, true);

    const absolutePathHypothesis = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'jobs/utilibill/**'
        && hypothesis.target === 'npm test -- tests/compiler-frontend.test.js';
    });
    assert.ok(absolutePathHypothesis);
    assert.equal(
      parsed.learning.associationHypotheses.some((hypothesis) => hypothesis.source === 'Users/marcus.kim/**'),
      false
    );

    const topLevelFileHypothesis = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'src/index.ts'
        && hypothesis.target === 'npm test -- tests/compiler-frontend.test.js';
    });
    assert.ok(topLevelFileHypothesis);
    assert.equal(
      parsed.learning.associationHypotheses.some((hypothesis) => hypothesis.source === 'src/index.ts/**'),
      false
    );

    const postVerifierExternalHypothesis = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'src/external.ts'
        && hypothesis.target === 'npm test -- tests/compiler-frontend.test.js';
    });
    assert.ok(postVerifierExternalHypothesis);
    assert.deepEqual(postVerifierExternalHypothesis.policyWarnings, []);
    assert.deepEqual(postVerifierExternalHypothesis.runPolicyWarnings, ['run_contains_external_side_effects']);
    const postVerifierExternalEvent = parsed.learning.evidenceEvents.find((event) => {
      return event.hypothesisId === postVerifierExternalHypothesis.id;
    });
    assert.ok(postVerifierExternalEvent);
    assert.deepEqual(postVerifierExternalEvent.policyWarnings, []);
    assert.deepEqual(postVerifierExternalEvent.runPolicyWarnings, ['run_contains_external_side_effects']);

    const canonicalPytestHypothesis = parsed.learning.associationHypotheses.find((hypothesis) => {
      return hypothesis.source === 'src/pytest.ts'
        && hypothesis.target === 'uv run pytest tests/test_rep655_market_meter_data_report.py';
    });
    assert.ok(canonicalPytestHypothesis);
    assert.equal(canonicalPytestHypothesis.supportCount, 2);
    assert.equal(canonicalPytestHypothesis.distinctRunCount, 2);
    assert.equal(
      parsed.learning.associationHypotheses.some((hypothesis) => {
        return hypothesis.source === 'src/pytest.ts'
          && hypothesis.target === 'uv run pytest tests/test_rep655_market_meter_data_report.py -q';
      }),
      false
    );

    const compactOutput = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'associations', '--dir', dir, '--dry-run', '--compact'],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const compactParsed = JSON.parse(compactOutput);
    assert.equal(compactParsed.ok, true);
    assert.equal(compactParsed.learning.hypothesisCount, parsed.learning.hypothesisCount);
    assert.equal('associationHypotheses' in compactParsed.learning, false);
    assert.equal('evidenceEvents' in compactParsed.learning, false);
    assert.equal(compactParsed.learning.promotableCandidateCount >= 1, true);
    assert.equal(
      compactParsed.learning.topPromotionCandidates.some((candidate) => {
        return candidate.source === 'src/compiler/**'
          && candidate.target === 'npm test -- tests/compiler-frontend.test.js'
          && candidate.promotionCandidate === true;
      }),
      true
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo learn explanation evaluates a dry-run explanation graph from JSON input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-learn-explanation-'));
  try {
    const inputPath = join(dir, 'explanation.json');
    writeFileSync(inputPath, JSON.stringify({
      hypothesis: {
        id: 'hyp-compiler-verifier',
        label: 'compiler source changes are verified by compiler frontend tests',
      },
      prior: { notH: 0.75, h: 0.25 },
      factors: [{
        factorId: 'verifier_passed',
        label: 'predicted verifier passed',
        observedState: 'present',
        states: ['absent', 'present'],
        matrix: {
          notH: [1, 0.30],
          h: [0.10, 1],
        },
      }],
    }));

    const output = execFileSync(
      process.execPath,
      ['src/cli.ts', 'learn', 'explanation', '--dry-run', '--input', inputPath],
      { cwd: ROOT, encoding: 'utf8' }
    );
    const parsed = JSON.parse(output);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.learning.explanationGraphVersion, 'lyo/explanation-graph/v1');
    assert.equal(parsed.learning.hypothesis.id, 'hyp-compiler-verifier');
    assert.deepEqual(parsed.learning.factorMessages[0].message, { notH: 0.3, h: 1 });
    assert.equal(Number(parsed.learning.belief.h.toFixed(4)), 0.5263);
    assert.equal(parsed.learning.persisted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
