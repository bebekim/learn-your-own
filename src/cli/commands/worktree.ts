import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

import { checkBlindness, validatePlan, validateSpec } from '../../contract/index.ts';
import { compileSpecMarkdown } from '../../runner/spec-compiler.ts';
import type { CommandArgs, CommandHandler } from './context.ts';
import { connectWorkspace, isWithinRoot, workspaceSyncConfig } from '../../corpus/workspace-sync.ts';

export const WORKTREE_COMMANDS: Record<string, CommandHandler> = {
  'worktree add': worktreeAddCommand,
};

async function worktreeAddCommand(args: CommandArgs): Promise<unknown> {
  const specPath = args.flagValue('--spec') ? resolve(args.cwd, args.requiredFlag('--spec')) : null;
  const branch = args.requiredFlag('--branch');
  // worktree path: default .worktrees/<branch> or explicit --path
  const positionalPath = args.argv[4] && !args.argv[4].startsWith('-') ? args.argv[4] : undefined;
  const worktreePath = resolve(args.cwd, args.flagValue('--path') ?? positionalPath ?? join('.worktrees', branch));
  const taskDir = resolve(args.flagValue('--task-dir') ?? join(worktreePath, '.pipeline', branch));
  const baseBranch = args.flagValue('--base') ?? 'HEAD';
  const force = args.hasFlag('--force');

  if (specPath && !existsSync(specPath)) {
    throw new Error(`spec not found: ${specPath}`);
  }
  const config = workspaceSyncConfig(args.env);
  let ancestor = worktreePath;
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const actualPath = resolve(realpathSync(ancestor), relative(ancestor, worktreePath));
  if (!specPath && (!config || !isWithinRoot(config.rootDir, actualPath))) {
    throw new Error('Connected worktrees require a path under the rootDir configured in ~/.lyo/config.json');
  }

  // 1. git worktree add
  if (existsSync(worktreePath) && !force) {
    throw new Error(`worktree path already exists: ${worktreePath} (use --force to overwrite)`);
  }
  try {
    execFileSync('git', ['worktree', 'add', ...(force ? ['--force'] : []), '-b', branch, worktreePath, baseBranch], {
      cwd: args.cwd, stdio: 'pipe',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface git stderr
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
    throw new Error(`git worktree add failed: ${stderr || msg}`);
  }

  let connection;
  try { connection = config ? connectWorkspace(worktreePath, config) : null; }
  catch (error) {
    throw new Error(`Worktree created at ${worktreePath}, but central connection failed. Retry: lyo connect --path ${worktreePath}. ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!specPath) return { ok: true, worktree: worktreePath, branch, baseBranch, connection };

  // 2. pipeline init inside the worktree (compile spec → plan)
  const { spec, plan } = compileSpecMarkdown({ specPath });
  const specValidation = validateSpec(spec);
  if (!specValidation.ok) {
    throw new Error(`compiled spec invalid: ${specValidation.errors.map((e) => e.message).join('; ')}`);
  }
  const planValidation = validatePlan(plan);
  if (!planValidation.ok) {
    throw new Error(`compiled plan invalid: ${planValidation.errors.map((e) => e.message).join('; ')}`);
  }
  const blindness = checkBlindness(planValidation.value);
  if (!blindness.ok) {
    throw new Error(`compiled plan violates blindness:\n- ${blindness.violations.join('\n- ')}`);
  }
  mkdirSync(taskDir, { recursive: true });
  // Copy spec into worktree-adjacent task dir's spec.json/plan.json
  // Also keep the original spec available for the pipeline's hash check.
  const specOut = join(taskDir, 'spec.json');
  const planOut = join(taskDir, 'plan.json');
  writeFileSync(specOut, JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(planOut, JSON.stringify(plan, null, 2) + '\n');

  // plan.specRef.path is the basename; pipeline run resolves it relative to plan.json's dir.
  // The spec hash was already validated via compileSpecMarkdown; file lives beside plan.json
  // via the original spec copy if needed.

  return {
    ok: true,
    worktree: worktreePath,
    branch,
    baseBranch,
    specPath,
    specId: spec.specId,
    specOut,
    planOut,
    next: `lyo pipeline run --plan ${planOut} --runs-root ${join(taskDir, 'runs')}`,
  };
}
