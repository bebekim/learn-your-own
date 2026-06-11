import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  discoverAgentLearningLedgers,
  findAgentLearningDatabases,
} from '../src/compiler/ledger-scan.ts';

test('ledger discovery scans repo forests with nested child workspaces', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-ledger-forest-'));
  try {
    const ledger = (workspace, filename = 'learning.sqlite') => {
      const dbDir = join(dir, workspace, '.agent-learning');
      mkdirSync(dbDir, { recursive: true });
      const dbPath = join(dbDir, filename);
      writeFileSync(dbPath, '');
      return dbPath;
    };

    const repoA = ledger('repo-a');
    const repoB = ledger('repo-b');
    const nestedTool = ledger('repo-a/packages/tool');
    ledger('repo-a/node_modules/dependency');
    ledger('repo-b/.git/worktrees/ignored');
    writeFileSync(join(dir, 'repo-a', '.agent-learning', 'notes.txt'), '');

    assert.deepEqual(findAgentLearningDatabases(dir), [
      nestedTool,
      repoA,
      repoB,
    ].sort());

    assert.deepEqual(discoverAgentLearningLedgers(dir), [{
      dbPath: nestedTool,
      workspaceRoot: join(dir, 'repo-a/packages/tool'),
      relativeWorkspace: 'repo-a/packages/tool',
      depth: 3,
    }, {
      dbPath: repoA,
      workspaceRoot: join(dir, 'repo-a'),
      relativeWorkspace: 'repo-a',
      depth: 1,
    }, {
      dbPath: repoB,
      workspaceRoot: join(dir, 'repo-b'),
      relativeWorkspace: 'repo-b',
      depth: 1,
    }].sort((left, right) => left.dbPath.localeCompare(right.dbPath)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
