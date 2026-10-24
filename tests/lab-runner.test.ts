import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runLab, reportLab } from '../src/lyo/lab/runner.ts';

// Passes only when advised; "TAMPER" tasks rewrite the verifier instead. Records env and timing.
const AGENT = `
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [cwd, prompt] = process.argv.slice(2);
const started = Date.now();
await new Promise(r => setTimeout(r, 300));
if (prompt.includes('TAMPER')) writeFileSync(join(cwd, 'verify.mjs'), 'process.exit(0)');
writeFileSync(join(cwd, 'answer.txt'), prompt.includes('Lyo advice') ? '42' : '41');
writeFileSync(join(cwd, 'agent.json'), JSON.stringify({ started, ended: Date.now(),
  store: process.env.ZEROSHOT_LYO_STORE_PATH, config: process.env.LYO_CONFIG_FILE }));
`;

function labFixture(taskPrompts: Record<string, string>, plan: Record<string, unknown> = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'lyo-lab-')));
  const repo = join(root, 'repo');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  execFileSync('git', ['init', '-q', repo]);
  writeFileSync(join(repo, 'verify.mjs'), "import { readFileSync } from 'node:fs';\nprocess.exit(readFileSync('answer.txt', 'utf8') === '42' ? 0 : 1);\n");
  git('add', '.');
  git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'seed');
  const ref = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'agent.mjs'), AGENT);
  const tasks = Object.entries(taskPrompts).map(([id, prompt]) => {
    const path = join(root, `${id}.json`);
    writeFileSync(path, JSON.stringify({ task_id: id, split: 'test', repo_ref: { kind: 'git', ref }, prompt,
      allowed_tools: ['edit'], budget: { max_turns: 5, max_wall_time_seconds: 30, max_tokens: 1000 },
      success_check: { kind: 'command', command: 'node verify.mjs' }, expected_touched_paths: ['answer.txt'], tags: ['lab'] }));
    return { path, verifierFiles: ['verify.mjs'] };
  });
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify({ id: 'lab-test', repository: repo, runtime: 'claude', model: 'fake',
    executor: { kind: 'command', argv: [process.execPath, join(root, 'agent.mjs'), '{cwd}', '{prompt}'] },
    advice: { text: 'Write the answer the verifier expects.' }, tasks, runsPerArm: 3, concurrency: 4,
    budget: { maxTokens: 100000 }, alpha: 0.1, seed: 7, ...plan }));
  return { root, repo, planPath, out: join(root, 'out'), git, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('a lab screen runs balanced arms in parallel and detects a within-task benefit', async () => {
  const f = labFixture({ alpha: 'Solve alpha.', beta: 'Solve beta.' });
  try {
    const dry = await runLab(f.planPath, f.out, { dryRun: true }) as any;
    assert.deepEqual(dry.blocks.map((b: any) => b.arms.filter((a: string) => a === 'advice').length), [3, 3]);
    assert.equal(existsSync(f.out), false, 'a dry run launches nothing');

    const { report } = await runLab(f.planPath, f.out) as any;
    assert.equal(report.screen, 'benefit');
    assert.ok(Math.abs(report.pValues.benefit - 1 / 400) < 1e-12, 'two tasks, each 3/3 versus 0/3');
    assert.deepEqual(report.tasks.map((t: any) => [t.advice, t['no-advice']]),
      [[['pass', 'pass', 'pass'], ['fail', 'fail', 'fail']], [['pass', 'pass', 'pass'], ['fail', 'fail', 'fail']]]);
    assert.deepEqual(reportLab(f.out).pValues, report.pValues, 'the report is reproducible from retained results');

    const results = readFileSync(join(f.out, 'results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const spans = results.map(r => [Date.parse(r.startedAt), Date.parse(r.endedAt)]);
    assert.ok(spans.some(([s, e]) => spans.filter(([s2, e2]) => s2 < e && s < e2).length > 1), 'runs overlap in time');
    assert.equal(f.git('worktree', 'list').split('\n').length, 1, 'sandboxes are removed');
    for (const r of results) {
      const patch = readFileSync(join(f.out, 'runs', r.id, 'diff.patch'), 'utf8');
      assert.match(patch, /agent\.json/);
      const env = JSON.parse(patch.match(/\+(\{"started".*\})/)![1]);
      assert.ok(env.store.startsWith(join(f.out, 'runs', r.id)), 'each run gets an isolated lesson store');
      assert.equal(existsSync(env.config), false, 'native Lyo config is disabled');
    }
  } finally { f.close(); }
});

test('a tampered verifier yields unknown outcomes, which count against benefit', async () => {
  const f = labFixture({ rigged: 'TAMPER then solve.' }, { runsPerArm: 2 });
  try {
    const { report } = await runLab(f.planPath, f.out) as any;
    assert.deepEqual(report.arms.advice, { assigned: 2, pass: 0, fail: 0, unknown: 2 });
    assert.equal(report.screen, 'inconclusive');
    const results = readFileSync(join(f.out, 'results.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    assert.ok(results.every(r => r.problems.includes('verifier files changed during the run')));
  } finally { f.close(); }
});

test('the token budget admits whole tasks before launch and skips the rest', async () => {
  // Each task reserves 2 runs x 1000 tokens; unmeasured runs are charged their reservation.
  const f = labFixture({ first: 'Solve first.', second: 'Solve second.' }, { runsPerArm: 1, budget: { maxTokens: 3000 } });
  try {
    const { report } = await runLab(f.planPath, f.out) as any;
    assert.deepEqual(report.skippedTasks, ['second']);
    assert.equal(report.spentTokens, 2000);
    assert.equal(report.tasks.length, 1);
  } finally { f.close(); }
});
