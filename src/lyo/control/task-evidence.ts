import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { hashFile, hashValue, type ArtifactRef } from '../contract/refs.ts';
import { parseEvalTask } from '../eval/tasks.ts';
import { runLocalEpisode } from '../eval/live-runner.ts';
import type { EvalEpisodeResult } from '../eval/live-runner.ts';
import type { ControlDecision, ControlFeedback } from './feedback-controller.ts';

const text = z.string().trim().min(1);
export const taskRegistrationSchema = z.object({
  attemptId: text, cwd: text, runtime: z.enum(['codex', 'claude']), model: text, family: text,
  condition: z.enum(['explore', 'baseline', 'learned']), policyId: text.optional(), pairId: text.optional(),
  criteria: z.array(text).min(1), verifierFiles: z.array(text).min(1),
  regressionCheck: z.object({ command: text, files: z.array(text).min(1) }).strict(),
  task: z.unknown().transform(parseEvalTask),
}).strict().refine(r => (r.condition === 'explore') === (r.task.split === 'train'), 'only exploration may use training tasks')
  .refine(r => r.condition !== 'learned' || r.policyId !== undefined, 'learned attempts require a frozen policy');

export type TaskRegistration = z.infer<typeof taskRegistrationSchema>;
export interface RegisteredTask {
  input: TaskRegistration;
  hash: string;
  registeredAt: string;
  verifierFiles: ArtifactRef[];
  regressionFiles: ArtifactRef[];
  verifierHash: string;
  taskFingerprint: string;
  startHead: string;
}

export interface TaskRecord {
  registration: RegisteredTask;
  decision?: ControlDecision;
  delivery?: { sessionId: string; promptHash: string; output: { additionalContext?: string }; createdAt: string };
  receipt?: TaskReceipt;
}
export interface TaskReceipt {
  attemptId: string;
  registrationHash: string;
  measurement: ReturnType<typeof taskMeasurement>;
  episode: EvalEpisodeResult;
  feedback: ControlFeedback & { sequence: number };
}
export interface TaskPolicy {
  kind?: 'candidate-trial';
  interventionId?: string;
  evaluationBudget?: TaskRegistration['task']['budget'];
  id: string;
  controllerId: string;
  stateHash: string;
  revision: number;
  training: { episodes: number; unknownOutcomes: number; totalTokens: number | null; wallTimeMs: number };
  evidenceRefs: string[];
  trainingTaskFingerprints: string[];
}

export function registerTaskEvidence(value: unknown): RegisteredTask {
  const input = taskRegistrationSchema.parse(value);
  input.cwd = realpathSync(input.cwd);
  if (input.task.success_check.kind !== 'command') throw new Error('task feedback requires a command acceptance verifier');
  const startHead = git(input.cwd, ['rev-parse', 'HEAD']).trim();
  if (input.task.repo_ref.kind !== 'git' || git(input.cwd, ['rev-parse', input.task.repo_ref.ref]).trim() !== startHead)
    throw new Error('task repository reference must identify the current HEAD');
  if (git(input.cwd, ['status', '--porcelain']).trim()) throw new Error('register the task in a clean worktree before work starts');
  const verifierFiles = input.verifierFiles.map(path => hashFile(resolve(input.cwd, path)));
  const regressionFiles = input.regressionCheck.files.map(path => hashFile(resolve(input.cwd, path)));
  const verifierHash = hashValue({ acceptance: input.task.success_check, regression: input.regressionCheck.command,
    files: [...verifierFiles, ...regressionFiles].map(file => file.sha256) });
  const registration = { input, hash: hashValue(input), registeredAt: new Date().toISOString(),
    verifierFiles, regressionFiles, verifierHash, startHead,
    taskFingerprint: hashValue({ task: { ...input.task, task_id: undefined, split: undefined, repo_ref: undefined },
      criteria: input.criteria, verifierHash, startHead }) };
  if (runVerifier(registration, input.regressionCheck.command).outcome.verified_success !== true)
    throw new Error('the declared regression check must pass before the attempt starts');
  return registration;
}

export function runVerifier(registration: RegisteredTask, command?: string) {
  const { input } = registration;
  return runLocalEpisode({ task: command ? { ...input.task, success_check: { kind: 'command', command } } : input.task,
    baselineId: 'B0', model: input.model, harness: 'registered-verifier', cwd: input.cwd });
}

export function taskSource(registration: RegisteredTask) {
  const cwd = registration.input.cwd;
  const untracked = git(cwd, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
    .map(path => ({ path, base64: readFileSync(resolve(cwd, path)).toString('base64') }));
  return { head: git(cwd, ['rev-parse', 'HEAD']).trim(), diff: git(cwd, ['diff', '--binary', registration.startHead]), untracked };
}

export function taskMeasurement(registration: RegisteredTask, sessionId: string, tracePath: string) {
  const trace = readFileSync(tracePath, 'utf8');
  const usage = hostUsage(registration.input.runtime, sessionId, trace);
  const source = taskSource(registration);
  const problems: string[] = [];
  const verifierIntact = () => [...registration.verifierFiles, ...registration.regressionFiles]
    .every(file => { try { return hashFile(file.path).sha256 === file.sha256; } catch { return false; } });
  const intactBefore = verifierIntact();
  const acceptance = intactBefore ? runVerifier(registration) : null;
  const regression = intactBefore ? runVerifier(registration, registration.input.regressionCheck.command) : null;
  if (!intactBefore || !verifierIntact()) problems.push('registered verifier changed or disappeared');
  if (hashValue(source) !== hashValue(taskSource(registration))) problems.push('source changed during verification');
  if (!usage.complete) problems.push('host trace does not contain a complete measured run');
  const outcome = problems.length || acceptance?.outcome.verified_success == null || regression?.outcome.verified_success == null
    ? null : acceptance.outcome.verified_success && regression.outcome.verified_success;
  const wallTimeMs = Date.now() - Date.parse(registration.registeredAt);
  const budget = registration.input.task.budget;
  const withinBudget = usage.totalTokens === null || usage.turns === null ? null
    : usage.totalTokens <= budget.max_tokens && usage.turns <= budget.max_turns && wallTimeMs <= budget.max_wall_time_seconds * 1000;
  const reward = outcome === null || withinBudget === null ? null : Number(outcome && withinBudget);
  return { trace: { path: resolve(tracePath), sha256: createHash('sha256').update(trace).digest('hex'), content: trace }, usage, source,
    acceptance: acceptance?.verifier_evidence ?? null, regression: regression?.verifier_evidence ?? null,
    outcome, withinBudget, reward, wallTimeMs, problems, measuredAt: new Date().toISOString() };
}

export function hostUsage(runtime: TaskRegistration['runtime'], sessionId: string, trace: string) {
  const rows = trace.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  const sessions = rows.filter(row => runtime === 'codex' ? row.type === 'thread.started' : row.type === 'system' && row.subtype === 'init')
    .map(row => runtime === 'codex' ? row.thread_id : row.session_id);
  if (sessions.length !== 1 || sessions[0] !== sessionId) throw new Error('host trace session does not match the delivered task');
  const results = rows.filter(row => row.type === (runtime === 'codex' ? 'turn.completed' : 'result'));
  const count = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
  const complete = results.length > 0 && (runtime === 'codex'
    ? rows.filter(row => row.type === 'turn.started').length === results.length
      && !rows.some(row => row.type === 'turn.failed' || row.type === 'error')
    : results.length === 1 && results[0].session_id === sessionId && results[0].is_error === false);
  const tokens = results.map(row => runtime === 'codex'
    ? [row.usage?.input_tokens, row.usage?.output_tokens]
    : [row.usage?.input_tokens, row.usage?.cache_creation_input_tokens, row.usage?.cache_read_input_tokens, row.usage?.output_tokens]);
  const totalTokens = complete && tokens.flat().every(count) ? tokens.flat().reduce((sum, n) => sum + n, 0) : null;
  const turns = complete ? runtime === 'codex' ? results.length : results[0].num_turns : null;
  const cost = runtime === 'claude' && results.length === 1 ? results[0].total_cost_usd : null;
  return { complete, totalTokens, turns: count(turns) ? turns : null,
    estimatedCost: typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 ? cost : null };
}

function git(cwd: string, args: string[]): string {
  // ponytail: retain small task diffs inline; move large artifacts to a content store when the 32 MiB ceiling matters.
  return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}
