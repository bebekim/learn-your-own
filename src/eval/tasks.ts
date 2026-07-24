import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

export const EVAL_SPLITS = ['train', 'selection', 'test'] as const;
export type EvalSplit = typeof EVAL_SPLITS[number];

export interface EvalTaskSummary {
  taskId: string;
  split: EvalSplit;
  file: string;
}

export interface EvalTaskValidationReport {
  dir: string;
  taskCount: number;
  splitCounts: Record<EvalSplit, number>;
  tasks: EvalTaskSummary[];
}

type JsonObject = Record<string, unknown>;

export function validateEvalTaskDirectory(dir: string): EvalTaskValidationReport {
  const splits = readJsonObject(join(dir, 'splits.json'));
  const splitTaskIds = readSplitTaskIds(splits);
  const taskDir = join(dir, 'tasks');
  const tasks = readdirSync(taskDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => validateTaskFile(join(taskDir, file), file));

  const errors: string[] = [];
  const seen = new Set<string>();
  const seenBySplit: Record<EvalSplit, Set<string>> = {
    train: new Set(),
    selection: new Set(),
    test: new Set(),
  };

  for (const task of tasks) {
    if (seen.has(task.taskId)) errors.push(`duplicate task_id: ${task.taskId}`);
    seen.add(task.taskId);
    seenBySplit[task.split].add(task.taskId);
  }

  for (const split of EVAL_SPLITS) {
    for (const taskId of splitTaskIds[split]) {
      if (!seenBySplit[split].has(taskId)) {
        errors.push(`splits.json lists missing ${split} task: ${taskId}`);
      }
    }
    for (const taskId of seenBySplit[split]) {
      if (!splitTaskIds[split].has(taskId)) {
        errors.push(`task ${taskId} has split ${split} but is missing from splits.json`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`invalid eval task set:\n- ${errors.join('\n- ')}`);
  }

  return {
    dir,
    taskCount: tasks.length,
    splitCounts: {
      train: seenBySplit.train.size,
      selection: seenBySplit.selection.size,
      test: seenBySplit.test.size,
    },
    tasks,
  };
}

function validateTaskFile(path: string, file: string): EvalTaskSummary {
  const task = readJsonObject(path);
  const errors: string[] = [];
  const taskId = requireString(task, 'task_id', errors);
  const split = requireSplit(task, errors);

  requireRepoRef(task, errors);
  requireString(task, 'prompt', errors);
  requireStringArray(task, 'allowed_tools', errors);
  requireBudget(task, errors);
  requireSuccessCheck(task, errors);
  requireStringArray(task, 'expected_touched_paths', errors);
  requireStringArray(task, 'tags', errors);

  if (errors.length > 0) {
    throw new Error(`invalid eval task ${basename(file)}:\n- ${errors.join('\n- ')}`);
  }

  return {
    taskId,
    split,
    file,
  };
}

function readSplitTaskIds(value: JsonObject): Record<EvalSplit, Set<string>> {
  const errors: string[] = [];
  const result: Record<EvalSplit, Set<string>> = {
    train: new Set(requireStringArray(value, 'train', errors)),
    selection: new Set(requireStringArray(value, 'selection', errors)),
    test: new Set(requireStringArray(value, 'test', errors)),
  };
  if (errors.length > 0) {
    throw new Error(`invalid eval splits.json:\n- ${errors.join('\n- ')}`);
  }
  return result;
}

function requireRepoRef(task: JsonObject, errors: string[]): void {
  const value = requireObject(task, 'repo_ref', errors);
  if (!value) return;
  requireString(value, 'kind', errors);
  requireString(value, 'ref', errors);
}

function requireBudget(task: JsonObject, errors: string[]): void {
  const value = requireObject(task, 'budget', errors);
  if (!value) return;
  requirePositiveNumber(value, 'max_turns', errors);
  requirePositiveNumber(value, 'max_wall_time_seconds', errors);
  requirePositiveNumber(value, 'max_tokens', errors);
}

function requireSuccessCheck(task: JsonObject, errors: string[]): void {
  const value = requireObject(task, 'success_check', errors);
  if (!value) return;
  const kind = value.kind;
  if (kind === 'command') {
    requireString(value, 'command', errors);
    return;
  }
  if (kind === 'evaluator') {
    requireString(value, 'evaluator_id', errors);
    return;
  }
  errors.push('success_check.kind must be command or evaluator');
}

function requirePositiveNumber(object: JsonObject, key: string, errors: string[]): number {
  const value = object[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    errors.push(`${key} must be a positive number`);
    return 0;
  }
  return value;
}

function requireSplit(task: JsonObject, errors: string[]): EvalSplit {
  const value = task.split;
  if (value === 'train' || value === 'selection' || value === 'test') return value;
  errors.push('split must be train, selection, or test');
  return 'train';
}

function requireStringArray(object: JsonObject, key: string, errors: string[]): string[] {
  const value = object[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.length > 0)) {
    errors.push(`${key} must be a non-empty string array`);
    return [];
  }
  return value;
}

function requireObject(object: JsonObject, key: string, errors: string[]): JsonObject | null {
  const value = object[key];
  if (!isJsonObject(value)) {
    errors.push(`${key} must be an object`);
    return null;
  }
  return value;
}

function requireString(object: JsonObject, key: string, errors: string[]): string {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) {
    errors.push(`${key} must be a non-empty string`);
    return '';
  }
  return value;
}

function readJsonObject(path: string): JsonObject {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!isJsonObject(value)) {
    throw new Error(`${path} must contain a JSON object`);
  }
  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
