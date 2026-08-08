import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { compileSeparatedCodeAndTestPromptArtifacts } from '../compiler/prompt-artifacts.ts';
import type { ArtifactRef } from '../contract/refs.ts';
import { hashFile } from '../contract/refs.ts';
import {
  checkBlindness,
  mustValidate,
  readJson,
  TRACE_VERSION,
  validatePlan,
  validateSpec,
  validateTrace,
  validateVerifierReport,
  VERIFIER_REPORT_VERSION,
} from '../contract/index.ts';
import type {
  Plan,
  PlanStage,
  Spec,
  Trace,
  VerifierReport,
} from '../contract/index.ts';
import { createKimiCliExecutor } from './executors/kimi-cli.ts';
import { createOpenRouterExecutor } from './executors/openrouter.ts';
import { createUpstageExecutor } from './executors/upstage.ts';
import type { StageExecutor } from './executors/stage-executor.ts';
import {
  loadLessons,
  renderLessonsBlock,
  renderPatchBlock,
  selectLessons,
  type Lesson,
} from '../lyo/storage/lesson-library.ts';
import type { FileBlock } from './files.ts';
import { runVerifier, type RunTestsFn, type VerifierRun } from './verifier.ts';
import { runWriterStage, isSingleShotKind, type StageOutcome } from './writer-stage.ts';
import type { LearningKernel } from '../ledger.ts';
import { finishRun, recordModelCall, recordRun, recordRunGoal, recordTrace } from '../reducers.ts';

export type ExecutorFactory = (stage: PlanStage) => StageExecutor;

export interface RunPipelineInput {
  planPath: string;
  runsRoot?: string;
  runId?: string;
  executorFactory?: ExecutorFactory;
  runTests?: RunTestsFn;
  now?: () => Date;
  lessonsDir?: string;
  kernel?: LearningKernel;
}

export interface RunPipelineResult {
  runId: string;
  runDir: string;
  report: VerifierReport;
  reportPath: string;
  tracePath: string;
}

/**
 * Execute one full blind pipeline run: validate plan + spec, check blindness,
 * materialize per-stage sandboxes (declared reads only), run code-writer and
 * test-writer in parallel as stateless stages, then run the deterministic
 * verifier over the merged tree. Every emitted artifact is validated against
 * the contract before it is written.
 */
export async function runPipeline({
  planPath,
  runsRoot = 'runs',
  runId,
  executorFactory = defaultExecutorFactory,
  runTests,
  now = () => new Date(),
  lessonsDir,
  kernel,
}: RunPipelineInput): Promise<RunPipelineResult> {
  const sourceRoot = dirname(planPath);
  const plan = mustValidate(validatePlan(readJson(planPath)), 'plan');

  const blindness = checkBlindness(plan);
  if (!blindness.ok) {
    throw new Error(`plan violates blindness:\n- ${blindness.violations.join('\n- ')}`);
  }

  const specPath = join(sourceRoot, plan.specRef.path);
  const specHash = hashFile(specPath).sha256;
  if (specHash !== plan.specRef.sha256) {
    throw new Error(
      `spec hash mismatch for '${plan.specRef.path}': plan declares ${plan.specRef.sha256}, file has ${specHash}`
    );
  }
  const specText = readFileSync(specPath, 'utf8');
  const spec = mustValidate(validateSpec(JSON.parse(specText)), 'spec');

  const codeStage = soleStage(plan, 'code-writer');
  const testStage = soleStage(plan, 'test-writer');
  const verifierStage = plan.stages.find((stage) => stage.role === 'verifier');

  const id = runId || defaultRunId(now());
  const runDir = join(runsRoot, id);
  mkdirSync(runDir, { recursive: true });
  cpSync(planPath, join(runDir, 'plan.json'));
  cpSync(specPath, join(runDir, 'spec.json'));
  const runRef = (absolutePath: string): ArtifactRef => ({
    path: absolutePath.slice(runDir.length + 1),
    sha256: hashFile(absolutePath).sha256,
  });
  const planRef = runRef(join(runDir, 'plan.json'));
  const specRef = runRef(join(runDir, 'spec.json'));

  // Kernel wiring: when a LearningKernel is provided, the pipeline records
  // the blindness split into SQLite — one run row, one model_call per stage,
  // one learning_trace per stage (carrying inputs/outputs/usage in the
  // payload), and a run_goal from the spec's invariants. All writes are
  // best-effort: a SQLite failure must never lose pipeline artifacts.
  const safeKernel = (fn: (k: LearningKernel) => void): void => {
    if (!kernel) return;
    try { fn(kernel); } catch { /* sqlite is best-effort */ }
  };
  const stageLane = (stage: PlanStage): string => stage.role;
  const parseModel = (model: string | undefined): { provider: string; model: string } => {
    const sep = (model ?? '').indexOf('/');
    return sep > 0
      ? { provider: model!.slice(0, sep), model: model!.slice(sep + 1) }
      : { provider: 'unknown', model: model ?? 'unknown' };
  };
  safeKernel((k) => {
    recordRun(k, {
      runId: id,
      taskShape: spec.specId,
      channel: plan.planId,
      status: 'started',
    });
    recordRunGoal(k, {
      runId: id,
      goal: `Implement and test specification '${spec.specId}'.`,
      successCriteria: spec.invariants.join('; '),
      expectedProcess: `blind pipeline: ${codeStage.stageId} || ${testStage.stageId} → verifier`,
    });
  });

  const prompts = buildStagePrompts(plan, spec, specText, codeStage, testStage);
  // Delivery: promoted lessons are injected into the blind-safe stage prompts
  // (titles only) and declared as hashed trace inputs.
  const library = lessonsDir ? loadLessons(lessonsDir) : [];
  const stageLessons: Record<'code-writer' | 'test-writer', Lesson[]> = {
    'code-writer': selectLessons(library, { role: 'code-writer' }),
    'test-writer': selectLessons(library, { role: 'test-writer' }),
  };
  // Delivery is vehicle-routed: prose titles, imitable code patches, and
  // spec-constraint addenda (shared, since they educate both writers).
  const deliver = (lessons: Lesson[]): string => {
    const prose = lessons.filter((lesson) => lesson.vehicle === 'prose');
    const patches = lessons.filter((lesson) => lesson.vehicle === 'skeleton-patch');
    return renderLessonsBlock(prose) + renderPatchBlock(patches);
  };
  const specConstraints = library.filter((lesson) => lesson.vehicle === 'spec-constraint');
  if (specConstraints.length > 0) {
    const addendum =
      '\n\nSpec addendum (promoted constraints — treat as part of the specification):\n' +
      specConstraints.map((lesson) => `- ${lesson.title}`).join('\n') +
      '\n';
    prompts.codeWriter += addendum;
    prompts.testWriter += addendum;
  }
  prompts.codeWriter += deliver(stageLessons['code-writer']);
  prompts.testWriter += deliver(stageLessons['test-writer']);
  const lessonRefs = (role: 'code-writer' | 'test-writer'): ArtifactRef[] =>
    stageLessons[role].map((lesson) => ({ path: lesson.path, sha256: lesson.sha256 }));

  const pipelineStartedAt = now().toISOString();
  const maxRounds = plan.feedbackPolicy.maxRounds ?? 1;
  const iterating = maxRounds > 1;

  const [firstCodeOutcome, testOutcome] = await Promise.all([
    runWriterStage({
      stage: codeStage,
      prompt: prompts.codeWriter,
      artifactKind: 'code',
      runDir,
      sourceRoot,
      executorFactory,
      specRef,
      now,
      round: iterating ? 1 : undefined,
    }),
    runWriterStage({
      stage: testStage,
      prompt: prompts.testWriter,
      artifactKind: 'tests',
      runDir,
      sourceRoot,
      executorFactory,
      specRef,
      now,
      round: iterating ? 1 : undefined,
    }),
  ]);

  const traceStages: Trace['stages'] = [];
  const recordWriter = (
    outcome: StageOutcome,
    round?: number,
    manifestRef?: ArtifactRef,
    extraInputs: ArtifactRef[] = []
  ): void => {
    traceStages.push({
      stageId: outcome.stage.stageId,
      round,
      inputs: [specRef, ...extraInputs],
      outputs: [manifestRef ?? outcome.manifestRef],
      model: outcome.stage.executor?.model,
      promptSha256: outcome.promptSha256,
      usage: outcome.usage,
      startedAt: outcome.startedAt,
      finishedAt: outcome.finishedAt,
    });
    // Record the blindness split into SQLite: one model_call and one
    // learning_trace per stage execution. The payload captures which
    // branch ran, which model, which lessons were injected (memories
    // invoked), and the token usage — the per-branch telemetry that
    // trace.json carries on disk, now queryable in the kernel.
    safeKernel((k) => {
      const { provider, model: modelName } = parseModel(outcome.stage.executor?.model);
      const lane = stageLane(outcome.stage);
      recordModelCall(k, {
        runId: id,
        provider,
        model: modelName,
        modelLane: lane,
        promptHash: outcome.promptSha256,
        promptRef: manifestRef?.path ?? outcome.manifestRef.path,
        inputTokens: outcome.usage?.promptTokens ?? null,
        outputTokens: outcome.usage?.completionTokens ?? null,
        totalTokens: outcome.usage?.totalTokens ?? null,
        estimatedCost: outcome.usage?.cost ?? null,
        status: 'completed',
      });
      recordTrace(k, {
        runId: id,
        kind: 'agent_response',
        summary: `blind stage '${outcome.stage.stageId}' (round ${round ?? 1}, lane ${lane})`,
        ref: manifestRef?.path ?? outcome.manifestRef.path,
        payload: {
          stageId: outcome.stage.stageId,
          role: lane,
          round,
          model: outcome.stage.executor?.model ?? null,
          promptSha256: outcome.promptSha256,
          inputs: [specRef, ...extraInputs].map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
          outputs: [manifestRef ?? outcome.manifestRef].map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
          lessonsInjected: extraInputs.map((ref) => ref.path),
          usage: outcome.usage ?? null,
          startedAt: outcome.startedAt,
          finishedAt: outcome.finishedAt,
        },
      });
    });
  };
  recordWriter(
    firstCodeOutcome,
    iterating ? 1 : undefined,
    iterating ? snapshotManifest(runDir, runRef, 'code', 1) : undefined,
    lessonRefs('code-writer')
  );
  recordWriter(testOutcome, iterating ? 1 : undefined, undefined, lessonRefs('test-writer'));

  // Deterministic verifier: merge both output trees and run the frozen tests.
  const verifyRound = async (
    round: number,
    codeManifestRef: ArtifactRef
  ): Promise<{ verification: VerifierRun; startedAt: string; finishedAt: string }> => {
    const startedAt = now().toISOString();
    const verifyDir = join(runDir, 'verify');
    rmSync(verifyDir, { recursive: true, force: true });
    const noManifest = (source: string): boolean => !source.endsWith('manifest.json');
    cpSync(join(runDir, 'artifacts', 'code'), verifyDir, { recursive: true, filter: noManifest });
    cpSync(join(runDir, 'artifacts', 'tests'), verifyDir, { recursive: true, filter: noManifest });
    // Decouple the merged tree from any ancestor package.json (e.g. a repo with
    // "type": "module" would break CommonJS artifacts). The spec's constraints
    // declare the module system; CommonJS is the v1 default.
    writeFileSync(join(verifyDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
    const verification = await runVerifier({
      dir: verifyDir,
      testPath: testStage.outputs[0],
      runTests,
    });
    // Raw verifier output is evidence for post-run analysis (LYO sees all).
    // It lives outside verify/, which is rebuilt fresh each round.
    const tapDir = join(runDir, 'verify-tap');
    mkdirSync(tapDir, { recursive: true });
    writeFileSync(join(tapDir, `tap.round-${round}.txt`), verification.rawOutput);
    const finishedAt = now().toISOString();
    traceStages.push({
      stageId: verifierStage?.stageId ?? 'verifier',
      round: iterating ? round : undefined,
      inputs: [codeManifestRef, testOutcome.manifestRef],
      outputs: [],
      startedAt,
      finishedAt,
    });
    // Record the verifier's verdict into SQLite — this is the grounding
    // event: the environment's judgement that moves counters downstream.
    safeKernel((k) => {
      recordTrace(k, {
        runId: id,
        kind: 'tool_use',
        summary: `verifier round ${round}: ${verification.outcome} (${verification.counts.passed}/${verification.counts.total} passed)`,
        ref: join(runDir, 'verify-tap', `tap.round-${round}.txt`),
        payload: {
          stageId: verifierStage?.stageId ?? 'verifier',
          role: 'verifier',
          round,
          outcome: verification.outcome,
          counts: verification.counts,
          inputs: [codeManifestRef, testOutcome.manifestRef].map((ref) => ({ path: ref.path, sha256: ref.sha256 })),
          startedAt,
          finishedAt,
        },
      });
    });
    return { verification, startedAt, finishedAt };
  };

  // Aggregate-only feedback loop: the code writer iterates against the frozen
  // suite, seeing only its own previous code and pass/fail counts.
  let codeOutcome = firstCodeOutcome;
  let codeManifestRef = iterating
    ? snapshotManifest(runDir, runRef, 'code', 1)
    : codeOutcome.manifestRef;
  let previousFiles = firstCodeOutcome.manifest.files;
  let { verification } = await verifyRound(1, codeManifestRef);
  let stopReason: 'pass' | 'max_rounds' | 'stuck' | 'no_change' | undefined =
    verification.outcome === 'pass' ? 'pass' : undefined;
  let bestPassed = verification.counts.passed;
  let staleStrikes = 0;
  let round = 1;

  while (stopReason === undefined && round < maxRounds) {
    round++;
    const feedbackPrompt = buildFeedbackPrompt(
      prompts.codeWriter,
      codeOutcome.contents,
      verification.counts,
      round,
      maxRounds
    );
    codeOutcome = await runWriterStage({
      stage: codeStage,
      prompt: feedbackPrompt,
      artifactKind: 'code',
      runDir,
      sourceRoot,
      executorFactory,
      specRef,
      now,
      round,
    });
    codeManifestRef = snapshotManifest(runDir, runRef, 'code', round);
    recordWriter(codeOutcome, round, codeManifestRef, lessonRefs('code-writer'));
    ({ verification } = await verifyRound(round, codeManifestRef));

    if (verification.outcome === 'pass') {
      stopReason = 'pass';
    } else if (sameFileHashes(previousFiles, codeOutcome.manifest.files)) {
      stopReason = 'no_change';
    } else if (verification.counts.passed > bestPassed) {
      bestPassed = verification.counts.passed;
      staleStrikes = 0;
    } else {
      staleStrikes++;
      if (staleStrikes >= 2) {
        stopReason = 'stuck';
      }
    }
    previousFiles = codeOutcome.manifest.files;
  }
  stopReason = stopReason ?? 'max_rounds';

  const report: VerifierReport = {
    version: VERIFIER_REPORT_VERSION,
    specRef,
    codeRef: codeOutcome.manifestRef,
    testRef: testOutcome.manifestRef,
    counts: verification.counts,
    outcome: verification.outcome,
    perTest: verification.perTest,
  };
  mustValidate(validateVerifierReport(report), 'verifier-report');
  const reportPath = join(runDir, 'verifier-report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const lastVerifyRecord = traceStages[traceStages.length - 1];
  lastVerifyRecord.outputs = [runRef(reportPath)];

  const pipelineFinishedAt = now().toISOString();
  const trace: Trace = {
    version: TRACE_VERSION,
    runId: id,
    planRef,
    stages: traceStages,
    feedback: iterating ? { rounds: round, stopReason } : undefined,
    startedAt: pipelineStartedAt,
    finishedAt: pipelineFinishedAt,
  };
  mustValidate(validateTrace(trace), 'trace');
  const tracePath = join(runDir, 'trace.json');
  writeFileSync(tracePath, JSON.stringify(trace, null, 2));

  // Finalize the run in SQLite: mark status and record total token cost.
  safeKernel((k) => {
    const totalTokens = traceStages.reduce(
      (sum, stage) => sum + (stage.usage?.totalTokens ?? 0),
      0
    );
    finishRun(k, {
      runId: id,
      status: verification.outcome === 'pass' ? 'completed' : 'failed',
      tokenCost: totalTokens,
    });
  });

  return { runId: id, runDir, report, reportPath, tracePath };
}


/**
 * Preserve a round's manifest before the next round overwrites manifest.json.
 * Trace records reference snapshots; the verifier report references the final
 * canonical manifest.
 */
function snapshotManifest(
  runDir: string,
  runRef: (absolutePath: string) => ArtifactRef,
  artifactKind: 'code' | 'tests',
  round: number
): ArtifactRef {
  const source = join(runDir, 'artifacts', artifactKind, 'manifest.json');
  const snapshot = join(runDir, 'artifacts', artifactKind, `manifest.round-${round}.json`);
  cpSync(source, snapshot);
  return runRef(snapshot);
}

function sameFileHashes(previous: ArtifactRef[], current: ArtifactRef[]): boolean {
  const hashes = (files: ArtifactRef[]): string =>
    files.map((file) => `${file.path}:${file.sha256}`).sort().join('\n');
  return hashes(previous) === hashes(current);
}

/**
 * The feedback channel, in full: pass/fail counts plus the writer's own
 * previous implementation. No test names, no test code, no error details.
 */
function buildFeedbackPrompt(
  originalPrompt: string,
  previousFiles: FileBlock[],
  counts: VerifierReport['counts'],
  round: number,
  maxRounds: number
): string {
  const filesBlock = previousFiles
    .map((file) => `\`\`\`path=${file.path}\n${file.content}\n\`\`\``)
    .join('\n\n');
  return (
    `${originalPrompt}\n\n---\n` +
    `ITERATION FEEDBACK — ROUND ${round} of ${maxRounds}\n` +
    `The frozen verification suite was run against your previous implementation.\n` +
    `Result: ${counts.passed} of ${counts.total} checks passed; ${counts.failed} failed.\n` +
    'You cannot see the tests and will not be told which checks failed or why. ' +
    'Re-read the specification carefully, find the behaviors your implementation gets wrong, ' +
    'and correct only your implementation.\n\n' +
    `Your previous implementation:\n${filesBlock}\n`
  );
}

function buildStagePrompts(
  plan: Plan,
  spec: Spec,
  specText: string,
  codeStage: PlanStage,
  testStage: PlanStage
): { codeWriter: string; testWriter: string } {
  const compiled = compileSeparatedCodeAndTestPromptArtifacts({
    pipelineId: plan.planId,
    objective: `Implement and test specification '${spec.specId}'.`,
    specPaths: [plan.specRef.path],
    codeOutputPaths: codeStage.outputs,
    testOutputPaths: testStage.outputs,
    acceptanceCriteria: spec.invariants,
    constraints: spec.constraints,
  });

  const specBlock = `\n\nSpecification (authoritative):\n${specText}\n`;
  const codeAddendum = isSingleShotKind(codeStage.executor?.kind)
      ? `${specBlock}\nRespond with file blocks only — no prose, no planning, no commentary.\nReturn each file as a fenced code block tagged with its path, e.g.\n\`\`\`js path=${codeStage.outputs[0]}/example.js\n<file contents>\n\`\`\`\nOnly files under: ${codeStage.outputs.join(', ')}.\n`
      : `${specBlock}\nThe specification is also available at '${plan.specRef.path}' inside your working directory. Write implementation files under: ${codeStage.outputs.join(', ')}. Do not write anywhere else.\n`;
  const testAddendum = isSingleShotKind(testStage.executor?.kind)
      ? `${specBlock}\nRespond with file blocks only — no prose, no planning, no commentary.\nReturn each file as a fenced code block tagged with its path, e.g.\n\`\`\`js path=${testStage.outputs[0]}/example.test.js\n<file contents>\n\`\`\`\nOnly files under: ${testStage.outputs.join(', ')}. Tests run with \`node --test\` against code merged as a sibling tree (e.g. require('../src/...') from ${testStage.outputs[0]}).\nTests MUST be CommonJS using node:test and node:assert/strict, exactly like:\n\`\`\`js\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst { functionUnderTest } = require('../src/<module>.js');\ntest('describes behavior', () => {\n  assert.deepEqual(functionUnderTest('input'), 'expected');\n});\n\`\`\`\nDo NOT use import/export syntax. Do NOT use Jest/Vitest APIs (expect, toEqual, describe/it from jest).\nWhen asserting numeric results, remember that assert/strict uses Object.is, which treats -0 and 0 as DIFFERENT. If the spec treats them as equal (e.g. an antisymmetry rule like f(a,b) === -f(b,a)), normalize by ADDING zero — write (actual + 0), which evaluates to +0 even when actual is -0. Note that unary plus does NOT help: +(-0) is still -0.\n`
      : `${specBlock}\nThe specification is also available at '${plan.specRef.path}' inside your working directory. Write test files under: ${testStage.outputs.join(', ')}. Do not write anywhere else.\n`;

  return {
    codeWriter: compiled.artifacts.codeWriter.content + codeAddendum,
    testWriter: compiled.artifacts.testWriter.content + testAddendum,
  };
}


function defaultExecutorFactory(stage: PlanStage): StageExecutor {
  if (!stage.executor) {
    throw new Error(`stage '${stage.stageId}' has no executor binding`);
  }
  if (stage.executor.kind === 'kimi-cli') {
    return createKimiCliExecutor({ model: stage.executor.model });
  }
  if (stage.executor.kind === 'upstage') {
    return createUpstageExecutor({
      model: stage.executor.model,
      temperature: stage.executor.temperature,
    });
  }
  return createOpenRouterExecutor({
    model: stage.executor.model,
    temperature: stage.executor.temperature,
  });
}

function inferLanguage(files: ArtifactRef[]): string {
  const extension = files[0]?.path.split('.').pop();
  const languages: Record<string, string> = {
    ts: 'typescript',
    js: 'javascript',
    mjs: 'javascript',
    py: 'python',
  };
  return languages[extension ?? ''] ?? 'unknown';
}

function soleStage(plan: Plan, role: PlanStage['role']): PlanStage {
  const matches = plan.stages.filter((stage) => stage.role === role);
  if (matches.length !== 1) {
    throw new Error(`plan must contain exactly one ${role} stage, found ${matches.length}`);
  }
  return matches[0];
}

function defaultRunId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `run-${stamp}-${randomBytes(3).toString('hex')}`;
}
