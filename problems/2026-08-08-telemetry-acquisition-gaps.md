# Telemetry Acquisition Gaps — Root Cause Analysis

**Date:** 2026-08-08
**Method:** Peeked at 11 populated SQLite databases (1MB+), traced every table writer back to source.

## Summary

The schema defines rich analysis columns (`classification`, `phase`, `outcome`, `deployment`),
but the extraction code that fills them is stubbed with hardcoded defaults. The result:
millions of hook events recorded, but almost nothing classifiable.

## Findings by Table

### 1. command_activations — classification always `unknown`

**Schema:** `classification` column with CHECK constraint accepting 12 categories
(test, build, lint, format, deploy, database, cloud, package, git, inspect, local_dev, unknown).

**Data:** ~95% of rows are `unknown`. Only `agent-learning-workflow` has a few classified
rows (git: 172, test: 36, database: 11, package: 2) — likely from manual or older code paths.

**Root cause:** `src/hooks/normalizer.ts:83` hardcodes `classification: 'unknown'`.
No classifier function exists anywhere in the codebase. The `CommandClassification` type
is defined in `src/types/activation.ts:3` but never assigned by any logic.

**Also:** `commandFamily` is set to `commandName` (line 79) — no grouping logic.
`npm`, `npx`, `pnpm`, `yarn` all stay as separate families instead of mapping to `npm`.

**Fix:** Add a `classifyCommand(commandName, argv)` function that maps known commands
to categories. Add a `familyForCommand(commandName)` function for family grouping.

### 2. path_activations + command_activations — phase always `unknown`

**Schema:** `phase` column with `BehaviorPhase` type (explore, fix, validate, unknown).

**Data:** 100% `unknown` across all DBs.

**Root cause:** `src/hooks/normalizer.ts:85` hardcodes `phase: 'unknown'` for commands.
`src/hooks/normalizer.ts:97` hardcodes `phase: 'unknown'` for paths.

**Fix:** Infer phase from event context. A `PreToolUse`/`tool.before` read suggests
`explore`. A write or edit suggests `fix`. A test or build command suggests `validate`.
This requires looking at the event name and command classification together.

### 3. zone_associations — outcomes always 0

**Schema:** `positive_outcomes`, `negative_outcomes`, `weight`, `support_count` columns.
`zone_association_observations` table with `outcome` column (positive/negative/unknown).

**Data:** nectr_data_eng has 14 associations, all with `positive_outcomes=0`,
`negative_outcomes=0`. Other DBs have no zones at all.

**Root cause (two bugs):**

1. **Outcome never determined:** `src/hooks/runtime.ts:198` passes
   `outcome: options.normalizeOutcome ?? 'unknown'` — always defaults to `'unknown'`.
   No code anywhere determines whether a job had a positive or negative outcome.
   The `normalizeHooks()` call in `normalization-runner.ts:132` also defaults to
   `'unknown'` when `input.outcome` is not provided.

2. **INSERT OR IGNORE blocks UPDATE:** `src/activation/derivation.ts:153-162`:
   The observation INSERT uses `INSERT OR IGNORE`. When the same (association_id, job_id)
   pair is seen again, the INSERT is ignored (`observation.changes === 0`), and the code
   `continue`s — skipping the UPDATE that would increment `support_count` and outcomes.
   So even if outcomes were correctly determined, repeat observations for the same
   job would never update the association.

**Fix:** (a) Add outcome determination logic — infer from stop events, test results,
error signals. (b) Fix the derivation logic so repeat observations still update
`support_count` and outcome counters.

### 4. deployment_actions — always empty

**Schema:** `deployment_actions` table with provider, environment, target, status.

**Data:** 0 rows across all 121 DBs.

**Root cause:** `src/hooks/normalizer.ts:87` hardcodes `deployment: null`.
No extraction logic for deployment commands (e.g., `releasectl deploy`, `terraform apply`,
`kubectl apply`, `docker push`, `gh deploy`).

**Fix:** Add deployment detection in `extractHookFacts()` — match command names and
argv patterns against known deployment tools.

### 5. session_prompts — only 2 kinds

**Schema:** `prompt_kind` column (free text, no CHECK constraint).

**Data:** `user_prompt` and `assistant_response` only. One `repo-direction` row in
agent-learning-workflow (likely from an older code path or manual entry).

**Root cause:** `src/adapters/codex.ts` and `src/adapters/claude.ts` only emit
`user_prompt` and `assistant_response`. No logic to classify the first prompt of a
session as a direction-setting prompt.

**Priority:** Low. This is a feature enhancement, not a broken pipeline.

## Files Requiring Modification

| File | Issue | Priority |
|---|---|---|
| `src/hooks/normalizer.ts` | classification, phase, deployment, commandFamily all hardcoded | P0 |
| `src/activation/derivation.ts` | INSERT OR IGNORE blocks UPDATE on repeat observations | P0 |
| `src/hooks/runtime.ts` | outcome always defaults to 'unknown' | P1 |
| `src/hooks/normalization-runner.ts` | outcome passed through from runtime, also defaults to 'unknown' | P1 |
| `src/behavior/commands.ts` | No classification logic (only redaction) | P0 (new function) |

## Feature Branches

1. **`feat/command-classifier`** — Add `classifyCommand()` + `familyForCommand()` to
   `src/behavior/commands.ts`, wire into `normalizer.ts`. TDD.

2. **`fix/zone-outcome-tracking`** — Fix INSERT OR IGNORE bug in `derivation.ts`,
   add outcome inference in `runtime.ts`. TDD.

3. **`feat/phase-inference`** — Add `inferPhase()` to `normalizer.ts`, using event name
   + command classification. TDD.

4. **`feat/deployment-extraction`** — Add `extractDeployment()` to `normalizer.ts`,
   detect known deployment tools. TDD.
