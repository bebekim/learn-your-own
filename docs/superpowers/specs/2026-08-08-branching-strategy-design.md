# Branching Strategy: Worktree + Squash Merge

## Problem

All development happens directly on `main`. There is no isolation between
features, no test gate before changes land, and no way to experiment without
polluting main's history. This makes it hard to develop new features
confidently.

## Goal

Keep `main` always green (tests + typecheck pass). Isolate feature work in
git worktrees. Land features as single squash-merged commits.

## Design

### Branch naming

```
feat/<short-name>      new features (e.g., feat/awok-init)
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

**Work and commit freely** in the worktree. Intermediate commits can be
messy — they will be squashed on merge.

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

1. **`main` is always green.** No direct commits to main. All work goes
   through a worktree branch.
2. **Squash only.** One commit per feature on main. Easy to revert.
3. **Test gate before merge.** `npm test` + `npm run typecheck` both pass.
4. **One worktree per feature.** Remove it when done. Do not accumulate
   stale worktrees.
5. **Commit message format:** `<type>: <description>` (e.g.,
   `feat: add awok init command`, `fix: correct lesson selection demotion`).

### What changes

- An `AGENTS.md` file at the project root documenting this workflow so both
  the developer and any AI agent working in the repo follows the same
  convention.

### What does not change

- No new dependencies, scripts, or hooks.
- No CI changes (there is no CI currently).
- No changes to `package.json`.
- The existing `.worktrees/` entry in `.gitignore` already covers worktree
  directories.

### Escalation path

If the manual workflow proves insufficient (forgetting commands, skipping
the test gate), escalate to:

1. A shell helper script (`scripts/feature.sh`) that wraps worktree
   creation, test gating, and squash merge.
2. A pre-push git hook that blocks if tests or typecheck fail.
