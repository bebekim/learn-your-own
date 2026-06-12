import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

test('implementation modules do not import domain types from the public barrel', () => {
  const offenders = sourceFiles(SRC)
    .filter((filePath) => !['src/index.ts', 'src/cli.ts'].includes(relative(ROOT, filePath)))
    .filter((filePath) => /from\s+['"](?:\.\.?\/)+index\.ts['"]/.test(readFileSync(filePath, 'utf8')))
    .map((filePath) => relative(ROOT, filePath));

  assert.deepEqual(offenders, []);
});

test('hook normalization runner is owned by the hooks layer, not the public barrel', () => {
  assert.equal(existsSync(join(SRC, 'hooks', 'normalization-runner.ts')), true);
  assert.equal(readFileSync(join(SRC, 'index.ts'), 'utf8').includes('export function normalizeHooks'), false);
});

test('hook adapters share runtime utilities instead of duplicating hashing and prompt storage', () => {
  assert.equal(existsSync(join(SRC, 'adapters', 'runtime.ts')), true);

  const duplicatedHelpers = [
    'function createHookEventId',
    'function fingerprintHookValue',
    'function writePromptBlob',
  ];
  const adapterFiles = [
    join(SRC, 'adapters', 'codex.ts'),
    join(SRC, 'adapters', 'claude.ts'),
  ];

  const offenders = [];
  for (const filePath of adapterFiles) {
    const source = readFileSync(filePath, 'utf8');
    for (const helper of duplicatedHelpers) {
      if (source.includes(helper)) {
        offenders.push(`${relative(ROOT, filePath)}:${helper}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});

test('hook runtime capture is owned outside the public barrel', () => {
  assert.equal(existsSync(join(SRC, 'hooks', 'runtime.ts')), true);

  const publicBarrel = readFileSync(join(SRC, 'index.ts'), 'utf8');
  for (const implementationDetail of [
    'export function handleCodexHook',
    'export function handleClaudeHook',
    'function ingestHookSpoolPacket',
  ]) {
    assert.equal(publicBarrel.includes(implementationDetail), false, implementationDetail);
  }
});

test('hook runtime shares event persistence and normalization flow', () => {
  const runtime = readFileSync(join(SRC, 'hooks', 'runtime.ts'), 'utf8');
  assert.match(runtime, /function persistHookObservation/);
  assert.match(runtime, /function maybeNormalizeHookEvent/);
  assert.equal((runtime.match(/recordSessionStarted\(kernel/g) ?? []).length, 1);
  assert.equal((runtime.match(/recordPromptBoundary\(kernel/g) ?? []).length, 1);
});

test('domain type declarations are split by architectural boundary', () => {
  for (const fileName of ['core.ts', 'observation.ts', 'activation.ts']) {
    assert.equal(existsSync(join(SRC, 'types', fileName)), true, fileName);
  }

  const compatibilityBarrel = readFileSync(join(SRC, 'types.ts'), 'utf8');
  assert.equal(compatibilityBarrel.includes('export interface'), false);
  assert.match(compatibilityBarrel, /types\/core\.ts/);

  const implementationTypeBarrelImports = sourceFiles(SRC)
    .filter((filePath) => relative(ROOT, filePath) !== 'src/index.ts')
    .filter((filePath) => /from\s+['"](?:\.\.?\/)+types\.ts['"]/.test(readFileSync(filePath, 'utf8')))
    .map((filePath) => relative(ROOT, filePath));

  assert.deepEqual(implementationTypeBarrelImports, []);
});

test('reducer grammar is split by responsibility behind a stable public barrel', () => {
  for (const fileName of ['core.ts', 'protocols.ts', 'observation.ts', 'demo.ts', 'shared.ts']) {
    assert.equal(existsSync(join(SRC, 'reducers', fileName)), true, fileName);
  }

  const reducerBarrel = readFileSync(join(SRC, 'reducers.ts'), 'utf8');
  assert.equal(reducerBarrel.includes('kernel.db.prepare'), false);
  assert.match(reducerBarrel, /reducers\/core\.ts/);
  assert.match(reducerBarrel, /reducers\/protocols\.ts/);

  const reducerImplementationImports = sourceFiles(join(SRC, 'reducers'))
    .filter((filePath) => /from\s+['"](?:\.\.?\/)+reducers\.ts['"]/.test(readFileSync(filePath, 'utf8')))
    .map((filePath) => relative(ROOT, filePath));

  assert.deepEqual(reducerImplementationImports, []);
});

test('activation module is a barrel over capture, derivation, and reporting modules', () => {
  for (const fileName of ['records.ts', 'derivation.ts', 'reports.ts', 'matching.ts']) {
    assert.equal(existsSync(join(SRC, 'activation', fileName)), true, fileName);
  }

  const activationBarrel = readFileSync(join(SRC, 'activation.ts'), 'utf8');
  assert.equal(activationBarrel.includes('kernel.db.prepare'), false);
  assert.equal(activationBarrel.includes('function summarizeJobActivations'), false);
});

test('CLI executable delegates to split command modules', () => {
  for (const fileName of ['args.ts', 'coercion.ts', 'commands.ts', 'hooks.ts', 'output.ts', 'runner.ts']) {
    assert.equal(existsSync(join(SRC, 'cli', fileName)), true, fileName);
  }

  const entrypoint = readFileSync(join(SRC, 'cli.ts'), 'utf8');
  assert.match(entrypoint, /runCli/);
  assert.equal(entrypoint.includes('createKernel'), false);
  assert.equal(entrypoint.includes('if (command'), false);

  const runner = readFileSync(join(SRC, 'cli', 'runner.ts'), 'utf8');
  assert.equal(runner.includes('recordWorkspace'), false);
  assert.equal(runner.includes('COMMAND_HANDLERS'), false);

  const commands = readFileSync(join(SRC, 'cli', 'commands.ts'), 'utf8');
  assert.match(commands, /COMMAND_HANDLERS/);
});

test('CLI command handlers are grouped by command ownership', () => {
  for (const fileName of [
    'activation.ts',
    'context.ts',
    'demo.ts',
    'hooks.ts',
    'init.ts',
    'observation.ts',
    'runs.ts',
    'workspace.ts',
  ]) {
    assert.equal(existsSync(join(SRC, 'cli', 'commands', fileName)), true, fileName);
  }

  const registry = readFileSync(join(SRC, 'cli', 'commands.ts'), 'utf8');
  assert.equal(registry.includes('function sessionStartCommand'), false);
  assert.equal(registry.includes('function recordModelCallCommand'), false);
  assert.equal(registry.includes('function workspaceRegisterCommand'), false);
  assert.equal(registry.includes("from '../activation.ts'"), false);
  assert.equal(registry.includes("from '../reducers.ts'"), false);
  assert.equal(registry.includes("from '../ledger.ts'"), false);
  assert.match(registry, /OBSERVATION_COMMANDS/);
  assert.match(registry, /WORKSPACE_COMMANDS/);
});

test('CLI enum coercion is table driven', () => {
  const coercion = readFileSync(join(SRC, 'cli', 'coercion.ts'), 'utf8');
  assert.match(coercion, /function oneOf/);
  assert.equal(coercion.includes("value === 'started' ||"), false);
  assert.equal(coercion.includes("value === 'file_read'"), false);
  assert.equal(coercion.includes("value === 'test'"), false);
});

test('typecheck is part of the local and CI verification surface', () => {
  const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(typeof packageJson.scripts.typecheck, 'string');
  assert.match(packageJson.scripts.typecheck, /tsc --noEmit/);

  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'node.js.yml'), 'utf8');
  assert.match(workflow, /npm run typecheck/);
});

test('candidate at-bat report assembly delegates verifier policy and scoring', () => {
  const candidateDir = join(SRC, 'compiler', 'candidate-at-bat');
  for (const fileName of ['verifiers.ts', 'scoring.ts']) {
    assert.equal(existsSync(join(candidateDir, fileName)), true, fileName);
  }

  const assembler = readFileSync(join(SRC, 'compiler', 'candidate-at-bat.ts'), 'utf8');
  for (const extractedFunction of [
    'function evaluateVerifierSpecs',
    'function verifierQuality',
    'function classifyOutcome',
    'function classifyFailureRecovery',
    'function classifyRiskControl',
    'function classifyClaimEvidenceAlignment',
  ]) {
    assert.equal(assembler.includes(extractedFunction), false, extractedFunction);
  }
});

function sourceFiles(root) {
  const files = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
    } else if (entry.endsWith('.ts')) {
      files.push(path);
    }
  }
  return files;
}
