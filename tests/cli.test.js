import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ROOT,
  runLyo,
  runLyoJson,
} from './helpers/cli.js';

test('lyo init creates a SQLite ledger at the requested path', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cli-'));
  try {
    const dbPath = join(dir, 'learning.sqlite');
    const parsed = runLyoJson(['init', '--db', dbPath]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dbPath, dbPath);
    assert.equal(existsSync(dbPath), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo demo fixture-replay shows rejected first promotion and positive credit', () => {
  const parsed = runLyoJson(['demo', 'fixture-replay', '--db', ':memory:']);
  assert.equal(parsed.ok, true);
  assert.match(parsed.firstPromotionError, /requires at least 2 evidence items/);
  assert.equal(parsed.promoted.status, 'active');
  assert.equal(parsed.credit.adaptiveCredit, 20);
});

test('lyo help lists effect reports and audits', () => {
  const output = runLyo(['--help']);

  assert.match(
    output,
    /lyo report \[--db path\] \[--semantic \[--lower\] --run-id id\] \[--effects --run-id id\] \[--style --run-id id\] \[--at-bat --run-id id --task-context path\]/
  );
  assert.match(output, /lyo audit \[--dir path\]/);
});

test('lyo telemetry inspect reads a canonical artifact without opening a ledger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-telemetry-'));
  try {
    const path = join(dir, 'run.ndjson');
    writeFileSync(path, [
      JSON.stringify({
        schema: 'lyo.telemetry.v1', eventId: 'native-1', runId: 'run-1', source: 'native',
        kind: 'prompt', occurredAt: '2026-08-10T00:00:00.000Z', payload: {},
      }),
      JSON.stringify({
        schema: 'lyo.telemetry.v1', eventId: 'shepherd-1', runId: 'run-1', source: 'shepherd',
        kind: 'file', occurredAt: '2026-08-10T00:00:01.000Z', payload: {},
      }),
    ].join('\n'));

    const parsed = runLyoJson(['telemetry', 'inspect', '--file', path]);
    assert.deepEqual(parsed.summary, {
      events: 2,
      runs: 1,
      bySource: { native: 1, shepherd: 1 },
      byKind: { prompt: 1, file: 1 },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo telemetry convert-shepherd converts a flat Shepherd export', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-shepherd-export-'));
  try {
    const input = join(dir, 'trajectory.json');
    const output = join(dir, 'telemetry.ndjson');
    writeFileSync(input, JSON.stringify({
      total_effects: 1,
      timeline: [{ effect_type: 'file_patch', path: 'src/main.ts', timestamp: 1_756_339_200 }],
    }));

    const parsed = runLyoJson([
      'telemetry', 'convert-shepherd', '--file', input, '--run-id', 'run-1', '--output', output,
    ]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.summary.events, 1);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).source, 'shepherd');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo telemetry compile runs the existing compiler on canonical telemetry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-telemetry-compile-'));
  try {
    const path = join(dir, 'telemetry.ndjson');
    writeFileSync(path, [
      JSON.stringify({ schema: 'lyo.telemetry.v1', eventId: 'p', runId: 'run-1', source: 'shepherd', kind: 'prompt', occurredAt: '2026-08-10T00:00:00.000Z', payload: { user_prompt: 'fix it' } }),
      JSON.stringify({ schema: 'lyo.telemetry.v1', eventId: 'f', runId: 'run-1', source: 'shepherd', kind: 'file', occurredAt: '2026-08-10T00:00:01.000Z', payload: { effect_type: 'file_patch', path: 'src/main.ts' } }),
    ].join('\n'));
    const parsed = runLyoJson(['telemetry', 'compile', '--file', path]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.runId, 'run-1');
    assert.ok(parsed.telemetry.actions.length >= 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo pipeline run refuses a plan that violates blindness', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cli-pipeline-'));
  try {
    const spec = {
      version: 'lyo.spec.v1',
      specId: 'add-spec',
      signatures: ['add(a, b)'],
      invariants: ['commutative'],
      constraints: [],
      examples: [],
    };
    const specPath = join(dir, 'spec.json');
    writeFileSync(specPath, JSON.stringify(spec));
    const specRef = {
      path: 'spec.json',
      sha256: createHash('sha256')
        .update(readFileSync(specPath))
        .digest('hex'),
    };
    const stage = (stageId, role, write, forbiddenRead) => ({
      stageId,
      role,
      executor: { kind: 'kimi-cli', model: 'unused' },
      authority: { read: ['spec.json'], write: [write], forbiddenRead, forbiddenWrite: [] },
      inputs: [specRef],
      outputs: [write],
    });
    const plan = {
      version: 'lyo.plan.v1',
      planId: 'bad-plan',
      specRef,
      stages: [
        stage('stage-code', 'code-writer', 'generated/src', []),
        stage('stage-test', 'test-writer', 'generated/tests', ['generated/src']),
      ],
      feedbackPolicy: { codeWriterSees: 'aggregate_only' },
      stateless: true,
    };
    const planPath = join(dir, 'plan.json');
    writeFileSync(planPath, JSON.stringify(plan));

    const parsed = runLyoJson(
      ['pipeline', 'run', '--plan', planPath, '--runs-root', join(dir, 'runs')],
      { expectFailure: true }
    );
    assert.equal(parsed.ok, false);
    assert.match(parsed.error.message, /forbidden from reading test output/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pipeline proposals lists and reviews spec proposals', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-cli-proposals-'));
  try {
    const runDir = join(dir, 'run-x');
    mkdirSync(join(runDir, 'spec-proposals'), { recursive: true });
    const proposal = {
      version: 'lyo.spec-proposal.v1',
      proposalId: 'prop-x-1',
      specRef: { path: 'spec.json', sha256: 'a'.repeat(64) },
      specId: 'x-spec',
      edit: 'Add: quote characters inside unquoted fields are literal.',
      rationale: 'both readings defensible',
      evidence: 'mixed quoted fields',
      sourceRuns: ['run-x'],
      status: 'pending',
      createdAt: '2026-08-04T00:00:00.000Z',
    };
    writeFileSync(join(runDir, 'spec-proposals', 'prop-x-1.json'), JSON.stringify(proposal));

    const listed = runLyoJson(['pipeline', 'proposals', '--run', runDir]);
    assert.equal(listed.ok, true);
    assert.equal(listed.proposals.length, 1);
    assert.equal(listed.proposals[0].status, 'pending');

    const reviewed = runLyoJson(['pipeline', 'proposal-review', '--run', runDir, '--id', 'prop-x-1', '--status', 'accepted']);
    assert.equal(reviewed.ok, true);
    assert.equal(reviewed.status, 'accepted');
    assert.equal(JSON.parse(readFileSync(join(runDir, 'spec-proposals', 'prop-x-1.json'), 'utf8')).status, 'accepted');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
