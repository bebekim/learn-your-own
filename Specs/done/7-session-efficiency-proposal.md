> Historical proposal, withdrawn. Preserved from the author's local draft on
> 2026-09-11. The original text below is not the implemented contract: session
> brevity and co-delivered banners cannot establish lesson benefit. Use
> [Spec 7](../7-session-telemetry-lesson-bridge.md) and
> [Spec 8](../8-learning-evidence-loop.md). No runtime should implement this credit rule.

# Session Telemetry → Lesson Bridge — Design

Date: 2026-08-18. State: approved design, pre-plan.

## Problem

The lesson library (`~/.zeroshot/lyo-lessons.db`, the store the session banner
reads) is only written by Zeroshot cluster runs. The last cluster run was
2026-07-23, so the library has been frozen at 2 unvalidated `candidate` lessons
(0✓/0✗) for a month, and every session prints an identical banner.

Daily agent usage flows through **native hooks** into the new telemetry system
(`.agent-learning/learning.sqlite`), but nothing connects that system to lesson
creation or outcome validation. The two systems are separate by design
(`issues/lyo-telemetry-v1-source-boundary.md`, audit in
`problems/2026-08-05-lyo-trace-audit.md`) — the separation is at the *source*
boundary, and this design does not cross it: the bridge reads post-boundary
normalized tables, so it is learning-mechanism code, not new telemetry
collection.

## Goal

Daily usage feeds the lesson loop automatically:

1. **Create**: failures observed in a session become lesson candidates.
2. **Validate**: sessions with banner-delivered lessons get compared against
   sessions without them (stratified efficiency), moving helpful/harmful
   counters.

Non-goals: LLM reflection in the hot path (no explanation/intervention
generation), migrating the lesson store into `learning.sqlite`, changing the
Shepherd consume path, cluster-run behavior.

## Decisions (from brainstorming)

- Scope: create + validate.
- Trigger: automatic on native `SessionEnd`; no LLM, cheap, fail-open.
- Outcome: stratified efficiency — wall-clock + prompt count + token cost per
  session, compared within strata of similar sessions, so sessions with
  different injections can later be compared against each other.
- Daily telemetry source: native hooks. The bridge logic itself is
  source-agnostic (reads post-boundary tables); wiring the Shepherd consume
  path to the same trigger is a future option, not v1.

## Architecture

New module `src/lyo/bridge/session-bridge.ts` with three exported functions
plus a CLI replay command. No schema changes to either database; everything
uses existing `LessonStore` APIs.

```
native SessionEnd hook
  → handleClaudeHook (src/hooks/runtime.ts:149)
    → maybeNormalizeHookEvent        (existing)
    → bridgeSessionOnEnd(kernel, sessionId)   (NEW, fail-open)
        ├─ createLessonsFromSessionFailures(kernel, store, sessionId)
        └─ validateSessionApplications(kernel, store, sessionId)

banner print (UserPromptSubmit, session-hook.ts)
  → recordBannerDeliveries(store, sessionId, lessons)   (NEW, fail-open)
```

The lesson store path is resolved with the exact same resolution order the
banner uses (`ZEROSHOT_LYO_STORE_PATH` → `<cwd>/.zeroshot/lyo-lessons.db` →
`~/.zeroshot/lyo-lessons.db`), factored out of
`src/lyo/selection/session-hook.ts:41` so banner and bridge can never
disagree about which store is canonical.

## Components

### 1. Delivery recording (banner side)

When `emitSessionLessons` prints the banner, it re-opens the resolved store
read-write and calls `LessonStore.recordApplication`
(`src/lyo/storage/lesson-store.ts:681`) for each shown lesson:

- `lesson_id`: shown lesson
- `run_id`: the agent session id (reuses the run-scoped uniqueness of
  `lesson_application`; `INSERT OR IGNORE` makes repeat prints idempotent)
- `sampled_score`: posterior mean at print time
- `decision_id`: null (banner delivery is deterministic, no bandit decision)

Write failure never suppresses or alters the banner. The once-per-session
marker logic is unchanged; deliveries are recorded only when the banner
actually prints.

### 2. Creation: failures → candidate lessons

`createLessonsFromSessionFailures(kernel, store, sessionId)`:

1. Query the session's `hook_events` for failure events
   (`PostToolUseFailure`, and PostToolUse results classified as failed).
2. Extract error text with the same fact extraction the normalizer uses
   (`src/hooks/normalizer.ts`), classify with `classifyFailure`
   (`src/hooks/exercise.ts:148`) categories mapped onto the six Lyo failure
   classes:

   | telemetry signal | failure class |
   |---|---|
   | command_not_found (127) | system_execution |
   | timeout (124) | system_execution |
   | segfault (139) | system_execution |
   | compile_error | output_generation |
   | test_failure | output_generation |
   | assertion_failure | output_generation |
   | unknown_failure | output_generation |

3. `trigger_cue` = first error line, passed through `normalizeCue()`.
4. `store.createLesson({ failure_class, trigger_cue, explanation: '',
   intervention: '', run_id: sessionId, actor: 'telemetry-bridge' })`.
   Recurrence across sessions merges as EDIT deltas via the existing
   cue-normalized merge — no duplicate lessons.
5. Cap: at most 3 creations per session, so one catastrophic session cannot
   flood the library.

Explanation and intervention stay empty by design (no LLM in the hot path);
a reflector pass or manual curation fills them later.

### 3. Validation: stratified efficiency

`validateSessionApplications(kernel, store, sessionId)`:

1. Load the session's uncounted applications
   (`lesson_application WHERE run_id = sessionId AND counted = 0`).
2. Compute the session efficiency score from the new system:
   - wall-clock: `agent_sessions.ended_at − started_at`
   - prompt count: `session_prompts` count
   - token cost: `SUM(model_calls.total_tokens)` / `SUM(estimated_cost)`
3. Stratum = `agent_sessions.repo_path` (project). Require ≥5 completed
   sessions in the stratum (echoes `MIN_STRATUM_DECISIONS`); below that,
   leave applications `pending` — they become eligible as data accumulates.
4. Combined score: z-score each of the three metrics over all completed
   sessions in the stratum, then average with equal weights; lower is
   better. Wall-clock is primary when the others are missing (sessions
   without model_calls rows fall back to duration + prompt count; a
   session with neither is skipped).
5. Baseline = stratum sessions with **zero** recorded banner deliveries.
   If the session's combined score is better than the baseline median →
   `store.applyValidationOutcome({ run_id: sessionId, outcome: 'passed' })`,
   else `'failed'`.

Note: `applyValidationOutcome` applies one outcome to **all** of the
session's pending applications uniformly. When the banner co-delivers
several lessons they share the credit — the same over-crediting limitation
documented for the cluster path. Per-lesson decomposition requires a
stochastic logging policy with propensities, which the deterministic
banner does not have; out of scope for v1.

`applyValidationOutcome` moves fractional counters via ratio-lift
(`src/lyo/credit/ratio-lift.ts`); because banner delivery logs no
`decision_id`, every application takes the documented uniform fallback
(weight ±1). That is expected: identification via propensity requires a
stochastic logging policy, which the banner is not. The experimental
contrast lives in the stratified outcome choice, not in per-injection
weights.

### 4. Banner filter

`renderSessionLessons` skips rows with empty `intervention`, so auto-created
candidates never render as empty bullets. One-line filter plus test.

### 5. Replay CLI

`lyo bridge --db <learning.sqlite> [--session <id> | --all]` runs
`bridgeSessionOnEnd` logic over historical sessions. Idempotent (creation
merges by cue; `counted` flag prevents double-validation). Used for
backfill and for testing the bridge against real historical data without
touching the live hook path.

## Error handling

- Every bridge entry point is wrapped: errors are caught and swallowed
  (fail-open, same contract as the rest of the hook layer). Nothing the
  bridge does can block or alter a hook response.
- All queries are indexed by `session_id`; the SessionEnd hook has a 10s
  timeout and the bridge does a handful of indexed SELECTs plus a few
  sqlite writes — well under budget.
- If the lesson store is missing or unreadable, validation and creation
  no-op (the bridge creates nothing; `LessonStore` would create a fresh DB
  only when the resolved path's parent exists — mirror the banner's
  statSync check first and bail if absent).

## Testing

Unit tests over temp DBs for both stores:

- delivery recording: banner print records applications; repeat print does
  not duplicate
- creation: failure events → lesson with mapped failure_class and
  normalized cue; second session with same cue produces EDIT delta, not a
  new lesson; 3-per-session cap enforced
- validation: <5 stratum sessions → pending; ≥5 → outcome applied and
  counters move; missing model_calls → duration/prompt-count fallback
- banner filter: empty-intervention lessons excluded from rendered text
- replay CLI: fixture `learning.sqlite` → expected lessons and outcomes,
  second run is a no-op

Run `npm test` + `npm run typecheck` as the merge gate (per AGENTS.md).
