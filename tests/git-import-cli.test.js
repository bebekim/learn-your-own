import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { runLyoJson } from './helpers/cli.js';

test('import git records committed history into dedicated corpus tables with hunk tokens', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-git-import-'));
  try {
    const repoPath = join(dir, 'repo');
    const corpusPath = join(dir, 'corpus.sqlite');
    seedGitRepo(repoPath);

    const result = runLyoJson([
      'import',
      'git',
      '--repo',
      repoPath,
      '--corpus',
      corpusPath,
      '--limit',
      '10',
      '--json',
    ]);

    assert.equal(result.ok, true);
    assert.equal(result.source, 'git_history');
    assert.equal(result.visibility, 'committed_trace_only');
    assert.equal(result.confidence, 'weak');
    assert.equal(result.imported.commits, 3);
    assert.equal(result.imported.files, 4);
    assert.equal(result.imported.hunks > 0, true);
    assert.equal(result.imported.changeTokens > 0, true);

    const second = runLyoJson([
      'import',
      'git',
      '--repo',
      repoPath,
      '--corpus',
      corpusPath,
      '--limit',
      '10',
      '--json',
    ]);

    assert.equal(second.ok, true);
    assert.equal(second.imported.commits, 0);
    assert.equal(second.imported.files, 0);
    assert.equal(second.imported.hunks, 0);
    assert.equal(second.imported.changeTokens, 0);

    const db = new DatabaseSync(corpusPath, { readOnly: true });
    try {
      assert.equal(Number(db.prepare('select count(*) as n from git_repositories').get().n), 1);
      assert.equal(Number(db.prepare('select count(*) as n from git_commits').get().n), 3);
      assert.equal(Number(db.prepare('select count(*) as n from git_commit_files').get().n), 4);
      assert.equal(Number(db.prepare('select count(*) as n from git_commit_hunks').get().n) > 0, true);

      const fileRoles = db.prepare(`
        select path, file_role as fileRole
        from git_commit_files
        order by path
      `).all();
      assert.deepEqual(
        fileRoles.map((row) => [row.path, row.fileRole]),
        [
          ['README.md', 'docs'],
          ['schema.sql', 'schema'],
          ['src/sync.ts', 'src'],
          ['tests/sync.test.ts', 'test'],
        ]
      );

      const tokens = db.prepare(`
        select token_kind as tokenKind, token_value as tokenValue, language, file_role as fileRole
        from git_commit_change_tokens
        order by token_kind, token_value, language, file_role
      `).all();
      const tokenPairs = tokens.map((row) => [row.tokenKind, row.tokenValue]);

      assert.deepEqual(
        uniquePairs(tokenPairs).filter(([kind, value]) => [
          'file_role',
          'hunk:add_test_case',
          'hunk:add_assertion',
          'hunk:add_guard_branch',
          'hunk:add_error_path',
          'hunk:add_schema_constraint',
          'hunk:add_markdown_definition',
        ].includes(kind) || value === 'typescript'),
        [
          ['file_role', 'docs'],
          ['file_role', 'schema'],
          ['file_role', 'src'],
          ['file_role', 'test'],
          ['hunk:add_assertion', 'typescript'],
          ['hunk:add_error_path', 'typescript'],
          ['hunk:add_guard_branch', 'typescript'],
          ['hunk:add_markdown_definition', 'markdown'],
          ['hunk:add_schema_constraint', 'sql'],
          ['hunk:add_test_case', 'typescript'],
        ]
      );

      const hunk = db.prepare(`
        select added_lines_sample as addedLinesSample
        from git_commit_hunks
        where path = 'tests/sync.test.ts'
      `).get();
      assert.match(hunk.addedLinesSample, /dedupes repeated submissions/);
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedGitRepo(repoPath) {
  mkdirSync(repoPath, { recursive: true });
  git(repoPath, ['init']);
  git(repoPath, ['config', 'user.email', 'lyo@example.test']);
  git(repoPath, ['config', 'user.name', 'Lyo Test']);

  mkdirSync(join(repoPath, 'src'), { recursive: true });
  mkdirSync(join(repoPath, 'tests'), { recursive: true });

  writeFileSync(join(repoPath, 'README.md'), [
    '# Sync Package',
    '',
    'A small package.',
    '',
  ].join('\n'));
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'docs: define sync package']);

  writeFileSync(join(repoPath, 'src', 'sync.ts'), [
    'export function accept(packet: { schemaVersion?: string }) {',
    '  if (!packet.schemaVersion) {',
    "    throw new Error('missing schema version');",
    '  }',
    '  return packet.schemaVersion;',
    '}',
    '',
  ].join('\n'));
  writeFileSync(join(repoPath, 'tests', 'sync.test.ts'), [
    "import assert from 'node:assert/strict';",
    "import { test } from 'node:test';",
    "import { accept } from '../src/sync';",
    '',
    "test('dedupes repeated submissions', () => {",
    "  assert.equal(accept({ schemaVersion: 'v1' }), 'v1');",
    '});',
    '',
  ].join('\n'));
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'feat: validate sync packet']);

  writeFileSync(join(repoPath, 'schema.sql'), [
    'create table packets (',
    '  packet_id text primary key,',
    '  schema_version text not null unique',
    ');',
    '',
  ].join('\n'));
  git(repoPath, ['add', '.']);
  git(repoPath, ['commit', '-m', 'schema: add packet constraints']);
}

function git(cwd, args) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

function uniquePairs(pairs) {
  const seen = new Set();
  const result = [];
  for (const pair of pairs) {
    const key = pair.join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(pair);
  }
  return result;
}
