/**
 * Per-stage execution: sandbox materialization, LLM call, output collection,
 * manifest emission. Extracted from run-pipeline.ts so the pipeline runner
 * stays pure orchestration.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { ArtifactRef } from '../contract/refs.ts';
import { hashFile, hashValue } from '../contract/refs.ts';
import {
  CODE_VERSION,
  mustValidate,
  TEST_VERSION,
  validateCodeManifest,
  validateTestManifest,
} from '../contract/index.ts';
import type { CodeManifest, PlanStage, TestManifest } from '../contract/index.ts';
import type { StageExecutionResult } from './executors/stage-executor.ts';
import {
  collectFiles,
  filterDeclaredWrites,
  materializeSandbox,
  parseFileBlocks,
  type FileBlock,
} from './files.ts';
import type { ExecutorFactory } from './run-pipeline.ts';

export interface StageOutcome {
  stage: PlanStage;
  manifestRef: ArtifactRef;
  manifest: CodeManifest | TestManifest;
  contents: FileBlock[];
  promptSha256: string;
  usage?: StageExecutionResult['usage'];
  startedAt: string;
  finishedAt: string;
}

export async function runWriterStage({
  stage,
  prompt,
  artifactKind,
  runDir,
  sourceRoot,
  executorFactory,
  specRef,
  now,
  round,
}: {
  stage: PlanStage;
  prompt: string;
  artifactKind: 'code' | 'tests';
  runDir: string;
  sourceRoot: string;
  executorFactory: ExecutorFactory;
  specRef: ArtifactRef;
  now: () => Date;
  round?: number;
}): Promise<StageOutcome> {
  const sandboxDir = join(runDir, 'stages', stage.stageId, 'sandbox');
  rmSync(sandboxDir, { recursive: true, force: true });
  mkdirSync(sandboxDir, { recursive: true });
  materializeSandbox({ sourceRoot, sandboxDir, readPaths: stage.authority.read });

  const transcriptName = round === undefined ? 'transcript.txt' : `transcript.round-${round}.txt`;
  const transcriptPath = join(runDir, 'stages', stage.stageId, transcriptName);
  const startedAt = now().toISOString();
  let transcript: string;
  let usage: StageExecutionResult['usage'];
  try {
    const execution = await executorFactory(stage)({ prompt, sandboxDir });
    transcript = execution.transcript;
    usage = execution.usage;
    if (
      isSingleShotKind(stage.executor?.kind) &&
      filterDeclaredWrites(parseFileBlocks(transcript), stage.outputs).accepted.length === 0
    ) {
      const corrective = await executorFactory(stage)({
        prompt:
          `${prompt}\n\nCORRECTION: your previous reply contained no path-tagged file blocks, ` +
          'so nothing could be written. Return each file as a fenced code block tagged with ' +
          `its path, exactly like:\n\`\`\`js path=${stage.outputs[0]}/example.js\n<file contents>\n\`\`\`\n` +
          'File blocks only — no prose.',
        sandboxDir,
      });
      transcript = `${transcript}\n\n--- corrective retry ---\n\n${corrective.transcript}`;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(transcriptPath, `STAGE FAILED: ${message}\n`);
    throw new Error(`stage '${stage.stageId}': ${message}`);
  }
  const finishedAt = now().toISOString();
  writeFileSync(transcriptPath, transcript);

  if (isSingleShotKind(stage.executor?.kind)) {
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
  for (const prefix of stage.outputs) {
    rmSync(join(artifactDir, prefix), { recursive: true, force: true });
  }
  const files: ArtifactRef[] = [];
  const contents: FileBlock[] = [];
  for (const relativePath of outputFiles) {
    const target = join(artifactDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(sandboxDir, relativePath), target);
    files.push({
      path: target.slice(runDir.length + 1),
      sha256: hashFile(target).sha256,
    });
    contents.push({ path: relativePath, content: readFileSync(target, 'utf8') });
    if (round !== undefined) {
      const snapshot = join(artifactDir, `files.round-${round}`, relativePath);
      mkdirSync(dirname(snapshot), { recursive: true });
      cpSync(target, snapshot);
    }
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
    contents,
    promptSha256: hashValue(prompt),
    usage,
    startedAt,
    finishedAt,
  };
}

export function isSingleShotKind(kind: string | undefined): boolean {
  return kind === 'openrouter' || kind === 'upstage';
}

export function collectOutputs(sandboxDir: string, prefix: string): string[] {
  const absolute = join(sandboxDir, prefix);
  if (!existsSync(absolute)) {
    return [];
  }
  if (statSync(absolute).isDirectory()) {
    return collectFiles(absolute).map((entry) => `${prefix}/${entry}`);
  }
  return [prefix];
}

export function inferLanguage(files: ArtifactRef[]): string {
  const extension = files[0]?.path.split('.').pop();
  const languages: Record<string, string> = {
    ts: 'typescript',
    js: 'javascript',
    mjs: 'javascript',
    py: 'python',
  };
  return languages[extension ?? ''] ?? 'unknown';
}
