import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { checkBlindness, validatePlan, validateSpec } from '../../contract/index.ts';
import { compileSpecMarkdown } from '../../runner/spec-compiler.ts';
import type { CommandArgs, CommandHandler } from './context.ts';

export const WORKTREE_COMMANDS: Record<string, CommandHandler> = {
  'worktree add': worktreeAddCommand,
};

async function worktreeAddCommand(args: CommandArgs): Promise<unknown> {
  const specPath = resolve(args.requiredFlag('--spec'));
  const branch = args.requiredFlag('--branch');
  // worktree path: default .worktrees/<branch> or explicit --path
  const worktreePath = resolve(args.flagValue('--path') ?? join('.worktrees', branch));
  const taskDir = resolve(args.flagValue('--task-dir') ?? join(worktreePath, '.pipeline', branch));
  const baseBranch = args.flagValue('--base') ?? 'HEAD';
  const force = args.hasFlag('--force');

  if (!existsSync(specPath)) {
    throw new Error(`spec not found: ${specPath}`);
  }

  // 1. git worktree add
  if (existsSync(worktreePath) && !force) {
    throw new Error(`worktree path already exists: ${worktreePath} (use --force to overwrite)`);
  }
  try {
    execSync(`git worktree add ${force ? '--force' : ''} ${quote(worktreePath)} -b ${quote(branch)} ${quote(baseBranch)}`, {
      stdio: 'pipe',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Surface git stderr
    const stderr = (err as { stderr?: Buffer })?.stderr?.toString() ?? '';
    throw new Error(`git worktree add failed: ${stderr || msg}`);
  }

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

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}
