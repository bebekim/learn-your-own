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
