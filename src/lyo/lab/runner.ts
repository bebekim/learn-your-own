import { spawn, execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runLocalEpisode } from '../eval/live-runner.ts';
import { hostUsage } from '../control/task-evidence.ts';
import { hostArgs } from '../control/task-run.ts';
import { evaluateFindingTrialPolicy, type FindingTrialOutcome } from '../domain/finding-trial-policy.ts';
import { LessonStore } from '../storage/lesson-store.ts';
import { labSchedule, loadLabPlan, type LabPlan, type LabRun } from './plan.ts';

export interface LabResult {
  id: string;
  taskId: string;
  arm: 'advice' | 'no-advice';
  outcome: 'pass' | 'fail' | 'unknown';
  problems: string[];
  exitCode: number | null;
  timedOut: boolean;
  totalTokens: number | null;
  startedAt: string;
  endedAt: string;
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function prompt(plan: LabPlan, run: LabRun): string {
  return run.arm === 'advice' ? `${run.task.task.prompt}\n\nLyo advice for this task: ${plan.advice.text}` : run.task.task.prompt;
}

/** Kill the whole process group on timeout so host tool processes are not orphaned. */
function execute(argv: string[], cwd: string, env: NodeJS.ProcessEnv, dir: string, timeoutMs: number) {
  return new Promise<{ exitCode: number | null; timedOut: boolean; error: string | null }>(done => {
    const out = openSync(join(dir, 'trace.jsonl'), 'wx'), err = openSync(join(dir, 'stderr.log'), 'wx');
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: ['ignore', out, err], detached: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; try { process.kill(-child.pid!, 'SIGKILL'); } catch { /* already gone */ } }, timeoutMs);
    const finish = (exitCode: number | null, error: string | null) => {
      clearTimeout(timer); closeSync(out); closeSync(err); done({ exitCode, timedOut, error });
    };
    child.once('error', error => finish(null, error.message));
    child.once('exit', code => finish(code, null));
  });
}

function measuredTokens(plan: LabPlan, trace: string): number | null {
  if (plan.executor) return null;
  try {
    const rows = trace.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    const init = rows.find(row => plan.runtime === 'codex' ? row.type === 'thread.started' : row.type === 'system' && row.subtype === 'init');
    return hostUsage(plan.runtime, plan.runtime === 'codex' ? init?.thread_id : init?.session_id, trace).totalTokens;
  } catch { return null; }
}

async function runOne(plan: LabPlan, run: LabRun, outDir: string, hostBinary?: string): Promise<LabResult> {
  const dir = join(outDir, 'runs', run.id), repo = join(dir, 'repo');
  mkdirSync(dir, { recursive: true });
  const { task, verifierFiles } = run.task, ref = task.repo_ref.ref, startedAt = new Date().toISOString();
  git(plan.repository, ['worktree', 'add', '--detach', repo, ref]);
  const problems: string[] = [];
  try {
    // An empty lesson store and no native config keep ambient Lyo guidance identical across arms.
    const isolatedStore = join(dir, 'isolated-lessons.db');
    new LessonStore(isolatedStore).close();
    const env = { ...process.env, LYO_STORE_PATH: isolatedStore, LYO_CONFIG_FILE: join(dir, 'no-lyo-config.json') };
    const text = prompt(plan, run);
    writeFileSync(join(dir, 'prompt.txt'), text);
    const argv = plan.executor
      ? plan.executor.argv.map(arg => arg.replaceAll('{cwd}', repo).replaceAll('{prompt}', text))
      : [hostBinary ?? plan.runtime, ...hostArgs(plan.runtime, plan.model, repo, text)];
    const host = await execute(argv, repo, env, dir, task.budget.max_wall_time_seconds * 1000);
    if (host.error) problems.push(`executor failed: ${host.error}`);
    if (host.timedOut) problems.push('executor reached its wall-time budget');
    const totalTokens = measuredTokens(plan, readFileSync(join(dir, 'trace.jsonl'), 'utf8'));
    let outcome: LabResult['outcome'] = 'unknown';
    if (git(repo, ['status', '--porcelain', '--', ...verifierFiles]).trim()) problems.push('verifier files changed during the run');
    else {
      const verdict = runLocalEpisode({ task, baselineId: 'B0', model: plan.model, harness: 'lab-verifier', cwd: repo }).outcome.verified_success;
      outcome = verdict === true ? 'pass' : verdict === false ? 'fail' : 'unknown';
    }
    git(repo, ['add', '--all']);
    writeFileSync(join(dir, 'diff.patch'), git(repo, ['diff', '--cached', '--binary', ref]));
    return { id: run.id, taskId: task.task_id, arm: run.arm, outcome, problems, exitCode: host.exitCode, timedOut: host.timedOut,
      totalTokens, startedAt, endedAt: new Date().toISOString() };
  } finally {
    git(plan.repository, ['worktree', 'remove', '--force', repo]);
  }
}

/** The repository-stratified exact test, with each task as a stratum; a screen, not a delivery decision. */
export function analyzeLab(plan: LabPlan, results: LabResult[]) {
  const rows: FindingTrialOutcome[] = results.map(result => ({ unit: result.taskId, closed: true, outcome: result.outcome,
    assignment: { action: result.arm, probability: 0.5 } }));
  const decision = evaluateFindingTrialPolicy(rows, { sampleSize: rows.length, minimumEffect: 0, alpha: plan.alpha,
    assumptions: 'Fair within-task assignment; runs share no state.', method: 'stratified-exact' }, { suspended: false, superseded: false });
  const tokens = (arm: LabResult['arm']) => {
    const counts = results.filter(result => result.arm === arm).map(result => result.totalTokens);
    return counts.every(count => count !== null) ? counts.reduce((sum, n) => sum + n!, 0) : null;
  };
  const screen = { promoted: 'benefit', harmful: 'harm', inconclusive: 'inconclusive' }[decision.status] ?? 'inconclusive';
  return { planId: plan.id, findingId: plan.advice.findingId ?? null, screen, pValues: decision.pValues ?? null, arms: decision.arms,
    tokens: { advice: tokens('advice'), 'no-advice': tokens('no-advice') },
    tasks: [...new Set(results.map(result => result.taskId))].map(taskId => ({ taskId,
      advice: results.filter(r => r.taskId === taskId && r.arm === 'advice').map(r => r.outcome),
      'no-advice': results.filter(r => r.taskId === taskId && r.arm === 'no-advice').map(r => r.outcome) })),
    limitation: 'A lab screen measures the declared verifier on replayed tasks; ordinary-session trials establish benefit in real work.' };
}

export async function runLab(planPath: string, outDir: string, options: { dryRun?: boolean; hostBinary?: string } = {}) {
  const { plan, hash, tasks } = loadLabPlan(planPath);
  const blocks = labSchedule(plan, tasks);
  const reserve = (block: LabRun[]) => block.reduce((sum, run) => sum + run.task.task.budget.max_tokens, 0);
  if (options.dryRun) return { ok: true, dryRun: true, planHash: hash, budget: plan.budget.maxTokens,
    blocks: blocks.map(block => ({ taskId: block[0].task.task.task_id, runs: block.length, reservedTokens: reserve(block),
      arms: block.map(run => run.arm) })) };
  outDir = resolve(outDir);
  if (existsSync(join(outDir, 'results.jsonl'))) throw new Error('lab output already has results; use a new --out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'plan.json'), JSON.stringify({ hash, plan, tasks }, null, 2), { flag: 'wx' });

  // Whole task blocks are admitted against the budget before any of their runs start, so which
  // tasks run never depends on an admitted task's own assignments or outcomes.
  let spent = 0, reserved = 0, inFlight = 0, nextBlock = 0;
  const queue: LabRun[] = [], results: LabResult[] = [], skipped: string[] = [];
  await new Promise<void>((done, fail) => {
    const pump = () => {
      while (inFlight < plan.concurrency) {
        if (!queue.length && nextBlock < blocks.length) {
          const block = blocks[nextBlock], cost = reserve(block);
          if (spent + reserved + cost <= plan.budget.maxTokens) { reserved += cost; queue.push(...block); nextBlock++; }
          else if (inFlight) break;
          else { skipped.push(...blocks.slice(nextBlock).map(b => b[0].task.task.task_id)); nextBlock = blocks.length; }
        }
        const run = queue.shift();
        if (!run) break;
        inFlight++;
        runOne(plan, run, outDir, options.hostBinary).then(result => {
          // An unmeasured run is charged its full reservation.
          reserved -= run.task.task.budget.max_tokens;
          spent += result.totalTokens ?? run.task.task.budget.max_tokens;
          results.push(result);
          appendFileSync(join(outDir, 'results.jsonl'), `${JSON.stringify(result)}\n`);
          inFlight--;
          pump();
        }, fail);
      }
      if (!inFlight && !queue.length && nextBlock >= blocks.length) done();
    };
    pump();
  });
  const report = { ...analyzeLab(plan, results), planHash: hash, spentTokens: spent, skippedTasks: skipped };
  writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  return { ok: true, outDir, report };
}

export function reportLab(outDir: string) {
  const { plan } = JSON.parse(readFileSync(join(outDir, 'plan.json'), 'utf8'));
  const results = readFileSync(join(outDir, 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
  return analyzeLab(plan, results);
}
