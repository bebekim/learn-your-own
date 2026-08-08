import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildHookBlock, writeHooks, removeHooks } from '../src/cli/commands/wrap.ts';
import { ROOT } from './helpers/cli.js';

test('buildHookBlock produces 8 hooks with correct markers and paths', () => {
  const block = buildHookBlock();

  // Markers present
  assert.ok(block.includes('# lyo-wrap-begin'));
  assert.ok(block.includes('# lyo-wrap-end'));

  // 8 [[hooks]] entries
  const hookCount = (block.match(/\[\[hooks\]\]/g) || []).length;
  assert.equal(hookCount, 8);

  // Two SessionStart hooks (lesson delivery + ingestion)
  const sessionStartCount = (block.match(/event = "SessionStart"/g) || []).length;
  assert.equal(sessionStartCount, 2);

  // Other events present
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'SessionEnd']) {
    assert.ok(block.includes(`event = "${event}"`), `missing event: ${event}`);
  }

  // First SessionStart uses session-hook.ts (lesson delivery)
  assert.match(block, /session-hook\.ts/);

  // Other hooks use claude-hook with flags
  assert.ok(block.includes('claude-hook --db-from-event-cwd --spool-dir-from-event-cwd'));
});

test('buildHookBlock paths resolve to actual source files', () => {
  const block = buildHookBlock();

  // session-hook.ts path exists
  const sessionHookMatch = block.match(/command = "node ([^"]+session-hook\.ts)"/);
  assert.ok(sessionHookMatch, 'session-hook.ts command not found');
  assert.equal(existsSync(sessionHookMatch[1]), true, `session-hook.ts not found at ${sessionHookMatch[1]}`);

  // cli.ts path exists
  const cliMatch = block.match(/command = "node ([^"]+cli\.ts) claude-hook/);
  assert.ok(cliMatch, 'cli.ts command not found');
  assert.equal(existsSync(cliMatch[1]), true, `cli.ts not found at ${cliMatch[1]}`);
});

test('writeHooks creates config file and directory when missing', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-write-'));
  try {
    const configPath = join(tmp, '.kimi-code', 'config.toml');
    writeHooks(configPath);

    assert.ok(existsSync(configPath), 'config file not created');
    const content = readFileSync(configPath, 'utf8');
    assert.ok(content.includes('# lyo-wrap-begin'));
    assert.ok(content.includes('# lyo-wrap-end'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeHooks appends to existing config without markers', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-append-'));
  try {
    const configPath = join(tmp, 'config.toml');
    writeFileSync(configPath, 'some-existing-config = true\n', 'utf8');

    writeHooks(configPath);

    const content = readFileSync(configPath, 'utf8');
    assert.ok(content.includes('some-existing-config = true'));
    assert.ok(content.includes('# lyo-wrap-begin'));
    assert.ok(content.includes('# lyo-wrap-end'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeHooks is idempotent — writing twice produces single section', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-idempotent-'));
  try {
    const configPath = join(tmp, 'config.toml');

    writeHooks(configPath);
    writeHooks(configPath);

    const content = readFileSync(configPath, 'utf8');
    const beginCount = (content.match(/# lyo-wrap-begin/g) || []).length;
    const endCount = (content.match(/# lyo-wrap-end/g) || []).length;
    assert.equal(beginCount, 1, 'should have exactly one begin marker');
    assert.equal(endCount, 1, 'should have exactly one end marker');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('writeHooks updates stale paths on re-wrap', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-stale-'));
  try {
    const configPath = join(tmp, 'config.toml');

    // Write with a stale path
    writeFileSync(configPath, [
      '# lyo-wrap-begin',
      '[[hooks]]',
      'event = "SessionStart"',
      'command = "node /old/path/session-hook.ts"',
      'timeout = 5',
      '# lyo-wrap-end',
    ].join('\n') + '\n', 'utf8');

    // Re-wrap
    writeHooks(configPath);

    const content = readFileSync(configPath, 'utf8');
    assert.ok(!content.includes('/old/path/'), 'stale path should be replaced');
    assert.ok(content.includes('session-hook.ts'), 'should contain current path');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('removeHooks removes the hook block, preserving other content', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-remove-'));
  try {
    const configPath = join(tmp, 'config.toml');
    const original = 'some-existing-config = true\n';

    writeFileSync(configPath, original, 'utf8');
    writeHooks(configPath);

    // Verify hooks were added
    let content = readFileSync(configPath, 'utf8');
    assert.ok(content.includes('# lyo-wrap-begin'));

    // Remove
    removeHooks(configPath);

    // Verify hooks removed, original content preserved
    content = readFileSync(configPath, 'utf8');
    assert.ok(!content.includes('# lyo-wrap-begin'));
    assert.ok(!content.includes('# lyo-wrap-end'));
    assert.ok(content.includes('some-existing-config = true'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('removeHooks is no-op when markers not found', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-remove-nop-'));
  try {
    const configPath = join(tmp, 'config.toml');
    const original = 'some-existing-config = true\n';
    writeFileSync(configPath, original, 'utf8');

    removeHooks(configPath);

    const content = readFileSync(configPath, 'utf8');
    assert.equal(content, original);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('awok wrap kimi rejects when no pipeline-config.json in cwd', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'awok-wrap-guard-'));
  try {
    let output = '';
    let threw = false;
    try {
      execFileSync(process.execPath, [join(ROOT, 'src/cli.ts'), 'wrap', 'kimi'], {
        cwd: tmp,
        encoding: 'utf8',
      });
    } catch (e) {
      threw = true;
      output = typeof e.stdout === 'string' ? e.stdout : String(e.message);
    }
    assert.ok(threw, 'expected command to fail');
    assert.match(output, /No lyo workspace found/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
