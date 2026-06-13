import type { DatabaseSync } from 'node:sqlite';

export function initCorpusDb(db: DatabaseSync): void {
  db.exec(`
    create table if not exists sync_ledgers (
      ledger_id text primary key,
      db_path text not null unique,
      workspace_root text not null,
      relative_workspace text not null,
      repo_name text not null,
      first_seen_at text not null,
      last_seen_at text not null,
      status text not null
    );

    create table if not exists sync_cursors (
      ledger_id text not null references sync_ledgers(ledger_id),
      source_table text not null,
      last_row_key text,
      updated_at text not null,
      primary key (ledger_id, source_table)
    );

    create table if not exists sync_batches (
      batch_id text primary key,
      ledger_id text not null references sync_ledgers(ledger_id),
      status text not null,
      started_at text not null,
      finished_at text,
      error text
    );

    create table if not exists sync_steps (
      batch_id text not null references sync_batches(batch_id),
      step_name text not null,
      status text not null,
      started_at text not null,
      finished_at text,
      error text,
      primary key (batch_id, step_name)
    );

    create table if not exists corpus_runs (
      source_ledger_id text not null references sync_ledgers(ledger_id),
      run_id text not null,
      task_shape text not null,
      channel text not null,
      status text not null,
      token_cost integer default 0,
      created_at text not null,
      imported_at text not null,
      primary key (source_ledger_id, run_id)
    );

    create table if not exists corpus_events (
      source_ledger_id text not null references sync_ledgers(ledger_id),
      event_id text not null,
      session_id text not null,
      turn_id text,
      event_name text not null,
      cwd text not null,
      model text,
      lyo_version text,
      payload_json text not null,
      created_at text not null,
      imported_at text not null,
      primary key (source_ledger_id, event_id)
    );

    create table if not exists corpus_actions (
      source_ledger_id text not null references sync_ledgers(ledger_id),
      action_id text not null,
      run_id text,
      session_id text not null,
      event_id text not null,
      event_name text,
      ordinal integer not null,
      operation text not null,
      intent text not null,
      risk text not null,
      status text not null,
      event_kind text not null,
      confidence text not null,
      resources_read_json text not null,
      resources_written_json text not null,
      command_json text,
      facets_json text not null,
      provenance_json text not null,
      created_at text not null,
      import_batch_id text not null references sync_batches(batch_id),
      imported_at text not null,
      primary key (source_ledger_id, action_id)
    );

    create table if not exists corpus_effects (
      source_ledger_id text not null references sync_ledgers(ledger_id),
      scope_kind text not null,
      scope_id text not null,
      reads_json text not null,
      writes_json text not null,
      executed_commands_json text not null,
      evidence_refs_json text not null,
      predicates_json text not null,
      import_batch_id text not null references sync_batches(batch_id),
      imported_at text not null,
      primary key (source_ledger_id, scope_kind, scope_id)
    );

    create table if not exists git_repositories (
      repo_id text primary key,
      repo_path text not null unique,
      head_sha text,
      first_seen_at text not null,
      last_seen_at text not null,
      status text not null,
      source text not null default 'git_history',
      visibility text not null default 'committed_trace_only',
      confidence text not null default 'weak',
      project_tag text,
      source_corpus_path text
    );

    create table if not exists git_import_batches (
      batch_id text primary key,
      repo_id text not null references git_repositories(repo_id),
      status text not null,
      started_at text not null,
      finished_at text,
      error text
    );

    create table if not exists git_commits (
      repo_id text not null references git_repositories(repo_id),
      commit_sha text not null,
      parent_shas_json text not null,
      author_name text not null,
      author_email text not null,
      authored_at text not null,
      subject text not null,
      is_merge integer not null,
      is_revert integer not null,
      project_tag text,
      source_corpus_path text,
      import_batch_id text not null references git_import_batches(batch_id),
      imported_at text not null,
      primary key (repo_id, commit_sha)
    );

    create table if not exists git_commit_files (
      repo_id text not null references git_repositories(repo_id),
      commit_sha text not null,
      path text not null,
      old_path text,
      change_status text not null,
      additions integer not null,
      deletions integer not null,
      file_role text not null,
      language text not null,
      project_tag text,
      source_corpus_path text,
      import_batch_id text not null references git_import_batches(batch_id),
      imported_at text not null,
      primary key (repo_id, commit_sha, path)
    );

    create table if not exists git_commit_hunks (
      repo_id text not null references git_repositories(repo_id),
      commit_sha text not null,
      path text not null,
      hunk_index integer not null,
      old_start integer,
      old_lines integer,
      new_start integer,
      new_lines integer,
      hunk_header text not null,
      added_lines_sample text not null,
      removed_lines_sample text not null,
      project_tag text,
      source_corpus_path text,
      import_batch_id text not null references git_import_batches(batch_id),
      imported_at text not null,
      primary key (repo_id, commit_sha, path, hunk_index)
    );

    create table if not exists git_commit_change_tokens (
      repo_id text not null references git_repositories(repo_id),
      commit_sha text not null,
      path text not null,
      hunk_index integer,
      token_kind text not null,
      token_value text not null,
      language text not null,
      file_role text not null,
      confidence text not null,
      evidence_ref text not null,
      project_tag text,
      source_corpus_path text,
      import_batch_id text not null references git_import_batches(batch_id),
      imported_at text not null,
      primary key (repo_id, commit_sha, path, hunk_index, token_kind, token_value)
    );
  `);
  ensureColumn(db, 'git_repositories', 'project_tag', 'text');
  ensureColumn(db, 'git_repositories', 'source_corpus_path', 'text');
  ensureColumn(db, 'git_commits', 'project_tag', 'text');
  ensureColumn(db, 'git_commits', 'source_corpus_path', 'text');
  ensureColumn(db, 'git_commit_files', 'project_tag', 'text');
  ensureColumn(db, 'git_commit_files', 'source_corpus_path', 'text');
  ensureColumn(db, 'git_commit_hunks', 'project_tag', 'text');
  ensureColumn(db, 'git_commit_hunks', 'source_corpus_path', 'text');
  ensureColumn(db, 'git_commit_change_tokens', 'project_tag', 'text');
  ensureColumn(db, 'git_commit_change_tokens', 'source_corpus_path', 'text');
}

function ensureColumn(db: DatabaseSync, tableName: string, columnName: string, definition: string): void {
  const rows = db.prepare(`pragma table_info(${tableName})`).all() as { name: string }[];
  if (rows.some((row) => row.name === columnName)) return;
  db.exec(`alter table ${tableName} add column ${columnName} ${definition}`);
}
