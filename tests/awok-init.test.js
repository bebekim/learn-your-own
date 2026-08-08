import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  ROOT,
  runLyoJson,
} from './helpers/cli.js';

test('awok init <folder> creates a fully wired workspace', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-init-'));
  const folderName = 'test-workspace';
  const folderPath = join(tmp, folderName);
  try {
    const parsed = runLyoJson(['init', folderPath]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.path, folderPath);

    // All expected paths
    const expected = [
      join(folderPath, '.agent-learning', 'learning.sqlite'),
      join(folderPath, 'artifacts'),
      join(folderPath, 'lessons'),
      join(folderPath, 'runs'),
      join(folderPath, '.claude', 'settings.json'),
      join(folderPath, 'spec.md'),
      join(folderPath, 'plan.json'),
      join(folderPath, 'pipeline-config.json'),
    ];

    for (const p of expected) {
      assert.equal(existsSync(p), true, `missing: ${p}`);
    }

    // SQLite has tables
    const db = new DatabaseSync(join(folderPath, '.agent-learning', 'learning.sqlite'), { readOnly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
      assert.ok(tables.length > 0, 'expected tables in sqlite DB');
    } finally {
      db.close();
    }

    // pipeline-config.json shape
    const config = JSON.parse(readFileSync(join(folderPath, 'pipeline-config.json'), 'utf8'));
    assert.equal(config.dbPath, '.agent-learning/learning.sqlite');
    assert.equal(config.lessonsDir, 'lessons/');
    assert.equal(config.runsRoot, 'runs/');
    assert.equal(config.channel, 'claude');

    // .claude/settings.json hook registration
    const settings = JSON.parse(readFileSync(join(folderPath, '.claude', 'settings.json'), 'utf8'));
    assert.ok(Array.isArray(settings.hooks.SessionStart));
    const hookEntry = settings.hooks.SessionStart[0];
    assert.ok(Array.isArray(hookEntry.hooks));
    const cmdHook = hookEntry.hooks[0];
    assert.equal(cmdHook.type, 'command');
    assert.match(cmdHook.command, /node .*src\/lyo\/selection\/session-hook\.ts/);

    // plan.json minimal shape
    const plan = JSON.parse(readFileSync(join(folderPath, 'plan.json'), 'utf8'));
    assert.equal(plan.version, 'lyo.plan.v1');
    assert.equal(plan.planId, 'plan-initial');
    assert.deepEqual(plan.specRef, { path: 'spec.md', sha256: '' });
    assert.deepEqual(plan.stages, []);

    // spec.md has section headers
    const spec = readFileSync(join(folderPath, 'spec.md'), 'utf8');
    assert.ok(spec.includes('## Signatures'));
    assert.ok(spec.includes('## Desired behavior'));
    assert.ok(spec.includes('## Acceptance criteria'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('awok init does not overwrite existing spec.md or plan.json', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-init-no-overwrite-'));
  const folderPath = join(tmp, 'myproject');
  try {
    // Pre-create spec.md and plan.json with real content
    mkdirSync(join(folderPath, '.agent-learning'), { recursive: true });
    writeFileSync(join(folderPath, 'spec.md'), '# My Real Spec\n\nCustom content\n', 'utf8');
    writeFileSync(join(folderPath, 'plan.json'), JSON.stringify({ version: 'custom', stages: ['step1'] }, null, 2) + '\n', 'utf8');

    const parsed = runLyoJson(['init', folderPath]);

    assert.equal(parsed.ok, true);

    // spec.md preserved
    const spec = readFileSync(join(folderPath, 'spec.md'), 'utf8');
    assert.equal(spec, '# My Real Spec\n\nCustom content\n');

    // plan.json preserved
    const plan = JSON.parse(readFileSync(join(folderPath, 'plan.json'), 'utf8'));
    assert.equal(plan.version, 'custom');
    assert.deepEqual(plan.stages, ['step1']);

    // Other files still created
    assert.equal(existsSync(join(folderPath, 'pipeline-config.json')), true);
    assert.equal(existsSync(join(folderPath, '.agent-learning', 'learning.sqlite')), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('lyo init still works without a folder argument (legacy DB-only mode)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lyo-init-legacy-'));
  try {
    const dbPath = join(tmp, 'learning.sqlite');
    const parsed = runLyoJson(['init', '--db', dbPath]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.dbPath, dbPath);
    assert.equal(existsSync(dbPath), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
