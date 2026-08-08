# AGENTS.md

## Project

Lyo (Learn Your Own) — a local learning ledger for AI-agent work.
Node.js 24+ (uses `node:sqlite`). TypeScript. Published as `lyo-kernel` on npm.

## Commands

```sh
npm test          # run tests (node --test)
npm run typecheck # type check (tsc --noEmit)
npm run build:npm # build npm package
npm run pack:local # pack for local testing
```

## Branching Strategy

All feature work uses git worktrees + squash merge. `main` stays green.

### Branch naming

```
feat/<short-name>      new features
fix/<short-name>       bug fixes
refactor/<short-name>  refactors with no behavior change
exp/<short-name>       experiments (may be thrown away)
```

### Workflow

**Start a feature:**

```sh
git worktree add .worktrees/<branch-name> -b <branch-name>
cd .worktrees/<branch-name>
```

**Work and commit freely** in the worktree. Intermediate commits can be messy.

**Test gate (before merging back):**

```sh
npm test
npm run typecheck
```

Both must pass. If either fails, fix before merging.

**Merge to main:**

```sh
cd /Users/marcus.kim/repositories/individual/agent-learning-workflow
git merge --squash <branch-name>
git commit -m "<type>: <description>"
```

**Cleanup:**

```sh
git worktree remove .worktrees/<branch-name>
git branch -D <branch-name>
```

### Rules

1. `main` is always green. No direct commits to main.
2. Squash only. One commit per feature on main.
3. Test gate before merge: `npm test` + `npm run typecheck` both pass.
4. One worktree per feature. Remove when done.
5. Commit messages: `<type>: <description>` (e.g., `feat: add awok init`).
