import { createHash } from 'node:crypto';

export type PromptArtifactStage = 'code-writer' | 'test-writer';
export type PromptArtifactKind = 'compiled_prompt';

export interface PromptToolPermissions {
  terminal: boolean;
  internet: boolean;
  github: boolean;
}

export interface PromptArtifactAuthority {
  read: string[];
  write: string[];
  forbiddenRead: string[];
  forbiddenWrite: string[];
  tools: PromptToolPermissions;
}

export interface PromptArtifactMemory {
  persistent: boolean;
  readsHistory: boolean;
}

export interface PromptArtifactContract {
  inputs: string[];
  outputs: string[];
  forbiddenInputs: string[];
  acceptanceCriteria: string[];
}

export interface PromptArtifactModelRef {
  provider?: string;
  model?: string;
  purpose?: string;
}

export interface PromptStageConfig {
  stage: PromptArtifactStage;
  roleTemplate: string;
  objective: string;
  authority: PromptArtifactAuthority;
  contract: PromptArtifactContract;
  constraints: string[];
  skills: string[];
  memory: PromptArtifactMemory;
  model?: PromptArtifactModelRef;
}

export interface CompiledPromptArtifact {
  artifactId: string;
  kind: PromptArtifactKind;
  renderer: 'lyo.prompt-artifact.v1';
  rendererVersion: 1;
  stage: PromptArtifactStage;
  sourceHash: string;
  config: PromptStageConfig;
  content: string;
}

export interface CompileSeparatedCodeAndTestPromptArtifactsInput {
  pipelineId: string;
  objective: string;
  specPaths: string[];
  interfacePaths?: string[];
  sourceReadPaths?: string[];
  existingTestReadPaths?: string[];
  codeOutputPaths: string[];
  testOutputPaths: string[];
  acceptanceCriteria?: string[];
  constraints?: string[];
  skills?: {
    codeWriter?: string[];
    testWriter?: string[];
  };
  models?: {
    codeWriter?: PromptArtifactModelRef;
    testWriter?: PromptArtifactModelRef;
  };
  toolDefaults?: Partial<PromptToolPermissions>;
}

export interface CompiledPromptArtifactPipeline {
  pipelineId: string;
  kind: 'prompt_artifact_pipeline';
  renderer: 'lyo.prompt-artifact-pipeline.v1';
  rendererVersion: 1;
  artifacts: {
    codeWriter: CompiledPromptArtifact;
    testWriter: CompiledPromptArtifact;
  };
  execution: {
    mode: 'parallel_independent';
    stages: PromptArtifactStage[];
  };
  separation: {
    statelessStages: true;
    codeWriterCannotRead: string[];
    testWriterCannotRead: string[];
    sharedInputs: string[];
  };
}

const PROMPT_RENDERER = 'lyo.prompt-artifact.v1' as const;
const PIPELINE_RENDERER = 'lyo.prompt-artifact-pipeline.v1' as const;

const DEFAULT_TOOLS: PromptToolPermissions = {
  terminal: false,
  internet: false,
  github: false,
};

export function compileSeparatedCodeAndTestPromptArtifacts(
  input: CompileSeparatedCodeAndTestPromptArtifactsInput
): CompiledPromptArtifactPipeline {
  const pipelineId = requiredText(input.pipelineId, 'pipelineId');
  const objective = requiredText(input.objective, 'objective');
  const specPaths = requiredPaths(input.specPaths, 'specPaths');
  const interfacePaths = normalizeTexts(input.interfacePaths ?? []);
  const sourceReadPaths = normalizeTexts(input.sourceReadPaths ?? []);
  const existingTestReadPaths = normalizeTexts(input.existingTestReadPaths ?? []);
  const codeOutputPaths = requiredPaths(input.codeOutputPaths, 'codeOutputPaths');
  const testOutputPaths = requiredPaths(input.testOutputPaths, 'testOutputPaths');
  const acceptanceCriteria = normalizeTexts(input.acceptanceCriteria ?? []);
  const commonConstraints = normalizeTexts(input.constraints ?? []);
  const tools = { ...DEFAULT_TOOLS, ...(input.toolDefaults ?? {}) };

  const codeWriterConfig: PromptStageConfig = {
    stage: 'code-writer',
    roleTemplate: 'implementation',
    objective,
    authority: {
      read: unionTexts([...specPaths, ...interfacePaths, ...sourceReadPaths]),
      write: codeOutputPaths,
      forbiddenRead: unionTexts([...existingTestReadPaths, ...testOutputPaths]),
      forbiddenWrite: testOutputPaths,
      tools,
    },
    contract: {
      inputs: unionTexts([...specPaths, ...interfacePaths, ...sourceReadPaths]),
      outputs: codeOutputPaths,
      forbiddenInputs: unionTexts([...existingTestReadPaths, ...testOutputPaths]),
      acceptanceCriteria,
    },
    constraints: unionTexts([
      ...commonConstraints,
      'Do not read existing or generated test artifacts.',
      'Do not write test artifacts.',
      'Produce implementation artifacts only from the declared specification and interface inputs.',
    ]),
    skills: normalizeTexts(input.skills?.codeWriter ?? [
      'implementation',
      'refactoring',
      'api-design',
    ]),
    memory: {
      persistent: false,
      readsHistory: false,
    },
    model: input.models?.codeWriter,
  };

  const testWriterConfig: PromptStageConfig = {
    stage: 'test-writer',
    roleTemplate: 'test-generation',
    objective,
    authority: {
      read: unionTexts([...specPaths, ...interfacePaths, ...existingTestReadPaths]),
      write: testOutputPaths,
      forbiddenRead: codeOutputPaths,
      forbiddenWrite: codeOutputPaths,
      tools,
    },
    contract: {
      inputs: unionTexts([...specPaths, ...interfacePaths, ...existingTestReadPaths]),
      outputs: testOutputPaths,
      forbiddenInputs: codeOutputPaths,
      acceptanceCriteria,
    },
    constraints: unionTexts([
      ...commonConstraints,
      'Do not read generated implementation artifacts.',
      'Do not write implementation artifacts.',
      'Derive tests from observable behavior in the specification and public interfaces.',
    ]),
    skills: normalizeTexts(input.skills?.testWriter ?? [
      'test-design',
      'edge-case-analysis',
      'regression-testing',
    ]),
    memory: {
      persistent: false,
      readsHistory: false,
    },
    model: input.models?.testWriter,
  };

  const codeWriter = compilePromptArtifact(codeWriterConfig);
  const testWriter = compilePromptArtifact(testWriterConfig);

  return {
    pipelineId,
    kind: 'prompt_artifact_pipeline',
    renderer: PIPELINE_RENDERER,
    rendererVersion: 1,
    artifacts: {
      codeWriter,
      testWriter,
    },
    execution: {
      mode: 'parallel_independent',
      stages: ['code-writer', 'test-writer'],
    },
    separation: {
      statelessStages: true,
      codeWriterCannotRead: codeWriterConfig.authority.forbiddenRead,
      testWriterCannotRead: testWriterConfig.authority.forbiddenRead,
      sharedInputs: intersectionTexts(
        codeWriterConfig.authority.read,
        testWriterConfig.authority.read
      ),
    },
  };
}

export function compilePromptArtifact(config: PromptStageConfig): CompiledPromptArtifact {
  const normalizedConfig = normalizeStageConfig(config);
  validateStageConfig(normalizedConfig);
  const sourceHash = hashStable({
    renderer: PROMPT_RENDERER,
    rendererVersion: 1,
    config: normalizedConfig,
  });

  return {
    artifactId: `prompt:${normalizedConfig.stage}:${sourceHash.slice(0, 16)}`,
    kind: 'compiled_prompt',
    renderer: PROMPT_RENDERER,
    rendererVersion: 1,
    stage: normalizedConfig.stage,
    sourceHash,
    config: normalizedConfig,
    content: renderPromptArtifact(normalizedConfig),
  };
}

function renderPromptArtifact(config: PromptStageConfig): string {
  const instructions = stageInstructions(config.stage);
  return [
    '# Compiled Prompt Artifact',
    '',
    `Stage: ${config.stage}`,
    `Role template: ${config.roleTemplate}`,
    `Memory: persistent=${String(config.memory.persistent)}, readsHistory=${String(config.memory.readsHistory)}`,
    '',
    'Objective:',
    config.objective,
    '',
    'Declared inputs:',
    renderList(config.contract.inputs),
    '',
    'Declared outputs:',
    renderList(config.contract.outputs),
    '',
    'Allowed reads:',
    renderList(config.authority.read),
    '',
    'Allowed writes:',
    renderList(config.authority.write),
    '',
    'Forbidden reads:',
    renderList(config.authority.forbiddenRead),
    '',
    'Forbidden writes:',
    renderList(config.authority.forbiddenWrite),
    '',
    'Tool permissions:',
    renderList([
      `terminal=${String(config.authority.tools.terminal)}`,
      `internet=${String(config.authority.tools.internet)}`,
      `github=${String(config.authority.tools.github)}`,
    ]),
    '',
    'Skills:',
    renderList(config.skills),
    '',
    'Acceptance criteria:',
    renderList(config.contract.acceptanceCriteria),
    '',
    'Constraints:',
    renderList(config.constraints),
    '',
    'Stage instructions:',
    renderList(instructions),
  ].join('\n');
}

function stageInstructions(stage: PromptArtifactStage): string[] {
  if (stage === 'code-writer') {
    return [
      'Consume only the declared inputs.',
      'Produce only implementation outputs.',
      'Leave test design to the test-writer stage.',
      'Make no claims about passing tests unless a later verifier artifact supplies evidence.',
    ];
  }

  return [
    'Consume only the declared inputs.',
    'Produce only test outputs.',
    'Test observable behavior rather than private implementation details.',
    'Leave implementation changes to the code-writer stage.',
  ];
}

function validateStageConfig(config: PromptStageConfig): void {
  requiredText(config.stage, 'stage');
  requiredText(config.roleTemplate, 'roleTemplate');
  requiredText(config.objective, 'objective');
  requiredPaths(config.authority.read, `${config.stage}.authority.read`);
  requiredPaths(config.authority.write, `${config.stage}.authority.write`);

  const forbiddenRead = new Set(config.authority.forbiddenRead);
  const forbiddenWrite = new Set(config.authority.forbiddenWrite);

  for (const path of config.authority.read) {
    if (forbiddenRead.has(path)) {
      throw new Error(`${config.stage} cannot both read and forbid '${path}'`);
    }
  }

  for (const path of config.authority.write) {
    if (forbiddenWrite.has(path)) {
      throw new Error(`${config.stage} cannot both write and forbid '${path}'`);
    }
  }
}

function normalizeStageConfig(config: PromptStageConfig): PromptStageConfig {
  return {
    ...config,
    objective: requiredText(config.objective, 'objective'),
    roleTemplate: requiredText(config.roleTemplate, 'roleTemplate'),
    authority: {
      read: normalizeTexts(config.authority.read),
      write: normalizeTexts(config.authority.write),
      forbiddenRead: normalizeTexts(config.authority.forbiddenRead),
      forbiddenWrite: normalizeTexts(config.authority.forbiddenWrite),
      tools: {
        terminal: Boolean(config.authority.tools.terminal),
        internet: Boolean(config.authority.tools.internet),
        github: Boolean(config.authority.tools.github),
      },
    },
    contract: {
      inputs: normalizeTexts(config.contract.inputs),
      outputs: normalizeTexts(config.contract.outputs),
      forbiddenInputs: normalizeTexts(config.contract.forbiddenInputs),
      acceptanceCriteria: normalizeTexts(config.contract.acceptanceCriteria),
    },
    constraints: normalizeTexts(config.constraints),
    skills: normalizeTexts(config.skills),
    memory: {
      persistent: Boolean(config.memory.persistent),
      readsHistory: Boolean(config.memory.readsHistory),
    },
  };
}

function requiredText(value: string, name: string): string {
  const text = value.trim();
  if (text.length === 0) {
    throw new Error(`${name} is required`);
  }
  return text;
}

function requiredPaths(values: string[], name: string): string[] {
  const paths = normalizeTexts(values);
  if (paths.length === 0) {
    throw new Error(`${name} must contain at least one path`);
  }
  return paths;
}

function normalizeTexts(values: string[]): string[] {
  return unionTexts(values.map((value) => value.trim()).filter((value) => value.length > 0));
}

function unionTexts(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function intersectionTexts(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).sort();
}

function renderList(values: string[]): string {
  if (values.length === 0) {
    return '- none';
  }
  return values.map((value) => `- ${value}`).join('\n');
}

function hashStable(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
