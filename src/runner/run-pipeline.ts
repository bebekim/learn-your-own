import { randomBytes } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { compileSeparatedCodeAndTestPromptArtifacts } from '../compiler/prompt-artifacts.ts';
import type { ArtifactRef } from '../contract/refs.ts';
import { hashFile, hashValue } from '../contract/refs.ts';
import {
  checkBlindness,
  CODE_VERSION,
  TEST_VERSION,
  TRACE_VERSION,
  validateCodeManifest,
  validatePlan,
  validateSpec,
  validateTestManifest,
  validateTrace,
  validateVerifierReport,
  VERIFIER_REPORT_VERSION,
} from '../contract/index.ts';
import type {
  CodeManifest,
  Plan,
  PlanStage,
  Spec,
  TestManifest,
  Trace,
  ValidationResult,
  VerifierReport,
} from '../contract/index.ts';
import { createKimiCliExecutor } from './executors/kimi-cli.ts';
import { createOpenRouterExecutor } from './executors/openrouter.ts';
import type { StageExecutor } from './executors/stage-executor.ts';
import { collectFiles, filterDeclaredWrites, materializeSandbox, parseFileBlocks } from './files.ts';
import { runVerifier, type RunTestsFn } from './verifier.ts';

export type ExecutorFactory = (stage: PlanStage) => StageExecutor;

export interface RunPipelineInput {
  planPath: string;
  runsRoot?: string;
  runId?: string;
  executorFactory?: ExecutorFactory;
  runTests?: RunTestsFn;
  now?: () => Date;
}

export interface RunPipelineResult {
  runId: string;
  runDir: string;
  report: VerifierReport;
  reportPath: string;
  tracePath: string;
}

interface StageOutcome {
  stage: PlanStage;
  manifestRef: ArtifactRef;
  manifest: CodeManifest | TestManifest;
  promptSha256: string;
  startedAt: string;
  finishedAt: string;
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

  const prompts = buildStagePrompts(plan, spec, specText, codeStage, testStage);
  const pipelineStartedAt = now().toISOString();

  const [codeOutcome, testOutcome] = await Promise.all([
    runWriterStage({
      stage: codeStage,
      prompt: prompts.codeWriter,
      artifactKind: 'code',
      runDir,
      sourceRoot,
      executorFactory,
      specRef,
      now,
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
    }),
  ]);

  // Deterministic verifier: merge both output trees and run the frozen tests.
  const verifyStartedAt = now().toISOString();
  const verifyDir = join(runDir, 'verify');
  const noManifest = (source: string): boolean => !source.endsWith('manifest.json');
  cpSync(join(runDir, 'artifacts', 'code'), join(verifyDir), { recursive: true, filter: noManifest });
  cpSync(join(runDir, 'artifacts', 'tests'), join(verifyDir), { recursive: true, filter: noManifest });
  // Decouple the merged tree from any ancestor package.json (e.g. a repo with
  // "type": "module" would break CommonJS artifacts). The spec's constraints
  // declare the module system; CommonJS is the v1 default.
  writeFileSync(join(verifyDir, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  const verification = await runVerifier({
    dir: verifyDir,
    testPath: testStage.outputs[0],
    runTests,
  });
  const verifyFinishedAt = now().toISOString();

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

  const pipelineFinishedAt = now().toISOString();
  const trace: Trace = {
    version: TRACE_VERSION,
    runId: id,
    planRef,
    stages: [
      stageTraceRecord(codeOutcome, specRef),
      stageTraceRecord(testOutcome, specRef),
      {
        stageId: verifierStage?.stageId ?? 'verifier',
        inputs: [codeOutcome.manifestRef, testOutcome.manifestRef],
        outputs: [runRef(reportPath)],
        startedAt: verifyStartedAt,
        finishedAt: verifyFinishedAt,
      },
    ],
    startedAt: pipelineStartedAt,
    finishedAt: pipelineFinishedAt,
  };
  mustValidate(validateTrace(trace), 'trace');
  const tracePath = join(runDir, 'trace.json');
  writeFileSync(tracePath, JSON.stringify(trace, null, 2));

  return { runId: id, runDir, report, reportPath, tracePath };
}

async function runWriterStage({
  stage,
  prompt,
  artifactKind,
  runDir,
  sourceRoot,
  executorFactory,
  specRef,
  now,
}: {
  stage: PlanStage;
  prompt: string;
  artifactKind: 'code' | 'tests';
  runDir: string;
  sourceRoot: string;
  executorFactory: ExecutorFactory;
  specRef: ArtifactRef;
  now: () => Date;
}): Promise<StageOutcome> {
  const sandboxDir = join(runDir, 'stages', stage.stageId, 'sandbox');
  materializeSandbox({ sourceRoot, sandboxDir, readPaths: stage.authority.read });

  const startedAt = now().toISOString();
  const { transcript } = await executorFactory(stage)({ prompt, sandboxDir });
  const finishedAt = now().toISOString();
  writeFileSync(join(runDir, 'stages', stage.stageId, 'transcript.txt'), transcript);

  // Single-shot executors return files as path-tagged blocks in the
  // transcript; only blocks under declared write paths touch disk.
  if (stage.executor?.kind === 'openrouter') {
    const { accepted } = filterDeclaredWrites(parseFileBlocks(transcript), stage.outputs);
    for (const file of accepted) {
      const target = join(sandboxDir, file.path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, file.content);
    }
  }

  const outputFiles = stage.outputs.flatMap((prefix) => collectOutputs(sandboxDir, prefix));
  if (outputFiles.length === 0) {
    throw new Error(
      `stage '${stage.stageId}' produced no declared outputs under: ${stage.outputs.join(', ')}`
    );
  }

  const artifactDir = join(runDir, 'artifacts', artifactKind);
  const manifestPath = join(artifactDir, 'manifest.json');
  const files: ArtifactRef[] = [];
  for (const relativePath of outputFiles) {
    const target = join(artifactDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(sandboxDir, relativePath), target);
    files.push({
      path: target.slice(runDir.length + 1),
      sha256: hashFile(target).sha256,
    });
  }

  const manifest =
    artifactKind === 'code'
      ? ({
          version: CODE_VERSION,
          specRef,
          files,
          language: inferLanguage(files),
        } satisfies CodeManifest)
      : ({
          version: TEST_VERSION,
          specRef,
          files,
          language: inferLanguage(files),
          framework: 'node:test',
          frozen: true,
        } satisfies TestManifest);
  if (artifactKind === 'code') {
    mustValidate(validateCodeManifest(manifest), 'code manifest');
  } else {
    mustValidate(validateTestManifest(manifest), 'test manifest');
  }
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    stage,
    manifest,
    manifestRef: {
      path: manifestPath.slice(runDir.length + 1),
      sha256: hashFile(manifestPath).sha256,
    },
    promptSha256: hashValue(prompt),
    startedAt,
    finishedAt,
  };
}

function stageTraceRecord(outcome: StageOutcome, specRef: ArtifactRef): Trace['stages'][number] {
  return {
    stageId: outcome.stage.stageId,
    inputs: [specRef],
    outputs: [outcome.manifestRef],
    model: outcome.stage.executor?.model,
    promptSha256: outcome.promptSha256,
    startedAt: outcome.startedAt,
    finishedAt: outcome.finishedAt,
  };
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
  const codeAddendum =
    codeStage.executor?.kind === 'openrouter'
      ? `${specBlock}\nRespond with file blocks only — no prose, no planning, no commentary.\nReturn each file as a fenced code block tagged with its path, e.g.\n\`\`\`js path=${codeStage.outputs[0]}/example.js\n<file contents>\n\`\`\`\nOnly files under: ${codeStage.outputs.join(', ')}.\n`
      : `${specBlock}\nThe specification is also available at '${plan.specRef.path}' inside your working directory. Write implementation files under: ${codeStage.outputs.join(', ')}. Do not write anywhere else.\n`;
  const testAddendum =
    testStage.executor?.kind === 'openrouter'
      ? `${specBlock}\nRespond with file blocks only — no prose, no planning, no commentary.\nReturn each file as a fenced code block tagged with its path, e.g.\n\`\`\`js path=${testStage.outputs[0]}/example.test.js\n<file contents>\n\`\`\`\nOnly files under: ${testStage.outputs.join(', ')}. Tests run with \`node --test\` against code merged as a sibling tree (e.g. require('../src/...') from ${testStage.outputs[0]}).\nTests MUST be CommonJS using node:test and node:assert/strict, exactly like:\n\`\`\`js\nconst test = require('node:test');\nconst assert = require('node:assert/strict');\nconst { functionUnderTest } = require('../src/<module>.js');\ntest('describes behavior', () => {\n  assert.deepEqual(functionUnderTest('input'), 'expected');\n});\n\`\`\`\nDo NOT use import/export syntax. Do NOT use Jest/Vitest APIs (expect, toEqual, describe/it from jest).\n`
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
  return createOpenRouterExecutor({
    model: stage.executor.model,
    temperature: stage.executor.temperature,
  });
}

function collectOutputs(sandboxDir: string, prefix: string): string[] {
  const absolute = join(sandboxDir, prefix);
  if (!existsSync(absolute)) {
    return [];
  }
  if (statSync(absolute).isDirectory()) {
    return collectFiles(absolute).map((entry) => `${prefix}/${entry}`);
  }
  return [prefix];
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

function mustValidate<T>(result: ValidationResult<T>, artifact: string): T {
  if (!result.ok) {
    const details = result.errors.map((error) => `${error.path}: ${error.message}`).join('; ');
    throw new Error(`invalid ${artifact}: ${details}`);
  }
  return result.value;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function defaultRunId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  return `run-${stamp}-${randomBytes(3).toString('hex')}`;
}
