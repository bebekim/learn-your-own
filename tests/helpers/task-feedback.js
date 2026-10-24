import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createKernel } from '../../src/lyo/storage/ledger.ts';
import { TaskFeedback } from '../../src/lyo/control/task-feedback.ts';

export function startTask(fixture, registration) {
  const loop = new TaskFeedback(fixture.kernel);
  loop.register(registration);
  loop.prompt(registration.runtime, { cwd: registration.cwd, session_id: registration.attemptId, prompt: registration.task.prompt });
  return loop;
}

export function taskFixture() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-task-feedback-')));
  const db = join(dir, 'central.sqlite');
  const verifier = join(dir, 'acceptance.cjs');
  const regression = join(dir, 'regression.cjs');
  writeFileSync(verifier, "require('node:assert/strict').equal(require(process.cwd() + '/answer.cjs'), 42);\n");
  writeFileSync(regression, "require('node:assert/strict').equal(require(process.cwd() + '/stable.cjs'), 'unchanged');\n");
  return { dir, db, kernel: createKernel({ dbPath: db }),
    task(id, { condition = 'explore', policyId, split = 'train', initialAnswer = 0 } = {}) {
      const cwd = join(dir, id);
      mkdirSync(cwd);
      writeFileSync(join(cwd, '.gitignore'), '.agent-learning/\n');
      writeFileSync(join(cwd, 'answer.cjs'), `module.exports = ${initialAnswer};`);
      writeFileSync(join(cwd, 'stable.cjs'), "module.exports = 'unchanged';");
      const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' } }).trim();
      git(['init']); git(['add', '.']);
      git(['-c', 'user.name=LYO Test', '-c', 'user.email=lyo@example.invalid', 'commit', '-m', 'fixture']);
      return { attemptId: id, cwd, runtime: 'codex', model: 'fixture-model', family: 'module-contract',
        condition, ...(policyId ? { policyId } : {}), criteria: ['The exported answer is 42; the stable contract is preserved.'],
        verifierFiles: [verifier], regressionCheck: { command: `${process.execPath} ${regression}`, files: [regression] },
        task: { task_id: id, split, repo_ref: { kind: 'git', ref: git(['rev-parse', 'HEAD']) },
          prompt: 'Fix the exported answer while preserving the stable contract.', allowed_tools: ['shell', 'edit'],
          budget: { max_turns: 10, max_wall_time_seconds: 60, max_tokens: 1000 },
          success_check: { kind: 'command', command: `${process.execPath} ${verifier}` },
          expected_touched_paths: ['answer.cjs'], tags: ['contract'] } };
    },
    trace(id, inputTokens = 100) {
      const path = join(dir, `${id}.jsonl`);
      writeFileSync(path, [
        { type: 'thread.started', thread_id: id },
        { type: 'turn.started' },
        { type: 'turn.completed', usage: { input_tokens: inputTokens, cached_input_tokens: 80, output_tokens: 20 } },
      ].map(row => JSON.stringify(row)).join('\n'));
      return path;
    } };
}
