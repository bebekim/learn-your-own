import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

import { hashFile } from '../contract/refs.ts';
import { PLAN_VERSION, type Plan, type PlanStage } from '../contract/plan.ts';
import { SPEC_VERSION, type Spec } from '../contract/spec.ts';

export interface CompiledSpecBridge {
  spec: Spec;
  plan: Plan;
}

const DEFAULT_CODE_EXECUTOR = { kind: 'upstage', model: 'solar-pro4', temperature: 0.2 } as const;
const DEFAULT_TEST_EXECUTOR = { kind: 'openrouter', model: 'z-ai/glm-5.2', temperature: 0.7 } as const;
const CODE_OUTPUTS = ['generated/src'];
const TEST_OUTPUTS = ['generated/tests'];

/**
 * Compile a night-shift markdown spec into the pipeline's contract artifacts.
 * Mechanical mapping — no model involved; the human-authored spec stays the
 * source of truth and the compiler just rehouses it.
 */
export function compileSpecMarkdown({ specPath }: { specPath: string }): CompiledSpecBridge {
  const markdown = readFileSync(specPath, 'utf8');
  const sections = parseSections(markdown);

  const specId = basename(specPath).replace(/\.md$/, '').replace(/^draft-/, '');
  const signatures = bullets(sections.get('signatures') ?? '');
  const desiredBehavior = bullets(sections.get('desired behavior') ?? '');
  const acceptance = checkboxes(sections.get('acceptance criteria') ?? '');
  const nonGoals = bullets(sections.get('non-goals') ?? '');
  const environment = bullets(sections.get('environment') ?? '');

  const spec: Spec = {
    version: SPEC_VERSION,
    specId,
    signatures:
      signatures.length > 0 ? signatures : desiredBehavior.slice(0, 1).filter(Boolean),
    invariants: acceptance.length > 0 ? acceptance : desiredBehavior,
    constraints: [...nonGoals, ...environment],
    examples: [],
    edgeCaseHints: bullets(sections.get('edge cases') ?? ''),
  };

  const specSha = hashFile(specPath).sha256;
  const specFileName = basename(specPath);
  const specRef = { path: specFileName, sha256: specSha };
  const stage = (
    stageId: string,
    role: PlanStage['role'],
    executor: PlanStage['executor'],
    write: string[],
    forbidden: string[]
  ): PlanStage => ({
    stageId,
    role,
    executor,
    authority: {
      read: [specFileName],
      write,
      forbiddenRead: forbidden,
      forbiddenWrite: forbidden,
    },
    inputs: [specRef],
    outputs: write,
  });

  const plan: Plan = {
    version: PLAN_VERSION,
    planId: `${specId}-run-1`,
    specRef,
    stages: [
      stage('stage-code', 'code-writer', DEFAULT_CODE_EXECUTOR, CODE_OUTPUTS, TEST_OUTPUTS),
      stage('stage-test', 'test-writer', DEFAULT_TEST_EXECUTOR, TEST_OUTPUTS, CODE_OUTPUTS),
      {
        stageId: 'stage-verify',
        role: 'verifier',
        authority: {
          read: [...CODE_OUTPUTS, ...TEST_OUTPUTS],
          write: [],
          forbiddenRead: [],
          forbiddenWrite: [...CODE_OUTPUTS, ...TEST_OUTPUTS],
        },
        inputs: [],
        outputs: [],
      },
    ],
    feedbackPolicy: { codeWriterSees: 'aggregate_only', maxRounds: 3 },
    stateless: true,
  };

  return { spec, plan };
}

function parseSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const parts = markdown.split(/^## /m);
  for (const part of parts.slice(1)) {
    const newline = part.indexOf('\n');
    if (newline === -1) {
      continue;
    }
    const title = part.slice(0, newline).trim().toLowerCase();
    sections.set(title, part.slice(newline + 1));
  }
  return sections;
}

function bullets(section: string): string[] {
  return section
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s+/, '').trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function checkboxes(section: string): string[] {
  return section
    .split('\n')
    .map((line) => line.replace(/^\s*- \[[ xX]\]\s+/, '').trim())
    .filter((line) => line.length > 0);
}
