import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { initCorpusDb } from './schema.ts';

export interface PoolCollectSource {
  sourcePath: string;
  tag: string;
}

export interface PoolCollectInput {
  poolPath: string;
  sources: PoolCollectSource[];
}

export interface PoolCollectResult {
  ok: true;
  poolPath: string;
  sources: PoolCollectSource[];
  imported: {
    repositories: number;
    commits: number;
    files: number;
    hunks: number;
    changeTokens: number;
  };
}

export function collectGitCorpusPool(input: PoolCollectInput): PoolCollectResult {
  const poolPath = resolve(input.poolPath);
  const pool = openWritableCorpus(poolPath);
  const imported = {
    repositories: 0,
    commits: 0,
    files: 0,
    hunks: 0,
    changeTokens: 0,
  };

  try {
    for (const source of input.sources) {
      const sourcePath = resolve(source.sourcePath);
      const alias = attachAlias(sourcePath);
      pool.exec(`attach database ${sqlString(sourcePath)} as ${alias}`);
      try {
        imported.repositories += copyRepositories(pool, alias, source.tag, sourcePath);
        copyBatches(pool, alias);
        imported.commits += copyCommits(pool, alias, source.tag, sourcePath);
        imported.files += copyFiles(pool, alias, source.tag, sourcePath);
        imported.hunks += copyHunks(pool, alias, source.tag, sourcePath);
        imported.changeTokens += copyTokens(pool, alias, source.tag, sourcePath);
      } finally {
        pool.exec(`detach database ${alias}`);
      }
    }

    return {
      ok: true,
      poolPath,
      sources: input.sources.map((source) => ({
        sourcePath: resolve(source.sourcePath),
        tag: source.tag,
      })),
      imported,
    };
  } finally {
    pool.close();
  }
}

function openWritableCorpus(corpusPath: string): DatabaseSync {
  mkdirSync(dirname(corpusPath), { recursive: true });
  const db = new DatabaseSync(corpusPath);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  initCorpusDb(db);
  return db;
}

function copyBatches(pool: DatabaseSync, alias: string): number {
  const result = pool.prepare(`
    insert or ignore into git_import_batches (
      batch_id, repo_id, status, started_at, finished_at, error
    )
    select batch_id, repo_id, status, started_at, finished_at, error
    from ${alias}.git_import_batches
  `).run();
  return Number(result.changes);
}

function copyRepositories(pool: DatabaseSync, alias: string, tag: string, sourcePath: string): number {
  const result = pool.prepare(`
    insert or ignore into git_repositories (
      repo_id, repo_path, head_sha, first_seen_at, last_seen_at, status,
      source, visibility, confidence, project_tag, source_corpus_path
    )
    select repo_id, repo_path, head_sha, first_seen_at, last_seen_at, status,
      source, visibility, confidence, ?, ?
    from ${alias}.git_repositories
  `).run(tag, sourcePath);
  return Number(result.changes);
}

function copyCommits(pool: DatabaseSync, alias: string, tag: string, sourcePath: string): number {
  const result = pool.prepare(`
    insert or ignore into git_commits (
      repo_id, commit_sha, parent_shas_json, author_name, author_email,
      authored_at, subject, is_merge, is_revert, project_tag, source_corpus_path,
      import_batch_id, imported_at
    )
    select repo_id, commit_sha, parent_shas_json, author_name, author_email,
      authored_at, subject, is_merge, is_revert, ?, ?, import_batch_id, imported_at
    from ${alias}.git_commits
  `).run(tag, sourcePath);
  return Number(result.changes);
}

function copyFiles(pool: DatabaseSync, alias: string, tag: string, sourcePath: string): number {
  const result = pool.prepare(`
    insert or ignore into git_commit_files (
      repo_id, commit_sha, path, old_path, change_status, additions, deletions,
      file_role, language, project_tag, source_corpus_path, import_batch_id, imported_at
    )
    select repo_id, commit_sha, path, old_path, change_status, additions, deletions,
      file_role, language, ?, ?, import_batch_id, imported_at
    from ${alias}.git_commit_files
  `).run(tag, sourcePath);
  return Number(result.changes);
}

function copyHunks(pool: DatabaseSync, alias: string, tag: string, sourcePath: string): number {
  const result = pool.prepare(`
    insert or ignore into git_commit_hunks (
      repo_id, commit_sha, path, hunk_index, old_start, old_lines, new_start,
      new_lines, hunk_header, added_lines_sample, removed_lines_sample,
      project_tag, source_corpus_path, import_batch_id, imported_at
    )
    select repo_id, commit_sha, path, hunk_index, old_start, old_lines, new_start,
      new_lines, hunk_header, added_lines_sample, removed_lines_sample,
      ?, ?, import_batch_id, imported_at
    from ${alias}.git_commit_hunks
  `).run(tag, sourcePath);
  return Number(result.changes);
}

function copyTokens(pool: DatabaseSync, alias: string, tag: string, sourcePath: string): number {
  const result = pool.prepare(`
    insert or ignore into git_commit_change_tokens (
      repo_id, commit_sha, path, hunk_index, token_kind, token_value,
      language, file_role, confidence, evidence_ref, project_tag, source_corpus_path,
      import_batch_id, imported_at
    )
    select repo_id, commit_sha, path, coalesce(hunk_index, -1), token_kind, token_value,
      language, file_role, confidence, evidence_ref, ?, ?, import_batch_id, imported_at
    from ${alias}.git_commit_change_tokens
  `).run(tag, sourcePath);
  return Number(result.changes);
}

function attachAlias(sourcePath: string): string {
  return `src_${Buffer.from(sourcePath).toString('hex').slice(0, 24)}`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
