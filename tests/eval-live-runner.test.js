import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { runLocalEpisode } from '../src/eval/live-runner.ts';
import { LearnedRuleStore } from '../src/lyo/learned-rules.ts';
import { ROOT, runLyoJson } from './helpers/cli.js';

test('local eval runner records comparable B0 and B3 smoke episodes', () => {
  const task = fixtureTask('node -e "process.exit(0)"');

  const b0 = runLocalEpisode({
    task,
    baselineId: 'B0',
    model: 'test-model',
    harness: 'local-shell',
    cwd: ROOT,
    runId: 'b0-run',
  });
  const b3 = runLocalEpisode({
    task,
    baselineId: 'B3',
    model: 'test-model',
    harness: 'local-shell',
    cwd: ROOT,
    runId: 'b3-run',
  });

  assert.equal(b0.outcome.verified_success, true);
  assert.equal(b3.outcome.verified_success, true);
  assert.deepEqual(b0.budget, b3.budget);
  assert.deepEqual(b0.allowed_tools, b3.allowed_tools);
  assert.equal(b0.injected_context.observe_only, false);
  assert.equal(b3.injected_context.observe_only, true);
  assert.deepEqual(b3.injected_context.rule_gates, []);
});

test('local eval runner preserves failed verifier evidence', () => {
  const result = runLocalEpisode({
    task: fixtureTask('node -e "console.error(\'boom\'); process.exit(7)"'),
    baselineId: 'B0',
    model: 'test-model',
    harness: 'local-shell',
    cwd: ROOT,
  });

  assert.equal(result.outcome.verified_success, false);
  assert.equal(result.verifier_evidence.exit_code, 7);
  assert.match(result.verifier_evidence.stderr, /boom/);
});

test('B4 local eval runner records learned verifier rule applications', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-live-'));
  try {
    const dbPath = join(dir, 'rules.sqlite');
    const store = new LearnedRuleStore(dbPath);
    const rule = store.createVerifierRule({
      scope_kind: 'repository',
      scope_value: '/repo',
      path_glob: 'src/billing/**',
      command: 'uv run pytest tests/test_billing.py',
      status: 'active',
    });
    store.close();

    const result = runLocalEpisode({
      task: fixtureTask('node -e "process.exit(0)"', ['src/billing/discount.py']),
      baselineId: 'B4',
      model: 'test-model',
      harness: 'local-shell',
      cwd: ROOT,
      dbPath,
      scopeValue: '/repo',
      runId: 'b4-run',
    });

    assert.equal(result.injected_context.rule_gates.length, 1);
    assert.equal(result.injected_context.rule_gates[0].command, 'uv run pytest tests/test_billing.py');

    const checkStore = new LearnedRuleStore(dbPath);
    try {
      assert.equal(checkStore.getRuleApplications(rule.rule_id).length, 1);
    } finally {
      checkStore.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lyo eval run-local returns an episode row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lyo-eval-live-cli-'));
  try {
    const taskPath = join(dir, 'task.json');
    writeFileSync(taskPath, JSON.stringify(fixtureTask('node -e "process.exit(0)"')));

    const parsed = runLyoJson([
      'eval',
      'run-local',
      '--task',
      taskPath,
      '--baseline',
      'B0',
      '--model',
      'test-model',
    ]);

    assert.equal(parsed.ok, true);
    assert.equal(parsed.episode.task_id, 'fixture-task');
    assert.equal(parsed.episode.outcome.verified_success, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fixtureTask(command, expectedTouchedPaths = ['src/example.ts']) {
  return {
    task_id: 'fixture-task',
    split: 'train',
    repo_ref: {
      kind: 'git',
      ref: 'fixture',
    },
    prompt: 'Do the fixture task.',
    allowed_tools: ['read', 'edit', 'shell'],
    budget: {
      max_turns: 2,
      max_wall_time_seconds: 60,
      max_tokens: 1000,
    },
    success_check: {
      kind: 'command',
      command,
    },
    expected_touched_paths: expectedTouchedPaths,
    tags: ['fixture'],
  };
}
