import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { initCorpusDb } from '../src/corpus/schema.ts';
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
        workspaceLabel: ledger.workspaceLabel,
        workspaceRoot: ledger.workspaceRoot,
        relativeWorkspace: ledger.relativeWorkspace,
        runs: ledger.runs,
        hookEvents: ledger.hookEvents,
        actions: ledger.actions,
        effects: ledger.effects,
      })),
      [{
        workspaceLabel: join(reposRoot, 'repo-a'),
        workspaceRoot: join(reposRoot, 'repo-a'),
        relativeWorkspace: 'repo-a',
        runs: 0,
        hookEvents: 2,
        actions: 2,
        effects: 1,
      }, {
        workspaceLabel: join(reposRoot, 'repo-b'),
        workspaceRoot: join(reposRoot, 'repo-b'),
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

test('corpus report aggregates large child tables without a fanout join', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-corpus-report-'));
  try {
    const corpusPath = join(dir, 'corpus.sqlite');
    seedFanoutCorpus(corpusPath, 1000);

    const report = runLyoJson([
      'corpus',
      'report',
      '--db',
      corpusPath,
      '--json',
    ], { timeout: 1500 });

    assert.equal(report.ok, true);
    assert.deepEqual(report.totals, {
      ledgers: 1,
      runs: 1,
      hookEvents: 1000,
      actions: 1000,
      effects: 1000,
    });
    assert.deepEqual(
      report.ledgers.map((ledger) => ({
        workspaceLabel: ledger.workspaceLabel,
        workspaceRoot: ledger.workspaceRoot,
        relativeWorkspace: ledger.relativeWorkspace,
        runs: ledger.runs,
        hookEvents: ledger.hookEvents,
        actions: ledger.actions,
        effects: ledger.effects,
      })),
      [{
        workspaceLabel: '/tmp/repo-fanout',
        workspaceRoot: '/tmp/repo-fanout',
        relativeWorkspace: 'repo-fanout',
        runs: 1,
        hookEvents: 1000,
        actions: 1000,
        effects: 1000,
      }]
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedFanoutCorpus(corpusPath, count) {
  const db = new DatabaseSync(corpusPath);
  try {
    db.exec('PRAGMA foreign_keys = ON');
    initCorpusDb(db);
    db.exec('BEGIN');
    db.prepare(`
      insert into sync_ledgers (
        ledger_id,
        db_path,
        workspace_root,
        relative_workspace,
        repo_name,
        first_seen_at,
        last_seen_at,
        status
      ) values ('ledger-fanout', '/tmp/repo-fanout/.agent-learning/learning.sqlite', '/tmp/repo-fanout', 'repo-fanout', 'repo-fanout', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'active')
    `).run();
    db.prepare(`
      insert into sync_batches (batch_id, ledger_id, status, started_at, finished_at)
      values ('batch-fanout', 'ledger-fanout', 'completed', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();
    db.prepare(`
      insert into corpus_runs (
        source_ledger_id,
        run_id,
        task_shape,
        channel,
        status,
        token_cost,
        created_at,
        imported_at
      ) values ('ledger-fanout', 'run-fanout', 'implementation', 'local', 'completed', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();

    const insertEvent = db.prepare(`
      insert into corpus_events (
        source_ledger_id,
        event_id,
        session_id,
        turn_id,
        event_name,
        cwd,
        model,
        lyo_version,
        payload_json,
        created_at,
        imported_at
      ) values ('ledger-fanout', ?, 'session-fanout', 'turn-fanout', 'tool.after', '/tmp/repo-fanout', 'gpt-5', '0.1.0', '{}', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `);
    const insertAction = db.prepare(`
      insert into corpus_actions (
        source_ledger_id,
        action_id,
        run_id,
        session_id,
        event_id,
        event_name,
        ordinal,
        operation,
        intent,
        risk,
        status,
        event_kind,
        confidence,
        resources_read_json,
        resources_written_json,
        command_json,
        facets_json,
        provenance_json,
        created_at,
        import_batch_id,
        imported_at
      ) values ('ledger-fanout', ?, 'run-fanout', 'session-fanout', ?, 'tool.after', ?, 'observe', 'inspect', 'none', 'succeeded', 'tool.after', 'high', '[]', '[]', null, '{}', '{}', '2026-01-01T00:00:00.000Z', 'batch-fanout', '2026-01-01T00:00:00.000Z')
    `);
    const insertEffect = db.prepare(`
      insert into corpus_effects (
        source_ledger_id,
        scope_kind,
        scope_id,
        reads_json,
        writes_json,
        executed_commands_json,
        evidence_refs_json,
        predicates_json,
        import_batch_id,
        imported_at
      ) values ('ledger-fanout', 'run', ?, '[]', '[]', '[]', '[]', '{}', 'batch-fanout', '2026-01-01T00:00:00.000Z')
    `);

    for (let index = 0; index < count; index += 1) {
      const id = String(index).padStart(4, '0');
      insertEvent.run(`event-${id}`);
      insertAction.run(`action-${id}`, `event-${id}`, index);
      insertEffect.run(`effect-${id}`);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
