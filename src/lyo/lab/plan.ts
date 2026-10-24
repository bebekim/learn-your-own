import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import { hashValue } from '../contract/refs.ts';
import { parseEvalTask, type EvalTask } from '../eval/tasks.ts';

const text = z.string().trim().min(1);

/** A lab screen: paired advice/no-advice runs of registered tasks in isolated worktrees. */
export const labPlanSchema = z.object({
  id: text,
  repository: text,
  runtime: z.enum(['claude', 'codex']),
  model: text,
  // Replaces the host CLI; `{cwd}` and `{prompt}` in argv are substituted per run.
  executor: z.object({ kind: z.literal('command'), argv: z.array(text).min(1) }).strict().optional(),
  advice: z.object({ text: text.max(4000), findingId: text.optional() }).strict(),
  tasks: z.array(z.object({ path: text, verifierFiles: z.array(text).min(1) }).strict()).min(1),
  runsPerArm: z.number().int().min(1).max(25),
  concurrency: z.number().int().min(1).max(16),
  budget: z.object({ maxTokens: z.number().int().positive() }).strict(),
  alpha: z.number().gt(0).max(0.1),
  seed: z.number().int(),
}).strict().refine(plan => plan.tasks.length * 2 * plan.runsPerArm <= 400, 'a lab plan allows at most 400 runs');

export type LabPlan = z.infer<typeof labPlanSchema>;
export interface LabTask { task: EvalTask; verifierFiles: string[] }
export interface LabRun { id: string; task: LabTask; arm: 'advice' | 'no-advice' }

export function loadLabPlan(planPath: string): { plan: LabPlan; hash: string; tasks: LabTask[] } {
  const plan = labPlanSchema.parse(JSON.parse(readFileSync(planPath, 'utf8')));
  plan.repository = realpathSync(resolve(dirname(planPath), plan.repository));
  const tasks = plan.tasks.map(entry => {
    const task = parseEvalTask(JSON.parse(readFileSync(resolve(dirname(planPath), entry.path), 'utf8')));
    if (task.repo_ref.kind !== 'git' || task.success_check.kind !== 'command')
      throw new Error(`${task.task_id}: lab tasks need a git repo_ref and a command success_check`);
    return { task, verifierFiles: entry.verifierFiles };
  });
  if (new Set(tasks.map(entry => entry.task.task_id)).size !== tasks.length) throw new Error('lab task ids must be unique');
  return { plan, hash: hashValue({ plan, tasks }), tasks };
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One block per task with exactly runsPerArm runs in each arm, in a seeded random order. */
export function labSchedule(plan: LabPlan, tasks: LabTask[]): LabRun[][] {
  return tasks.map((entry, index) => {
    const random = seededRandom(plan.seed + index * 0x9e3779b1);
    const arms = Array.from({ length: 2 * plan.runsPerArm }, (_, n) => n < plan.runsPerArm ? 'advice' as const : 'no-advice' as const);
    for (let i = arms.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [arms[i], arms[j]] = [arms[j], arms[i]];
    }
    return arms.map((arm, n) => ({ id: `${entry.task.task_id}-${n}`, task: entry, arm }));
  });
}
