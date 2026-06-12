import { basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  discoverAgentLearningLedgers,
  type AgentLearningLedgerLocation,
} from '../compiler/ledger-discovery.ts';
import { compileTelemetryRunAst } from '../compiler/frontend.ts';
import {
  foldTrace,
  hasApprovalFriction,
  hasDebugging,
  hasStoppedAfterEditWithoutVerification,
  hasUnsafeWrite,
  hasVerifiedCompletion,
} from '../compiler/semantics.ts';
import { initCorpusDb } from './schema.ts';

export interface SyncCorpusOnceInput {
  rootDir: string;
  corpusPath: string;
}

export interface SyncCorpusLedgerSummary {
  ledgerId: string;
  dbPath: string;
  workspaceRoot: string;
  relativeWorkspace: string;
  imported: {
    runs: number;
    hookEvents: number;
    actions: number;
    effects: number;
  };
}

export interface SyncCorpusOnceResult {
  ok: true;
  corpusPath: string;
  rootDir: string;
  ledgersDiscovered: number;
  ledgersImported: number;
  imported: {
    runs: number;
    hookEvents: number;
    actions: number;
    effects: number;
  };
  ledgers: SyncCorpusLedgerSummary[];
}

export interface CorpusReportInput {
  corpusPath: string;
}

export interface CorpusReportLedger {
  ledgerId: string;
  dbPath: string;
  workspaceRoot: string;
  workspaceLabel: string;
  relativeWorkspace: string;
  repoName: string;
  runs: number;
  hookEvents: number;
  actions: number;
  effects: number;
  lastSeenAt: string;
}

export interface CorpusReport {
  ok: true;
  corpusPath: string;
  totals: {
    ledgers: number;
    runs: number;
    hookEvents: number;
    actions: number;
    effects: number;
  };
  ledgers: CorpusReportLedger[];
}

interface RunRow {
  run_id: string;
  task_shape: string;
  channel: string;
  status: string;
  token_cost: number | null;
  created_at: string;
}

interface HookEventRow {
  event_id: string;
  session_id: string;
  turn_id: string | null;
  event_name: string;
  cwd: string;
  model: string | null;
  lyo_version: string | null;
  payload_json: string;
  created_at: string;
}

interface RunKeyRow {
  run_id: string;
}

export function syncCorpusOnce(input: SyncCorpusOnceInput): SyncCorpusOnceResult {
  const corpus = openWritableCorpus(input.corpusPath);
  try {
    const ledgers = discoverAgentLearningLedgers(input.rootDir);
    const summaries: SyncCorpusLedgerSummary[] = [];

    for (const ledger of ledgers) {
      summaries.push(importLedger(corpus, ledger));
    }

    return {
      ok: true,
      corpusPath: input.corpusPath,
      rootDir: input.rootDir,
      ledgersDiscovered: ledgers.length,
      ledgersImported: summaries.filter((summary) => totalImported(summary) > 0).length,
      imported: {
        runs: sum(summaries, (summary) => summary.imported.runs),
        hookEvents: sum(summaries, (summary) => summary.imported.hookEvents),
        actions: sum(summaries, (summary) => summary.imported.actions),
        effects: sum(summaries, (summary) => summary.imported.effects),
      },
      ledgers: summaries.filter((summary) => totalImported(summary) > 0),
    };
  } finally {
    corpus.close();
  }
}

export function corpusReport(input: CorpusReportInput): CorpusReport {
  const corpus = new DatabaseSync(input.corpusPath, { readOnly: true });
  try {
    const ledgers = corpus.prepare(`
      with
        run_counts as (
          select source_ledger_id, count(*) as runs
          from corpus_runs
          group by source_ledger_id
        ),
        event_counts as (
          select source_ledger_id, count(*) as hookEvents
          from corpus_events
          group by source_ledger_id
        ),
        action_counts as (
          select source_ledger_id, count(*) as actions
          from corpus_actions
          group by source_ledger_id
        ),
        effect_counts as (
          select source_ledger_id, count(*) as effects
          from corpus_effects
          group by source_ledger_id
        )
      select
        l.ledger_id as ledgerId,
        l.db_path as dbPath,
        l.workspace_root as workspaceRoot,
        l.workspace_root as workspaceLabel,
        l.relative_workspace as relativeWorkspace,
        l.repo_name as repoName,
        l.last_seen_at as lastSeenAt,
        coalesce(run_counts.runs, 0) as runs,
        coalesce(event_counts.hookEvents, 0) as hookEvents,
        coalesce(action_counts.actions, 0) as actions,
        coalesce(effect_counts.effects, 0) as effects
      from sync_ledgers l
      left join run_counts on run_counts.source_ledger_id = l.ledger_id
      left join event_counts on event_counts.source_ledger_id = l.ledger_id
      left join action_counts on action_counts.source_ledger_id = l.ledger_id
      left join effect_counts on effect_counts.source_ledger_id = l.ledger_id
      order by l.relative_workspace
    `).all() as unknown as CorpusReportLedger[];
    return {
      ok: true,
      corpusPath: input.corpusPath,
      totals: {
        ledgers: ledgers.length,
        runs: sum(ledgers, (ledger) => ledger.runs),
        hookEvents: sum(ledgers, (ledger) => ledger.hookEvents),
        actions: sum(ledgers, (ledger) => ledger.actions),
        effects: sum(ledgers, (ledger) => ledger.effects),
      },
      ledgers,
    };
  } finally {
    corpus.close();
  }
}

function openWritableCorpus(corpusPath: string): DatabaseSync {
  const db = new DatabaseSync(corpusPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  initCorpusDb(db);
  return db;
}

function importLedger(corpus: DatabaseSync, ledger: AgentLearningLedgerLocation): SyncCorpusLedgerSummary {
  const ledgerId = ledgerIdForPath(ledger.dbPath);
  const now = new Date().toISOString();
  const batchId = `${ledgerId}:${now}`;
  const source = new DatabaseSync(ledger.dbPath, { readOnly: true });

  try {
    upsertLedger(corpus, ledger, ledgerId, now);
    startBatch(corpus, batchId, ledgerId, now);
    const runs = importRuns(corpus, source, ledgerId, now);
    const hookEvents = importHookEvents(corpus, source, ledgerId, now);
    const compiled = importCompiledTelemetry(corpus, source, ledgerId, batchId, now);
    finishBatch(corpus, batchId, now);
    return {
      ledgerId,
      dbPath: ledger.dbPath,
      workspaceRoot: ledger.workspaceRoot,
      relativeWorkspace: ledger.relativeWorkspace,
      imported: { runs, hookEvents, ...compiled },
    };
  } catch (error) {
    failBatch(corpus, batchId, new Date().toISOString(), error);
    throw error;
  } finally {
    source.close();
  }
}

function upsertLedger(
  corpus: DatabaseSync,
  ledger: AgentLearningLedgerLocation,
  ledgerId: string,
  now: string
): void {
  corpus.prepare(`
    insert into sync_ledgers (
      ledger_id,
      db_path,
      workspace_root,
      relative_workspace,
      repo_name,
      first_seen_at,
      last_seen_at,
      status
    ) values (?, ?, ?, ?, ?, ?, ?, 'active')
    on conflict(ledger_id) do update set
      db_path = excluded.db_path,
      workspace_root = excluded.workspace_root,
      relative_workspace = excluded.relative_workspace,
      repo_name = excluded.repo_name,
      last_seen_at = excluded.last_seen_at,
      status = excluded.status
  `).run(
    ledgerId,
    ledger.dbPath,
    ledger.workspaceRoot,
    ledger.relativeWorkspace,
    basename(ledger.workspaceRoot),
    now,
    now
  );
}

function startBatch(corpus: DatabaseSync, batchId: string, ledgerId: string, now: string): void {
  corpus.prepare(`
    insert into sync_batches (batch_id, ledger_id, status, started_at)
    values (?, ?, 'running', ?)
  `).run(batchId, ledgerId, now);
}

function finishBatch(corpus: DatabaseSync, batchId: string, now: string): void {
  corpus.prepare(`
    update sync_batches
    set status = 'completed',
      finished_at = ?,
      error = null
    where batch_id = ?
  `).run(now, batchId);
}

function failBatch(corpus: DatabaseSync, batchId: string, now: string, error: unknown): void {
  corpus.prepare(`
    update sync_batches
    set status = 'failed',
      finished_at = ?,
      error = ?
    where batch_id = ?
  `).run(now, error instanceof Error ? error.message : String(error), batchId);
}

function importRuns(
  corpus: DatabaseSync,
  source: DatabaseSync,
  ledgerId: string,
  importedAt: string
): number {
  if (!tableExists(source, 'runs')) return 0;
  const cursor = getCursor(corpus, ledgerId, 'runs');
  const rows = source.prepare(`
    select run_id, task_shape, channel, status, token_cost, created_at
    from runs
    where (? is null or run_id > ?)
    order by created_at, run_id
  `).all(cursor, cursor) as unknown as RunRow[];
  const insert = corpus.prepare(`
    insert or ignore into corpus_runs (
      source_ledger_id,
      run_id,
      task_shape,
      channel,
      status,
      token_cost,
      created_at,
      imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  for (const row of rows) {
    const result = insert.run(
      ledgerId,
      row.run_id,
      row.task_shape,
      row.channel,
      row.status,
      row.token_cost ?? 0,
      row.created_at,
      importedAt
    );
    imported += Number(result.changes);
  }
  updateCursor(corpus, ledgerId, 'runs', rows.at(-1)?.run_id ?? null, importedAt);
  return imported;
}

function importHookEvents(
  corpus: DatabaseSync,
  source: DatabaseSync,
  ledgerId: string,
  importedAt: string
): number {
  if (!tableExists(source, 'hook_events')) return 0;
  const cursor = getCursor(corpus, ledgerId, 'hook_events');
  const rows = source.prepare(`
    select event_id, session_id, turn_id, event_name, cwd, model, lyo_version, payload_json, created_at
    from hook_events
    where (? is null or event_id > ?)
    order by created_at, event_id
  `).all(cursor, cursor) as unknown as HookEventRow[];
  const insert = corpus.prepare(`
    insert or ignore into corpus_events (
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let imported = 0;
  for (const row of rows) {
    const result = insert.run(
      ledgerId,
      row.event_id,
      row.session_id,
      row.turn_id,
      row.event_name,
      row.cwd,
      row.model,
      row.lyo_version,
      row.payload_json,
      row.created_at,
      importedAt
    );
    imported += Number(result.changes);
  }
  updateCursor(corpus, ledgerId, 'hook_events', rows.at(-1)?.event_id ?? null, importedAt);
  return imported;
}

function importCompiledTelemetry(
  corpus: DatabaseSync,
  source: DatabaseSync,
  ledgerId: string,
  batchId: string,
  importedAt: string
): { actions: number; effects: number } {
  if (!tableExists(source, 'hook_events')) return { actions: 0, effects: 0 };
  const cursor = getCursor(corpus, ledgerId, 'corpus_effects');

  const runRows = source.prepare(`
    select distinct coalesce(turn_id, session_id) as run_id
    from hook_events
    where coalesce(turn_id, session_id) is not null
      and (? is null or coalesce(turn_id, session_id) > ?)
    order by run_id
  `).all(cursor, cursor) as unknown as RunKeyRow[];

  const sourceKernel = { db: source, dbPath: 'source-ledger' };
  let actions = 0;
  let effects = 0;

  for (const row of runRows) {
    const ast = compileTelemetryRunAst(sourceKernel, { runId: row.run_id });
    const actionInsert = corpus.prepare(`
      insert or ignore into corpus_actions (
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
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const action of ast.actions) {
      const result = actionInsert.run(
        ledgerId,
        action.actionId,
        action.provenance.runId,
        action.provenance.sessionId,
        action.provenance.eventId,
        action.provenance.eventName ?? null,
        action.provenance.ordinal,
        action.operation,
        action.intent,
        action.risk,
        action.status,
        action.eventKind,
        action.confidence,
        JSON.stringify(action.resources.read),
        JSON.stringify(action.resources.written),
        action.command ? JSON.stringify(action.command) : null,
        JSON.stringify(action.facets),
        JSON.stringify(action.provenance),
        action.provenance.createdAt,
        batchId,
        importedAt
      );
      actions += Number(result.changes);
    }

    if (ast.actions.length === 0) continue;

    const effect = foldTrace(ast.actions);
    const effectResult = corpus.prepare(`
      insert or ignore into corpus_effects (
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
      ) values (?, 'run', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ledgerId,
      ast.runId,
      JSON.stringify(effect.reads),
      JSON.stringify(effect.writes),
      JSON.stringify(effect.executedCommands),
      JSON.stringify(effect.evidenceRefs),
      JSON.stringify({
        hasVerifiedCompletion: hasVerifiedCompletion(ast.actions),
        hasDebugging: hasDebugging(ast.actions),
        hasApprovalFriction: hasApprovalFriction(ast.actions),
        hasUnsafeWrite: hasUnsafeWrite(ast.actions),
        hasStoppedAfterEditWithoutVerification: hasStoppedAfterEditWithoutVerification(ast.actions),
      }),
      batchId,
      importedAt
    );
    effects += Number(effectResult.changes);
  }

  updateCursor(
    corpus,
    ledgerId,
    'corpus_actions',
    runRows.at(-1)?.run_id ?? null,
    importedAt
  );
  updateCursor(
    corpus,
    ledgerId,
    'corpus_effects',
    runRows.at(-1)?.run_id ?? null,
    importedAt
  );

  return { actions, effects };
}

function updateCursor(
  corpus: DatabaseSync,
  ledgerId: string,
  sourceTable: string,
  lastRowKey: string | null,
  now: string
): void {
  corpus.prepare(`
    insert into sync_cursors (ledger_id, source_table, last_row_key, updated_at)
    values (?, ?, ?, ?)
    on conflict(ledger_id, source_table) do update set
      last_row_key = excluded.last_row_key,
      updated_at = excluded.updated_at
  `).run(ledgerId, sourceTable, lastRowKey, now);
}

function getCursor(corpus: DatabaseSync, ledgerId: string, sourceTable: string): string | null {
  const row = corpus.prepare(`
    select last_row_key as lastRowKey
    from sync_cursors
    where ledger_id = ?
      and source_table = ?
  `).get(ledgerId, sourceTable) as { lastRowKey: string | null } | undefined;
  return row?.lastRowKey ?? null;
}

function tableExists(db: DatabaseSync, tableName: string): boolean {
  const row = db.prepare(`
    select 1 as found
    from sqlite_schema
    where type = 'table'
      and name = ?
  `).get(tableName) as { found: number } | undefined;
  return Boolean(row);
}

function ledgerIdForPath(dbPath: string): string {
  return Buffer.from(dbPath).toString('base64url');
}

function sum<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((total, item) => total + value(item), 0);
}

function totalImported(summary: SyncCorpusLedgerSummary): number {
  return summary.imported.runs
    + summary.imported.hookEvents
    + summary.imported.actions
    + summary.imported.effects;
}
