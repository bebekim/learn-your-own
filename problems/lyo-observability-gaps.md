# LYO Observability Gaps

## Summary

The LYO learning system has a fundamental split:
- **Hook layer** (Claude hooks): Records observations to SQLite — working
- **Pipeline layer** (`lyo pipeline run/learn`): Writes files only — NOT recording to SQLite

This means we have rich observation data (2652 + 1614 hook_events) but no structured record of pipeline runs, traces, or outcomes in the work repos.

---

## Current State

### What's Working

| Repo | hook_events | runs | learning_traces | outcomes |
|------|-------------|------|-----------------|----------|
| nectr_data_eng-crystalbrooks-env | 2652 | 0 | 0 | 0 |
| nectr-data-lake-rep-744 | 1614 | 0 | 0 | 0 |
| agent-learning-workflow/dogfood | — | — | — | — |

The dogfood scratch project uses a different (older) schema:
- `lesson` table: 1 lesson (les_9c2a1904eab29b03)
- `lesson_application`: 4 applications
- `lesson_decision`: 2 decisions

### What's Missing

1. **Pipeline runs not recorded**: `lyo pipeline run` writes `trace.json`, `verifier-report.json`, and artifacts to `runs/<run-id>/` but never inserts into the `runs` or `learning_traces` tables.

2. **No learning loop connection**: `lyo pipeline learn` consumes trace files and produces `lyo-update.json` + lesson markdown, but doesn't record outcomes to the database.

3. **Schema mismatch**: The dogfood DB uses the old LYO schema (lesson, lesson_application, lesson_decision). The work repos use the newer schema (runs, learning_traces, outcomes, hook_events) but only hook_events is populated.

---

## The Single Lesson We Have (dogfood)

**les_9c2a1904eab29b03** — the only lesson in the library:

| Field | Value |
|-------|-------|
| failure_class | output_generation |
| trigger_cue | missing regression coverage |
| explanation | Tests failed: npm test — Errors: - Missing regression coverage |
| intervention | Address the validator feedback before retrying. |
| Status | candidate |
| Counters | 4 helpful, 0 harmful, 4 uses |
| Posterior mean | 0.833 (Beta(5,1)) |

It's a procedural nudge, not a causal explanation. "Fix what the validator told you" — correct, but shallow.

### The Four Runs That Produced It

All four runs solved "Add a /health endpoint to the Express server" on Claude Haiku:

```
worker STARTED
→ ISSUE_OPENED: Add a /health endpoint
→ STATE_SNAPSHOT
→ VALIDATION_RESULT: rejected — "Missing regression coverage"
→ LYO_INTERVENTION: injects les_9c2a1904eab29b03
→ USER_GUIDANCE_AGENT: "Address the validator feedback before retrying." + lesson
→ STATE_SNAPSHOT (validation still rejected)
→ VALIDATION_RESULT: passed — "All tests pass now"
→ LYO_FEEDBACK: accepted
```

Thompson scores at selection time:

| Run | sampled_score | decision_id |
|-----|---------------|-------------|
| nimble-nebula-63 | 0.409 | (no decision log — pre-v0.2) |
| quick-bastion-95 | 0.331 | (no decision log) |
| misty-surge-90 | 0.899 | dec_7d142626fb9c8fa8 |
| eternal-bastion-0 | 0.557 | dec_9b439c9ad54d6858 |

The first two runs have no `lesson_decision` row — the decision log schema didn't exist yet.

---

## What "5.3 Architected and Not Deployed" Means

The counterfactual credit synthesis (§5.3 of the design doc) is **designed on paper but not implemented in code**.

### What It Would Require

1. **Propensity scores**: `lesson_decision` needs to store the probability of selecting each candidate lesson, not just the Thompson draw. Currently `sampled_score` stores θ (the draw), not P(lesson top-ranked | candidate set, posteriors).

2. **Candidate sets**: The full set of lessons considered at selection time, not just the one that was picked.

3. **Null-arm records**: Records of cycles where a lesson was NOT injected (control group).

4. **Run randomness record**: Seeds, temperature, model IDs — the "down payment on rung-3 counterfactuals" that WCS App I.2 requires.

### What Exists Instead

- Simple counter increments: "all pending injections get the outcome"
- This is the exact over-crediting problem that IPW/DR estimation is designed to fix
- The `lesson_decision` table exists but carries minimal data: one candidate, null arm = 0, empty context

### The Gap

| Component | Status |
|-----------|--------|
| L0: Receipts (trace files) | Working |
| L1: Per-lesson Beta counters | Working (in dogfood) |
| L2: Embedding retrieval | Not built |
| L3: Content compression | Not built |
| L4: Hindsight classifier credit | Not built |
| Counterfactual credit (§5.3) | Designed, not deployed |

---

## What "Layer 2" Means

In the LYO abstraction ladder:

- **Layer 0 (L0)**: Raw receipts — trace.json, verifier-report.json, hook_events. The "what happened" record.

- **Layer 1 (L1)**: Per-lesson Beta counters — helpful/harmful counts, Thompson sampling for selection. The "did this help?" metric. This is what the dogfood system has.

- **Layer 2 (L2)**: Embedding retrieval — the ability to find relevant lessons by semantic similarity rather than just by classification tag. Without this, you can only retrieve lessons by exact match on failure_class. A new failure mode that's semantically similar to an existing lesson won't find it.

- **Layer 3 (L3)**: Content compression — distilling lessons into more compact, transferable forms. Moving from "here's a long lesson file" to "here's the essential rule."

- **Layer 4 (L4)**: Hindsight classifier credit — using a classifier to retroactively assign credit based on outcomes, rather than just counting "injected → passed = helpful." This is what separates "the lesson was present" from "the lesson caused the improvement."

The blog draft's central claim — that delivery is not learning — is exactly about the gap between L1 (counters move) and L4 (we know why).

---

## Why SQLite Wasn't Populated for 2/3 Repos

**Short answer**: The pipeline doesn't write to SQLite. It writes files.

**Detailed answer**:

1. `lyo pipeline run`:
   - Creates `runs/<run-id>/` directory
   - Writes `plan.json`, `spec.json`, `trace.json`, `verifier-report.json`, artifacts
   - **Does NOT call `recordRun()` or any database write**

2. `lyo pipeline learn`:
   - Reads trace files from `runs/<run-id>/`
   - Runs judge, produces `lyo-update.json` + lesson markdown
   - **Does NOT write to `learning_traces` or `outcomes` tables**

3. The only database writes come from:
   - `lyo claude-hook` (hook_events table) — working
   - `lyo run-start` (runs table) — but this is a separate command, not called by the pipeline

The hook_events in the work repos are from Claude's PostToolUse/PreToolUse hooks, not from pipeline execution. They record tool usage, not learning events.

---

## Concrete Next Steps

### Priority 1: Connect Pipeline to Database

`lyo pipeline run` should record:
- Run metadata to `runs` table
- Trace data to `learning_traces` table
- Verifier outcomes to `outcomes` table

This could be done by:
1. Adding a `--db` flag to pipeline commands
2. Or having `lyo init` configure a default database path that the pipeline auto-uses
3. Or piping the pipeline's return value through a recording function

### Priority 2: Investigate Why Work Repos Had No Pipeline Runs

The hook_events show tool usage (Bash, file edits) but no `lyo pipeline run` commands. Either:
- The pipeline was never run in those repos
- Or it was run but with a different mechanism that didn't trigger hooks

Check git history for `lyo pipeline` commands or `runs/` directories.

### Priority 3: Schema Alignment

The dogfood DB (old schema) and work repo DBs (new schema) have different table structures. Decide:
- Migrate dogfood data to new schema?
- Or keep them separate and use the new schema going forward?

### Priority 4: Implement §5.3 Counterfactual Credit

Once runs are being recorded with full decision data (candidate sets, propensities, null arms), implement the IPW/DR credit synthesis.

---

## Git Investigation: Why Pipeline Never Ran in Work Repos

### Crystalbrooks (`nectr_data_eng-crystalbrooks-env`)

- Recent commits are data engineering tasks (Market Meter ingestion, bronze/silver table writers, DAG wiring)
- No `plan.json`, `trace.json`, or `runs/` directory in git history
- No LYO pipeline artifacts anywhere in the repo
- `.agent-learning/learning.sqlite` exists with 2652 hook_events but zero runs

### Data Lake (`nectr-data-lake-rep-744`)

- Recent commits are SQL stored procedure fixes (REP-648 billing checks)
- No `plan.json`, `trace.json`, or `runs/` directory in git history
- No LYO pipeline artifacts anywhere in the repo
- `.agent-learning/learning.sqlite` exists with 1614 hook_events but zero runs

### Conclusion

**The pipeline was never run in either work repo.** The `.agent-learning/` directories and `learning.sqlite` files were created (likely by `lyo init` or hook installation), but no `lyo pipeline run` or `lyo pipeline learn` commands were ever executed there.

The hook_events in both repos are purely Claude Code hook traffic (PostToolUse, PreToolUse) — tool usage observations, not pipeline learning events.

---

## Files to Investigate

- `src/runner/run-pipeline.ts` — where to add database recording
- `src/cli/commands/pipeline.ts` — `pipelineRunCommand` currently ignores DB
- `src/lyo/trace-consumer.ts` — `consumeTraces` doesn't write to DB
- `lyo init` command — should it set up DB connection?
- Work repo git histories — did pipeline ever run?
