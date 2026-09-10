// Exercise configured hook commands locally. No Codex/Claude model session starts.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { hashFile } from '../../src/contract/refs.ts';

const repo = '/Users/marcus.kim/repositories/individual/agent-learning-workflow';
const version = JSON.parse(readFileSync('/Users/marcus.kim/.nvm/versions/node/v24.15.0/lib/node_modules/lyo-kernel/package.json', 'utf8')).version;
assert.equal(version, '0.4.3-adaptive.3');
const temporary = mkdtempSync(join(tmpdir(), 'lyo-finding-rollout-'));
const read = name => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const findings = read('findings.json'), results = {};
try {
  for (const [host, path] of Object.entries({ codex: '/Users/marcus.kim/.codex/hooks.json', claude: '/Users/marcus.kim/.claude/settings.json' })) {
    const config = JSON.parse(readFileSync(path, 'utf8'));
    const command = event => config.hooks[event].flatMap(row => row.hooks).find(hook => hook.command.includes('/lyo-session-hook')).command;
    const run = (event, cwd, session, prompt) => {
      const result = spawnSync('/bin/sh', ['-c', command(event)], { cwd, encoding: 'utf8',
        env: { ...process.env, TMPDIR: temporary }, input: JSON.stringify({ cwd, session_id: session, hook_event_name: event, prompt }) });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    };
    const root = run('SessionStart', repo, `rollout-${host}-repo-${temporary}`);
    for (const finding of findings) assert.ok(root.includes(finding.intervention));
    const session = `rollout-${host}-outside-${temporary}`;
    const outside = run('SessionStart', temporary, session);
    assert.ok(!outside.includes('Observed findings'));
    const tagged = {};
    for (const finding of findings) {
      const prompt = `[lyo:${finding.activity}] Review this work.`;
      tagged[finding.activity] = run('UserPromptSubmit', temporary, session, prompt);
      assert.ok(tagged[finding.activity].includes(finding.intervention));
      assert.equal((tagged[finding.activity].match(/\n- \[/g) ?? []).length, 1);
      assert.equal(run('UserPromptSubmit', temporary, session, prompt), '');
    }
    results[host] = { root, outside, tagged, repeatSuppressed: true };
  }
  const legacy = spawnSync(process.execPath, [join(repo, 'src/lyo/selection/session-hook.ts'), '--cwd', temporary],
    { encoding: 'utf8' });
  assert.equal(legacy.status, 0); assert.ok(!legacy.stdout.includes('Observed findings'));
  for (const finding of findings) assert.ok(!legacy.stdout.includes(finding.intervention));
  const configHashes = Object.fromEntries(Object.entries(read('config-before.json')).map(([path, before]) => {
    const after = hashFile(path).sha256;
    assert.equal(after, before, `configuration changed: ${path}`);
    return [path, after];
  }));
  writeFileSync(new URL('rollout.json', import.meta.url), JSON.stringify({ version,
    verificationKind: 'local configured-hook simulation; no model calls', configHashes,
    tarballSHA256: hashFile(new URL('../../dist/lyo-kernel-0.4.3-adaptive.3.tgz', import.meta.url)).sha256,
    legacySourceIgnoresFindings: true, results }, null, 2) + '\n');
  console.log('Installed Codex and Claude hooks deliver all three scoped findings; unrelated work and repeat prompts are quiet. Legacy source hook remains compatible.');
} finally { rmSync(temporary, { recursive: true, force: true }); }
