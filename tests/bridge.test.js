import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyRun,
  compileSpecMarkdown,
  validatePlan,
  validateSpec,
  checkBlindness,
} from '../src/index.ts';

function withTmp(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-bridge-'));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const MD = `# Add CSV export endpoint

Priority: high
State: ready

## Problem

Operators cannot export query results without asking an engineer.

## Desired Behavior

GET /export runs the saved query and streams CSV to the client.

## Non-Goals

- No new query builder UI
- No format other than CSV

## Likely Files

- \`app/routes/export.py\`

## Environment

Requires QUERY_DB_URL.

## Dependencies

none

## Edge Cases

- Empty result set returns headers only
- 10k+ rows must stream, not buffer

## Test Expectations

- export returns 200 with text/csv content type
- empty result returns headers-only body

## Acceptance Criteria

- [ ] Endpoint streams CSV for saved queries
- [ ] Empty results return headers only
- [ ] Tests cover both cases
`;

test('compileSpecMarkdown maps night-shift sections into spec and plan artifacts', () => {
  withTmp((dir) => {
    const specPath = join(dir, 'add-csv-export.md');
    writeFileSync(specPath, MD);
    const { spec, plan } = compileSpecMarkdown({ specPath });

    const specResult = validateSpec(spec);
    assert.equal(specResult.ok, true, JSON.stringify(specResult.ok ? '' : specResult.errors));
    assert.equal(spec.specId, 'add-csv-export');
    assert.ok(spec.invariants.some((line) => line.includes('streams CSV')));
    assert.ok(spec.constraints.some((line) => line.includes('No new query builder UI')));
    assert.ok(spec.constraints.some((line) => line.includes('QUERY_DB_URL')));
    assert.ok(spec.edgeCaseHints.some((line) => line.includes('10k+ rows')));

    const planResult = validatePlan(plan);
    assert.equal(planResult.ok, true, JSON.stringify(planResult.ok ? '' : planResult.errors));
    assert.equal(checkBlindness(plan).ok, true);
    assert.equal(plan.specRef.sha256.length, 64);
    assert.equal(plan.feedbackPolicy.maxRounds, 3);
  });
});

test('applyRun copies verified code into the working tree only on pass', () => {
  withTmp((dir) => {
    const runDir = join(dir, 'run-1');
    const srcDir = join(runDir, 'artifacts/code/generated/src');
    mkdirSyncSafe(srcDir);
    writeFileSync(join(srcDir, 'export.py'), 'def export(): pass\n');
    writeFileSync(join(runDir, 'verifier-report.json'), JSON.stringify({
      version: 'lyo.verifier-report.v1',
      specRef: { path: 'spec.json', sha256: 'a'.repeat(64) },
      codeRef: { path: 'artifacts/code/manifest.json', sha256: 'b'.repeat(64) },
      testRef: { path: 'artifacts/tests/manifest.json', sha256: 'c'.repeat(64) },
      counts: { total: 2, passed: 2, failed: 0 },
      outcome: 'pass',
    }));

    const target = join(dir, 'repo');
    const result = applyRun({ runDir, targetDir: target });
    assert.deepEqual(result.copied, ['generated/src/export.py']);
    assert.equal(readFileSync(join(target, 'generated/src/export.py'), 'utf8'), 'def export(): pass\n');
  });
});

test('applyRun refuses a failing run without --force', () => {
  withTmp((dir) => {
    const runDir = join(dir, 'run-1');
    mkdirSyncSafe(join(runDir, 'artifacts/code/generated/src'));
    writeFileSync(join(runDir, 'verifier-report.json'), JSON.stringify({
      version: 'lyo.verifier-report.v1',
      specRef: { path: 'spec.json', sha256: 'a'.repeat(64) },
      codeRef: { path: 'artifacts/code/manifest.json', sha256: 'b'.repeat(64) },
      testRef: { path: 'artifacts/tests/manifest.json', sha256: 'c'.repeat(64) },
      counts: { total: 2, passed: 1, failed: 1 },
      outcome: 'fail',
    }));
    assert.throws(() => applyRun({ runDir, targetDir: join(dir, 'repo') }), /outcome/);
    const forced = applyRun({ runDir, targetDir: join(dir, 'repo'), force: true });
    assert.ok(forced.copied.length >= 0);
  });
});

function mkdirSyncSafe(path) {
  mkdirSync(path, { recursive: true });
}
