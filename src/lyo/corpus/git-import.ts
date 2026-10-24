import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { initCorpusDb } from './schema.ts';

export interface ImportGitHistoryInput {
  repoPath: string;
  corpusPath: string;
  limit?: number | null;
  projectTag?: string | null;
}

export interface ImportGitHistoryResult {
  ok: true;
  source: 'git_history';
  visibility: 'committed_trace_only';
  confidence: 'weak';
  corpusPath: string;
  repoPath: string;
  repoId: string;
  projectTag: string | null;
  headSha: string | null;
  commitsScanned: number;
  imported: {
    commits: number;
    files: number;
    hunks: number;
    changeTokens: number;
  };
}

interface CommitMeta {
  sha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authoredAt: string;
  subject: string;
}

interface NumstatRow {
  additions: number;
  deletions: number;
  path: string;
  oldPath: string | null;
}

interface ParsedFilePatch {
  path: string;
  hunks: ParsedHunk[];
}

interface ParsedHunk {
  hunkIndex: number;
  oldStart: number | null;
  oldLines: number | null;
  newStart: number | null;
  newLines: number | null;
  hunkHeader: string;
  addedLines: string[];
  removedLines: string[];
}

interface ChangeToken {
  repoId: string;
  commitSha: string;
  path: string;
  hunkIndex: number | null;
  tokenKind: string;
  tokenValue: string;
  language: string;
  fileRole: string;
  projectTag: string | null;
  sourceCorpusPath: string;
  confidence: 'low' | 'medium' | 'high';
  evidenceRef: string;
}

export function importGitHistory(input: ImportGitHistoryInput): ImportGitHistoryResult {
  const repoPath = resolve(input.repoPath);
  const corpusPath = resolve(input.corpusPath);
  const projectTag = input.projectTag ?? null;
  const corpus = openWritableCorpus(corpusPath);
  const now = new Date().toISOString();
  const repoId = repoIdForPath(repoPath);
  const batchId = `${repoId}:${now}`;
  const headSha = git(repoPath, ['rev-parse', '--verify', 'HEAD']).trim() || null;

  try {
    upsertRepository(corpus, repoId, repoPath, headSha, projectTag, corpusPath, now);
    startBatch(corpus, batchId, repoId, now);
    const commits = listCommits(repoPath, input.limit ?? null);
    const imported = { commits: 0, files: 0, hunks: 0, changeTokens: 0 };

    for (const commit of commits) {
      const commitResult = insertCommit(corpus, repoId, commit, batchId, now);
      if (commitResult === 0) continue;
      imported.commits += commitResult;

      const numstatRows = readNumstat(repoPath, commit.sha);
      const patchFiles = parsePatch(git(repoPath, ['show', '--patch', '--unified=0', '--format=', '--no-ext-diff', commit.sha]));
      const patchByPath = new Map(patchFiles.map((file) => [file.path, file]));

      for (const file of numstatRows) {
        const language = languageForPath(file.path);
        const fileRole = fileRoleForPath(file.path);
        imported.files += insertCommitFile(corpus, {
          repoId,
          commitSha: commit.sha,
          path: file.path,
          oldPath: file.oldPath,
          status: fileStatus(repoPath, commit.sha, file.path),
          additions: file.additions,
          deletions: file.deletions,
          language,
          fileRole,
          projectTag,
          sourceCorpusPath: corpusPath,
          batchId,
          importedAt: now,
        });

        for (const token of fileLevelTokens(repoId, commit.sha, file.path, language, fileRole, projectTag, corpusPath)) {
          imported.changeTokens += insertToken(corpus, token, batchId, now);
        }

        const patch = patchByPath.get(file.path);
        if (!patch) continue;
        for (const hunk of patch.hunks) {
          imported.hunks += insertHunk(corpus, repoId, commit.sha, file.path, hunk, projectTag, corpusPath, batchId, now);
          for (const token of hunkTokens(repoId, commit.sha, file.path, hunk, language, fileRole, projectTag, corpusPath)) {
            imported.changeTokens += insertToken(corpus, token, batchId, now);
          }
        }
      }
    }

    finishBatch(corpus, batchId, now);
    return {
      ok: true,
      source: 'git_history',
      visibility: 'committed_trace_only',
      confidence: 'weak',
      corpusPath,
      repoPath,
      repoId,
      projectTag,
      headSha,
      commitsScanned: commits.length,
      imported,
    };
  } catch (error) {
    failBatch(corpus, batchId, new Date().toISOString(), error);
    throw error;
  } finally {
    corpus.close();
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

function upsertRepository(
  corpus: DatabaseSync,
  repoId: string,
  repoPath: string,
  headSha: string | null,
  projectTag: string | null,
  sourceCorpusPath: string,
  now: string
): void {
  corpus.prepare(`
    insert into git_repositories (
      repo_id, repo_path, head_sha, first_seen_at, last_seen_at, status,
      project_tag, source_corpus_path
    ) values (?, ?, ?, ?, ?, 'active', ?, ?)
    on conflict(repo_id) do update set
      repo_path = excluded.repo_path,
      head_sha = excluded.head_sha,
      last_seen_at = excluded.last_seen_at,
      status = excluded.status,
      project_tag = excluded.project_tag,
      source_corpus_path = excluded.source_corpus_path
  `).run(repoId, repoPath, headSha, now, now, projectTag, sourceCorpusPath);
}

function startBatch(corpus: DatabaseSync, batchId: string, repoId: string, now: string): void {
  corpus.prepare(`
    insert into git_import_batches (batch_id, repo_id, status, started_at)
    values (?, ?, 'running', ?)
  `).run(batchId, repoId, now);
}

function finishBatch(corpus: DatabaseSync, batchId: string, now: string): void {
  corpus.prepare(`
    update git_import_batches
    set status = 'completed', finished_at = ?, error = null
    where batch_id = ?
  `).run(now, batchId);
}

function failBatch(corpus: DatabaseSync, batchId: string, now: string, error: unknown): void {
  corpus.prepare(`
    update git_import_batches
    set status = 'failed', finished_at = ?, error = ?
    where batch_id = ?
  `).run(now, error instanceof Error ? error.message : String(error), batchId);
}

function listCommits(repoPath: string, limit: number | null): CommitMeta[] {
  const args = [
    'log',
    '--reverse',
    '--date=iso-strict',
    '--format=%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e',
  ];
  if (limit !== null) args.splice(1, 0, `-${limit}`);
  return git(repoPath, args)
    .split('\x1e')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, parentText, authorName, authorEmail, authoredAt, subject] = record.split('\x1f');
      return {
        sha,
        parents: parentText ? parentText.split(' ').filter(Boolean) : [],
        authorName,
        authorEmail,
        authoredAt,
        subject,
      };
    });
}

function insertCommit(corpus: DatabaseSync, repoId: string, commit: CommitMeta, batchId: string, importedAt: string): number {
  const repo = corpus.prepare(`
    select project_tag as projectTag, source_corpus_path as sourceCorpusPath
    from git_repositories
    where repo_id = ?
  `).get(repoId) as { projectTag: string | null; sourceCorpusPath: string | null };
  const result = corpus.prepare(`
    insert or ignore into git_commits (
      repo_id, commit_sha, parent_shas_json, author_name, author_email,
      authored_at, subject, is_merge, is_revert, project_tag, source_corpus_path,
      import_batch_id, imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    repoId,
    commit.sha,
    JSON.stringify(commit.parents),
    commit.authorName,
    commit.authorEmail,
    commit.authoredAt,
    commit.subject,
    commit.parents.length > 1 ? 1 : 0,
    /^revert\b/i.test(commit.subject) ? 1 : 0,
    repo.projectTag,
    repo.sourceCorpusPath,
    batchId,
    importedAt
  );
  return Number(result.changes);
}

function readNumstat(repoPath: string, commitSha: string): NumstatRow[] {
  return git(repoPath, ['show', '--numstat', '--format=', '--no-renames', commitSha])
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [additions, deletions, path] = line.split('\t');
      return {
        additions: additions === '-' ? 0 : Number(additions),
        deletions: deletions === '-' ? 0 : Number(deletions),
        path,
        oldPath: null,
      };
    });
}

function fileStatus(repoPath: string, commitSha: string, path: string): string {
  const nameStatus = git(repoPath, ['show', '--name-status', '--format=', '--no-renames', commitSha]);
  for (const line of nameStatus.split('\n')) {
    const [status, filePath] = line.trim().split('\t');
    if (filePath === path) return status || 'M';
  }
  return 'M';
}

function insertCommitFile(corpus: DatabaseSync, input: {
  repoId: string;
  commitSha: string;
  path: string;
  oldPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  language: string;
  fileRole: string;
  projectTag: string | null;
  sourceCorpusPath: string;
  batchId: string;
  importedAt: string;
}): number {
  const result = corpus.prepare(`
    insert or ignore into git_commit_files (
      repo_id, commit_sha, path, old_path, change_status, additions, deletions,
      file_role, language, project_tag, source_corpus_path, import_batch_id, imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.repoId,
    input.commitSha,
    input.path,
    input.oldPath,
    input.status,
    input.additions,
    input.deletions,
    input.fileRole,
    input.language,
    input.projectTag,
    input.sourceCorpusPath,
    input.batchId,
    input.importedAt
  );
  return Number(result.changes);
}

function parsePatch(patch: string): ParsedFilePatch[] {
  const files: ParsedFilePatch[] = [];
  let currentFile: ParsedFilePatch | null = null;
  let currentHunk: ParsedHunk | null = null;

  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      if (currentFile) files.push(currentFile);
      currentFile = null;
      currentHunk = null;
      continue;
    }
    if (line.startsWith('+++ b/')) {
      currentFile = { path: line.slice('+++ b/'.length), hunks: [] };
      continue;
    }
    if (!currentFile) continue;
    if (line.startsWith('@@')) {
      currentHunk = parseHunkHeader(line, currentFile.hunks.length);
      currentFile.hunks.push(currentHunk);
      continue;
    }
    if (!currentHunk) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentHunk.addedLines.push(line.slice(1));
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      currentHunk.removedLines.push(line.slice(1));
    }
  }

  if (currentFile) files.push(currentFile);
  return files;
}

function parseHunkHeader(line: string, hunkIndex: number): ParsedHunk {
  const match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
  return {
    hunkIndex,
    oldStart: match ? Number(match[1]) : null,
    oldLines: match ? Number(match[2] ?? '1') : null,
    newStart: match ? Number(match[3]) : null,
    newLines: match ? Number(match[4] ?? '1') : null,
    hunkHeader: line,
    addedLines: [],
    removedLines: [],
  };
}

function insertHunk(
  corpus: DatabaseSync,
  repoId: string,
  commitSha: string,
  path: string,
  hunk: ParsedHunk,
  projectTag: string | null,
  sourceCorpusPath: string,
  batchId: string,
  importedAt: string
): number {
  const result = corpus.prepare(`
    insert or ignore into git_commit_hunks (
      repo_id, commit_sha, path, hunk_index, old_start, old_lines, new_start,
      new_lines, hunk_header, added_lines_sample, removed_lines_sample,
      project_tag, source_corpus_path, import_batch_id, imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    repoId,
    commitSha,
    path,
    hunk.hunkIndex,
    hunk.oldStart,
    hunk.oldLines,
    hunk.newStart,
    hunk.newLines,
    hunk.hunkHeader,
    sampleLines(hunk.addedLines),
    sampleLines(hunk.removedLines),
    projectTag,
    sourceCorpusPath,
    batchId,
    importedAt
  );
  return Number(result.changes);
}

function fileLevelTokens(
  repoId: string,
  commitSha: string,
  path: string,
  language: string,
  fileRole: string,
  projectTag: string | null,
  sourceCorpusPath: string
): ChangeToken[] {
  return [{
    repoId,
    commitSha,
    path,
    hunkIndex: null,
    tokenKind: 'file_role',
    tokenValue: fileRole,
    language,
    fileRole,
    projectTag,
    sourceCorpusPath,
    confidence: 'high',
    evidenceRef: `git:${repoId}:${commitSha}:${path}`,
  }];
}

function hunkTokens(
  repoId: string,
  commitSha: string,
  path: string,
  hunk: ParsedHunk,
  language: string,
  fileRole: string,
  projectTag: string | null,
  sourceCorpusPath: string
): ChangeToken[] {
  const added = hunk.addedLines.join('\n');
  const normalized = added.toLowerCase();
  const tokens: ChangeToken[] = [];
  const push = (tokenKind: string, tokenValue = language, confidence: 'low' | 'medium' | 'high' = 'medium') => {
    tokens.push({
      repoId,
      commitSha,
      path,
      hunkIndex: hunk.hunkIndex,
      tokenKind,
      tokenValue,
      language,
      fileRole,
      projectTag,
      sourceCorpusPath,
      confidence,
      evidenceRef: `git:${repoId}:${commitSha}:${path}:hunk:${hunk.hunkIndex}`,
    });
  };

  if (['typescript', 'javascript'].includes(language)) {
    if (/\b(test|it|describe)\s*\(/.test(added)) push('hunk:add_test_case');
    if (/\b(expect|assert)\s*[.(]/.test(added)) push('hunk:add_assertion');
    if (/\bif\s*\(/.test(added)) push('hunk:add_guard_branch');
    if (/\bthrow\s+new\s+error\b/i.test(added) || /\bcatch\s*\(/.test(added)) push('hunk:add_error_path');
    if (/\b(export\s+)?(interface|type)\s+\w+/.test(added)) push('hunk:change_type_contract');
    if (/\bz\.object\s*\(/.test(added)) push('hunk:add_schema_validation');
  } else if (language === 'python') {
    if (/\bdef\s+test_/.test(added)) push('hunk:add_test_case');
    if (/\bassert\b/.test(added)) push('hunk:add_assertion');
    if (/\bif\s+.+:/.test(added)) push('hunk:add_guard_branch');
    if (/\braise\s+/.test(added) || /\bexcept\s+/.test(added)) push('hunk:add_error_path');
    if (/\bclass\s+\w+/.test(added)) push('hunk:change_type_contract');
  } else if (language === 'sql') {
    if (/\b(create|alter)\s+table\b/.test(normalized)) push('hunk:change_schema');
    if (/\b(not\s+null|unique|check|foreign\s+key|primary\s+key)\b/.test(normalized)) push('hunk:add_schema_constraint');
    if (/\b(create\s+index|index)\b/.test(normalized)) push('hunk:add_index');
  } else if (language === 'markdown') {
    if (/^#+\s+\S/m.test(added)) push('hunk:add_markdown_definition');
    if (/\b(requirement|invariant|definition|contract|edge case)\b/i.test(added)) push('hunk:add_spec_language');
  }

  if (hunk.removedLines.length > 0) {
    push('hunk:remove_lines', language, 'low');
  }

  return tokens;
}

function insertToken(corpus: DatabaseSync, token: ChangeToken, batchId: string, importedAt: string): number {
  const result = corpus.prepare(`
    insert or ignore into git_commit_change_tokens (
      repo_id, commit_sha, path, hunk_index, token_kind, token_value,
      language, file_role, confidence, evidence_ref, project_tag, source_corpus_path,
      import_batch_id, imported_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token.repoId,
    token.commitSha,
    token.path,
    token.hunkIndex ?? -1,
    token.tokenKind,
    token.tokenValue,
    token.language,
    token.fileRole,
    token.confidence,
    token.evidenceRef,
    token.projectTag,
    token.sourceCorpusPath,
    batchId,
    importedAt
  );
  return Number(result.changes);
}

function languageForPath(path: string): string {
  if (/\.[cm]?tsx?$/.test(path)) return 'typescript';
  if (/\.[cm]?jsx?$/.test(path)) return 'javascript';
  if (/\.py$/.test(path)) return 'python';
  if (/\.sql$/.test(path)) return 'sql';
  if (/\.(md|mdx|markdown)$/.test(path)) return 'markdown';
  return 'unknown';
}

function fileRoleForPath(path: string): string {
  const normalized = path.toLowerCase();
  if (/(^|\/)(test|tests|spec|specs|__tests__)(\/|$)/.test(normalized) || /\.(test|spec)\.[^.]+$/.test(normalized)) return 'test';
  if (/\.(md|mdx|markdown)$/.test(normalized) || /(^|\/)docs?\//.test(normalized)) return 'docs';
  if (/\.sql$/.test(normalized) || /(^|\/)(migrations?|schema)\//.test(normalized) || basename(normalized).includes('schema')) return 'schema';
  if (/(^|\/)(package\.json|tsconfig\.json|pyproject\.toml|cargo\.toml|go\.mod|\.github\/)/.test(normalized)) return 'config';
  if (/(^|\/)(src|lib|app|packages)\//.test(normalized) || /\.(ts|tsx|js|jsx|py)$/.test(normalized)) return 'src';
  return 'unknown';
}

function sampleLines(lines: string[]): string {
  return lines.slice(0, 40).join('\n');
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 1024 * 1024 * 100 });
}

function repoIdForPath(repoPath: string): string {
  return Buffer.from(repoPath).toString('base64url');
}
