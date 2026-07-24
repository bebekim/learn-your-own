import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compilePromptArtifact,
  compileSeparatedCodeAndTestPromptArtifacts,
} from '../src/index.ts';

function fixture() {
  return {
    pipelineId: 'pipeline-1',
    objective: 'Implement the lesson delivery API from the PRD.',
    specPaths: ['spec/lesson-delivery.md'],
    interfacePaths: ['src/types/activation.ts'],
    sourceReadPaths: ['src/activation'],
    existingTestReadPaths: ['tests/helpers'],
    codeOutputPaths: ['generated/src'],
    testOutputPaths: ['generated/tests'],
    acceptanceCriteria: [
      'Code writer produces implementation artifacts only.',
      'Test writer produces test artifacts only.',
      'Both artifacts preserve the PRD acceptance criteria.',
    ],
    constraints: [
      'Keep stages stateless.',
    ],
  };
}

test('separated code and test prompts compile into independent artifacts', () => {
  const compiled = compileSeparatedCodeAndTestPromptArtifacts(fixture());
  const { codeWriter, testWriter } = compiled.artifacts;

  assert.equal(compiled.execution.mode, 'parallel_independent');
  assert.equal(compiled.separation.statelessStages, true);
  assert.deepEqual(compiled.execution.stages, ['code-writer', 'test-writer']);

  assert.equal(codeWriter.kind, 'compiled_prompt');
  assert.equal(codeWriter.stage, 'code-writer');
  assert.equal(codeWriter.config.memory.persistent, false);
  assert.deepEqual(codeWriter.config.authority.write, ['generated/src']);
  assert.deepEqual(codeWriter.config.authority.forbiddenRead, [
    'generated/tests',
    'tests/helpers',
  ]);
  assert.equal(codeWriter.config.authority.read.includes('generated/tests'), false);
  assert.match(codeWriter.content, /Stage: code-writer/);
  assert.match(codeWriter.content, /Leave test design to the test-writer stage\./);

  assert.equal(testWriter.stage, 'test-writer');
  assert.equal(testWriter.config.memory.persistent, false);
  assert.deepEqual(testWriter.config.authority.write, ['generated/tests']);
  assert.deepEqual(testWriter.config.authority.forbiddenRead, ['generated/src']);
  assert.equal(testWriter.config.authority.read.includes('generated/src'), false);
  assert.match(testWriter.content, /Stage: test-writer/);
  assert.match(testWriter.content, /Leave implementation changes to the code-writer stage\./);

  assert.notEqual(codeWriter.artifactId, testWriter.artifactId);
});

test('compiled prompt artifact hashes are deterministic over normalized config', () => {
  const first = compileSeparatedCodeAndTestPromptArtifacts({
    ...fixture(),
    specPaths: ['spec/lesson-delivery.md', 'spec/lesson-delivery.md'],
    sourceReadPaths: ['src/activation', 'src/activation'],
  });
  const second = compileSeparatedCodeAndTestPromptArtifacts({
    ...fixture(),
    sourceReadPaths: ['src/activation'],
    specPaths: ['spec/lesson-delivery.md'],
  });

  assert.equal(first.artifacts.codeWriter.artifactId, second.artifacts.codeWriter.artifactId);
  assert.equal(first.artifacts.testWriter.sourceHash, second.artifacts.testWriter.sourceHash);
  assert.deepEqual(first.artifacts.codeWriter.config, second.artifacts.codeWriter.config);
});

test('compilePromptArtifact rejects authority overlaps', () => {
  assert.throws(
    () => compilePromptArtifact({
      stage: 'code-writer',
      roleTemplate: 'implementation',
      objective: 'Write code.',
      authority: {
        read: ['generated/tests'],
        write: ['generated/src'],
        forbiddenRead: ['generated/tests'],
        forbiddenWrite: [],
        tools: {
          terminal: false,
          internet: false,
          github: false,
        },
      },
      contract: {
        inputs: ['spec/prd.md'],
        outputs: ['generated/src'],
        forbiddenInputs: ['generated/tests'],
        acceptanceCriteria: [],
      },
      constraints: [],
      skills: ['implementation'],
      memory: {
        persistent: false,
        readsHistory: false,
      },
    }),
    /cannot both read and forbid/
  );

  assert.throws(
    () => compilePromptArtifact({
      stage: 'test-writer',
      roleTemplate: 'test-generation',
      objective: 'Write tests.',
      authority: {
        read: [' generated/src '],
        write: ['generated/tests'],
        forbiddenRead: ['generated/src'],
        forbiddenWrite: [],
        tools: {
          terminal: false,
          internet: false,
          github: false,
        },
      },
      contract: {
        inputs: ['spec/prd.md'],
        outputs: ['generated/tests'],
        forbiddenInputs: ['generated/src'],
        acceptanceCriteria: [],
      },
      constraints: [],
      skills: ['test-design'],
      memory: {
        persistent: false,
        readsHistory: false,
      },
    }),
    /cannot both read and forbid/
  );
});
