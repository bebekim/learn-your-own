import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
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
import { loadTuning } from '../config/tuning.ts';

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

export function syncWorkspaceToCorpus(input: SyncCorpusOnceInput & { workspaceRoot: string }): SyncCorpusLedgerSummary {
  const workspaceRoot = resolve(input.workspaceRoot);
  const dbPath = join(workspaceRoot, '.agent-learning', 'learning.sqlite');
  if (resolve(input.corpusPath) === dbPath) throw new Error('The central corpus must be separate from the workspace ledger');
  const corpus = openWritableCorpus(input.corpusPath);
  try {
    const relativeWorkspace = relative(input.rootDir, workspaceRoot) || '.';
    return importLedger(corpus, { dbPath, workspaceRoot, relativeWorkspace,
      depth: relativeWorkspace === '.' ? 0 : relativeWorkspace.split(/[\\/]/).length });
  } finally { corpus.close(); }
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
  mkdirSync(dirname(corpusPath), { recursive: true });
  const db = new DatabaseSync(corpusPath);
  db.exec(`PRAGMA busy_timeout = ${loadTuning().sqlite.busyTimeoutMs}`);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  initCorpusDb(db);
  return db;
}

function importLedger(corpus: DatabaseSync, ledger: AgentLearningLedgerLocation): SyncCorpusLedgerSummary {
  const ledgerId = ledgerIdForPath(ledger.dbPath);
  const now = new Date().toISOString();
  const batchId = `${ledgerId}:${randomUUID()}`;
  const source = new DatabaseSync(ledger.dbPath, { readOnly: true });

  try {
    source.exec('BEGIN');
    corpus.exec('BEGIN IMMEDIATE');
    upsertLedger(corpus, ledger, ledgerId, now);
    startBatch(corpus, batchId, ledgerId, now);
    const runs = importRuns(corpus, source, ledgerId, now);
    const events = importHookEvents(corpus, source, ledgerId, now);
    // Repair projections left behind by the old hash-order cursor once.
    const runIds = getCursor(corpus, ledgerId, 'identity-sync-v1') === 'complete' ? events.runIds
      : tableExists(source, 'hook_events') ? (source.prepare('select distinct coalesce(turn_id, session_id) run_id from hook_events')
        .all() as unknown as RunKeyRow[]).map(row => row.run_id) : [];
    const compiled = importCompiledTelemetry(corpus, source, ledgerId, batchId, now, runIds);
    updateCursor(corpus, ledgerId, 'identity-sync-v1', 'complete', now);
    finishBatch(corpus, batchId, now);
    corpus.exec('COMMIT');
    return {
      ledgerId,
      dbPath: ledger.dbPath,
      workspaceRoot: ledger.workspaceRoot,
      relativeWorkspace: ledger.relativeWorkspace,
      imported: { runs, hookEvents: events.imported, ...compiled },
    };
  } catch (error) {
    if (corpus.isTransaction) corpus.exec('ROLLBACK');
    upsertLedger(corpus, ledger, ledgerId, now);
    startBatch(corpus, batchId, ledgerId, now);
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
  const rows = source.prepare(`
    select run_id, task_shape, channel, status, token_cost, created_at
    from runs
    order by created_at, run_id
  `).all() as unknown as RunRow[];
  const insert = corpus.prepare(`
    insert into corpus_runs (
      source_ledger_id,
      run_id,
      task_shape,
      channel,
      status,
      token_cost,
      created_at,
      imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(source_ledger_id, run_id) do update set
      task_shape=excluded.task_shape, channel=excluded.channel, status=excluded.status,
      token_cost=excluded.token_cost, created_at=excluded.created_at, imported_at=excluded.imported_at
    where task_shape is not excluded.task_shape or channel is not excluded.channel
      or status is not excluded.status or token_cost is not excluded.token_cost or created_at is not excluded.created_at
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
  return imported;
}

function importHookEvents(
  corpus: DatabaseSync,
  source: DatabaseSync,
  ledgerId: string,
  importedAt: string
): { imported: number; runIds: string[] } {
  if (!tableExists(source, 'hook_events')) return { imported: 0, runIds: [] };
  // ponytail: scan each ledger and compare identities/content; a source change
  // sequence can replace this if large ledgers make scanning expensive.
  const columns = source.prepare('pragma table_info(hook_events)').all() as { name: string }[];
  const rows = source.prepare(`
    select event_id, session_id, turn_id, event_name, cwd, model,
      ${columns.some(c => c.name === 'lyo_version') ? 'lyo_version' : 'null as lyo_version'}, payload_json, created_at
    from hook_events
    order by created_at, rowid
  `).all() as unknown as HookEventRow[];
  const previous = new Map((corpus.prepare('select event_id, coalesce(turn_id, session_id) run_id from corpus_events where source_ledger_id=?')
    .all(ledgerId) as unknown as Array<{ event_id: string; run_id: string }>).map(row => [row.event_id, row.run_id]));
  const runIds = new Set<string>();
  const insert = corpus.prepare(`
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
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(source_ledger_id, event_id) do update set
      session_id=excluded.session_id, turn_id=excluded.turn_id, event_name=excluded.event_name,
      cwd=excluded.cwd, model=excluded.model, lyo_version=excluded.lyo_version,
      payload_json=excluded.payload_json, created_at=excluded.created_at, imported_at=excluded.imported_at
    where session_id is not excluded.session_id or turn_id is not excluded.turn_id
      or event_name is not excluded.event_name or cwd is not excluded.cwd or model is not excluded.model
      or lyo_version is not excluded.lyo_version or payload_json is not excluded.payload_json or created_at is not excluded.created_at
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
    if (result.changes) {
      runIds.add(row.turn_id ?? row.session_id);
      const oldRun = previous.get(row.event_id);
      if (oldRun) runIds.add(oldRun);
    }
  }
  return { imported, runIds: [...runIds] };
}

function importCompiledTelemetry(
  corpus: DatabaseSync,
  source: DatabaseSync,
  ledgerId: string,
  batchId: string,
  importedAt: string,
  runIds: string[]
): { actions: number; effects: number } {
  if (!tableExists(source, 'hook_events')) return { actions: 0, effects: 0 };

  const sourceKernel = { db: source, dbPath: 'source-ledger' };
  let actions = 0;
  let effects = 0;

  for (const runId of runIds) {
    const ast = compileTelemetryRunAst(sourceKernel, { runId });
    const oldActions = Number(corpus.prepare('delete from corpus_actions where source_ledger_id=? and run_id=?').run(ledgerId, runId).changes);
    const oldEffects = Number(corpus.prepare("delete from corpus_effects where source_ledger_id=? and scope_kind='run' and scope_id=?").run(ledgerId, runId).changes);
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

    actions -= Math.min(oldActions, ast.actions.length);
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
    effects += Math.max(0, Number(effectResult.changes) - oldEffects);
  }

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
