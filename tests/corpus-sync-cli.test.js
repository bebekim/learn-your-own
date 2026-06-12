import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { runLyoJson } from './helpers/cli.js';
import { seedEditThenVerifierLedger } from './helpers/ledger-fixtures.js';

test('sync once imports discovered repo ledgers into a local corpus', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-corpus-sync-'));
  try {
    const reposRoot = join(dir, 'repos');
    const corpusPath = join(dir, 'corpus.sqlite');
    mkdirSync(reposRoot, { recursive: true });

    seedEditThenVerifierLedger({
      root: process.cwd(),
      corpusDir: reposRoot,
      repoName: 'repo-a',
      runId: 'run-a',
      sourcePath: 'src/a.ts',
    });
    seedEditThenVerifierLedger({
      root: process.cwd(),
      corpusDir: reposRoot,
      repoName: 'repo-b',
      runId: 'run-b',
      sourcePath: 'src/b.ts',
    });

    const result = runLyoJson([
      'sync',
      'once',
      '--dir',
      reposRoot,
      '--corpus',
      corpusPath,
      '--json',
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.ledgersDiscovered, 2);
    assert.equal(result.ledgersImported, 2);
    assert.equal(result.imported.runs, 0);
    assert.equal(result.imported.hookEvents, 4);
    assert.equal(result.imported.actions, 4);
    assert.equal(result.imported.effects, 2);
    assert.deepEqual(
      result.ledgers.map((ledger) => ledger.relativeWorkspace),
      ['repo-a', 'repo-b']
    );

    const report = runLyoJson([
      'corpus',
      'report',
      '--db',
      corpusPath,
      '--json',
    ]);

    assert.equal(report.ok, true);
    assert.equal(report.totals.ledgers, 2);
    assert.equal(report.totals.runs, 0);
    assert.equal(report.totals.hookEvents, 4);
    assert.equal(report.totals.actions, 4);
    assert.equal(report.totals.effects, 2);
    assert.deepEqual(
      report.ledgers.map((ledger) => ({
        relativeWorkspace: ledger.relativeWorkspace,
        runs: ledger.runs,
        hookEvents: ledger.hookEvents,
        actions: ledger.actions,
        effects: ledger.effects,
      })),
      [{
        relativeWorkspace: 'repo-a',
        runs: 0,
        hookEvents: 2,
        actions: 2,
        effects: 1,
      }, {
        relativeWorkspace: 'repo-b',
        runs: 0,
        hookEvents: 2,
        actions: 2,
        effects: 1,
      }]
    );

    const db = new DatabaseSync(corpusPath, { readOnly: true });
    try {
      const actionRows = db.prepare(`
        select operation, intent, risk, status
        from corpus_actions
        order by source_ledger_id, ordinal
      `).all();
      assert.deepEqual(
        actionRows.map((row) => [row.operation, row.intent, row.risk, row.status]),
        [
          ['mutate_local', 'implement', 'low', 'succeeded'],
          ['verify', 'verify', 'none', 'succeeded'],
          ['mutate_local', 'implement', 'low', 'succeeded'],
          ['verify', 'verify', 'none', 'succeeded'],
        ]
      );

      const effectRows = db.prepare(`
        select predicates_json, writes_json, executed_commands_json
        from corpus_effects
        order by source_ledger_id, scope_id
      `).all();
      assert.equal(effectRows.length, 2);
      for (const row of effectRows) {
        const predicates = JSON.parse(row.predicates_json);
        assert.equal(predicates.hasVerifiedCompletion, true);
        assert.equal(predicates.hasStoppedAfterEditWithoutVerification, false);
        assert.match(row.writes_json, /src\/[ab]\.ts/);
        assert.match(row.executed_commands_json, /npm test/);
      }
    } finally {
      db.close();
    }

    const secondSync = runLyoJson([
      'sync',
      'once',
      '--dir',
      reposRoot,
      '--corpus',
      corpusPath,
      '--json',
    ]);

    assert.equal(secondSync.ok, true);
    assert.equal(secondSync.ledgersDiscovered, 2);
    assert.equal(secondSync.ledgersImported, 0);
    assert.equal(secondSync.imported.runs, 0);
    assert.equal(secondSync.imported.hookEvents, 0);
    assert.equal(secondSync.imported.actions, 0);
    assert.equal(secondSync.imported.effects, 0);
    assert.deepEqual(secondSync.ledgers, []);

    seedEditThenVerifierLedger({
      root: process.cwd(),
      corpusDir: reposRoot,
      repoName: 'repo-a',
      runId: 'run-c',
      sourcePath: 'src/c.ts',
    });

    const thirdSync = runLyoJson([
      'sync',
      'once',
      '--dir',
      reposRoot,
      '--corpus',
      corpusPath,
      '--json',
    ]);

    assert.equal(thirdSync.ok, true);
    assert.equal(thirdSync.ledgersDiscovered, 2);
    assert.equal(thirdSync.ledgersImported, 1);
    assert.equal(thirdSync.imported.runs, 0);
    assert.equal(thirdSync.imported.hookEvents, 2);
    assert.equal(thirdSync.imported.actions, 2);
    assert.equal(thirdSync.imported.effects, 1);
    assert.deepEqual(
      thirdSync.ledgers.map((ledger) => ledger.relativeWorkspace),
      ['repo-a']
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
