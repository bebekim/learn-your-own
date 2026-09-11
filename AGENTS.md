# AGENTS.md

## Project

Lyo (Learn Your Own) — a local learning ledger for AI-agent work.
Node.js 24+ (uses `node:sqlite`). TypeScript. Published as `lyo-kernel` on npm.

## Standing reasoning mandate: distinguish proxy from witness

Apply this throughout design, implementation, review, diagnosis, and learning.
It is a user-mandated reasoning discipline, independent of lesson ranking,
retrieval, or promotion. Its status as a mandate does not award learning credit.

Before accepting an inference, ask: **Could this evidence exist while the claim
is false?** Separate the claim, the observed facts, and the inference connecting
them. A witness establishes the specific claim under stated assumptions; a
proxy only suggests it. Evidence is a witness relative to a claim and context,
not inherently because it is positive, direct-looking, or named after the claim.

- Enumerate plausible alternative causes of the observation, including missing,
  delayed, filtered, stale, or misclassified measurements. Do not reverse an
  implication: a state producing an observation does not make that observation
  sufficient evidence of the state.
- Trace how the observation was produced, transformed, and retained. Check its
  identity, scope, timing, and completeness before relying on it. Absence can be
  evidence when the observation process is sufficiently complete; justify that
  assumption rather than treating absence as proof by default.
- Choose probes that distinguish competing explanations. Test counterexamples,
  mixed causes, and relevant sibling paths or lifecycle boundaries. A positive
  signal can still require exclusions; validate the witness itself.
- State only the conclusion supported by those checks. Preserve unknown when
  evidence is insufficient; withholding an action is not proof of a negative
  outcome. Revisit both the claim and its scope when counterevidence arrives.

In LYO, emitted advice does not establish adherence, a passing retry does not
establish benefit, and an empty verifier summary does not establish that no
verification occurred. Name fields and conclusions for what was actually
observed. Make consequential claim/evidence/limitation distinctions explicit;
keep the explanation proportionate rather than adding a checklist to every reply.

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
