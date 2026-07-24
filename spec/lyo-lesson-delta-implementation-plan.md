# LYO Lesson-Delta — Implementation Plan

Status as of 2026-07-19: **draft code is on disk, unverified.**
Companion spec: `lyo-lesson-delta-design.md` (schema, counter rule, status rules).
Target repo: `/Users/marcus.kim/repositories/oss/zeroshot-lyo`, branch `lyo-integration`
(local only, not pushed). The sibling `/Users/marcus.kim/repositories/oss/zeroshot`
stays untouched as the upstream reference.

## 1. Current state (verified by inspection)

| File | State | Notes |
|---|---|---|
| `src/lyo/lesson-store.js` | Drafted, 690 lines, unverified | `LessonStore` class; ends cleanly with `module.exports`; includes replay fold (`replayLesson`). Tests never run. |
| `src/lyo/failure-classifier.js` | Drafted, 152 lines, unverified | Rule table → TRAIL taxonomy; exports `FAILURE_CLASSES`, `classifyValidationFailure`, `normalizeCue`. |
| `src/lyo/observer.js` | Extended, 294 lines (was 144), unverified | Detach closes only an owned store (checked tail). Middle sections not yet reviewed line-by-line. |
| `src/orchestrator.js` | One-line change, verified | Line 1698 now passes `storageDir: this.storageDir` into `attachLyoObserver`. |
| `tests/unit/lyo-lesson-store.test.js` | Drafted, 573 lines, unverified | Includes classifier + cue normalization tests at the tail. |
| `tests/unit/lyo-observer.test.js` | Extended, 378 lines (was 152), unverified | Includes degraded-mode test at the tail (warns `[lyo] lesson store unavailable`, guidance still published, `lessons: null`). |

Not yet confirmed: `git status` scope (Bash approvals were failing at check time — verify
first thing in Phase 0), zero test executions, eslint.

The architectural context this plugs into (verified earlier):

- Each run = one cluster; per-cluster ledger DB at `~/.zeroshot/<clusterId>.db`.
  Cross-run recall is impossible inside the run ledger → LYO owns a separate store file.
- LYO is enabled via `--lyo` → `cluster.config.lyo.enabled = true` →
  `attachLyoObserver({ messageBus, cluster, storageDir })` in
  `_registerClusterSubscriptions` (orchestrator.js:1697-1699).
- `VALIDATION_RESULT` carries `content.text`, `data.approved`, `data.errors[]`,
  `data.criteriaResults[]`. Guidance reaches agents through `USER_GUIDANCE_AGENT` /
  `USER_GUIDANCE_CLUSTER` mailbox topics.

## 2. Architecture recap

```
VALIDATION_RESULT (rejected)
  → failure-classifier: { failure_class, cue }            (keyword rules, TRAIL taxonomy)
  → LessonStore.createLesson (CREATE or EDIT-merge)        (actor: 'reflector')
  → LessonStore.selectLessons (Thompson over v_lesson_library, top 2)
  → LessonStore.recordApplication (UNIQUE per lesson+run+trigger_message)
  → USER_GUIDANCE_AGENT with "Lessons from past failures" section
next VALIDATION_RESULT
  → LYO_FEEDBACK (as before)
  → LessonStore.applyValidationOutcome                     (actor: 'validator-rule')
      MARK_HELPFUL / MARK_HARMFUL deltas → counters → Wilson status rules → maybeCurate
```

Invariants (from the design doc, non-negotiable): append-only `lesson_delta` log;
`lesson` table is a fold of the log; counters move **only** via validation outcomes
for lessons actually injected (a `lesson_application` row); LYO is the sole writer of
its own store; never re-summarize lesson content (ACE context-collapse rule).

## 3. Execution plan

### Phase 0 — Checkpoint the draft (~5 min)

1. `cd /Users/marcus.kim/repositories/oss/zeroshot-lyo && git status --short`
   — confirm the working tree touches **only** the six files in §1. If anything else
   changed, inspect before proceeding.
2. Back up before any fixes: `git diff > /tmp/lyo-draft.patch && git diff --cached >> /tmp/lyo-draft.patch`
   (untracked files: copy `src/lyo/lesson-store.js`, `src/lyo/failure-classifier.js`,
   `tests/unit/lyo-lesson-store.test.js` aside). Alternatively make a checkpoint commit
   on `lyo-integration` — but only if the user approves committing.

### Phase 1 — Verify the draft (~30–60 min, the real gate)

Commands (do **not** use `npm test` — its pretest runs a TypeScript build):

```bash
cd /Users/marcus.kim/repositories/oss/zeroshot-lyo
# 1. Targeted
node tests/run-tests.js tests/unit/lyo-observer.test.js tests/unit/lyo-lesson-store.test.js
# 2. Full unit suite (runner tolerates the known better-sqlite3 exit crash)
node tests/run-tests.js
# 3. Lint
npx eslint src/lyo/ tests/unit/lyo-lesson-store.test.js tests/unit/lyo-observer.test.js
```

If the full suite shows failures, establish the baseline first:

```bash
git stash && node tests/run-tests.js > /tmp/lyo-baseline.txt 2>&1; git stash pop
```

Only **new** failures versus baseline are ours to fix. Fix in place; re-run until green.
Bash approvals in this environment sometimes expire — retry the same command once or
twice rather than changing approach.

Likely bug hotspots to check first if tests fail:

- The gamma sampler for Thompson draws (Marsaglia–Tsang edge cases: shape < 1,
  counts of 0 → `Beta(1,1)` must come out uniform).
- Wilson interval arithmetic (z = 1.96, promotion lower > 0.5, quarantine upper < 0.45,
  both gated at n ≥ 8).
- better-sqlite3 transaction nesting (`createLesson` / `applyValidationOutcome` /
  `maybeCurate` each wrap multiple writes; `applyValidationOutcome` calls
  `maybeCurate` — check for nested-transaction misuse).
- Observer degraded mode: store creation failure must not break guidance publishing.

### Phase 2 — Spec-conformance review (~30 min)

Read `src/lyo/lesson-store.js` and `src/lyo/observer.js` in full against
`lyo-lesson-delta-design.md`. Checklist:

- [ ] DDL matches design §3: `lesson_delta` (append-only), `lesson`, `lesson_application`,
      indexes, `v_lesson_library` (active + candidate, posterior_mean).
- [ ] **Deviation 1 (documented, intended):** `lesson_application` has
      `trigger_message_id TEXT` and `UNIQUE(lesson_id, run_id, trigger_message_id)`
      instead of `UNIQUE(lesson_id, run_id)` — a Zeroshot run contains multiple
      validation cycles; the cycle is the grounded attribution unit. Confirm the code
      comment is present.
- [ ] **Deviation 2 (documented, intended):** promotion `candidate → active` updates the
      row without a delta (replay recomputes status per design §6); QUARANTINE / RETIRE /
      MERGE_INTO / REINSTATE are deltas. Confirm the code comment is present.
- [ ] `createLesson` merges on (failure_class, normalized trigger_cue) duplicates via
      EDIT delta; never creates a second lesson for the same cue.
- [ ] `selectLessons` reads the view filtered by failure_class, Thompson-samples with an
      injectable RNG, annotates `sampled_score`, returns top 2; candidate-status lessons
      are included (exploration).
- [ ] `applyValidationOutcome` implements design §5.1 exactly; **grounding invariant:
      a lesson with no `lesson_application` row never moves counters** (test exists).
- [ ] `maybeCurate`: watermark via `lyo_meta`, fires every ≥25 new MARK_* deltas; merge =
      exact normalized-cue duplicates only (counters add, provenance unions, source
      RETIRE); prune = candidates with uses=0 older than 30 days → RETIRE; **never
      touches explanation/intervention/trigger_cue text**.
- [ ] Observer keeps the original guidance prefix verbatim ("Address the validator
      feedback…"), appends the lessons section after it, adds `data.lessons` (or `null`
      in degraded mode), and the existing three tests pass unmodified.
- [ ] Store path resolution order: `config.lyo.storePath` → `ZEROSHOT_LYO_STORE_PATH` →
      `<cwd>/.zeroshot/lyo-lessons.db` → `<storageDir>/lyo-lessons.db`; parent dir
      created recursively; creation failure → degraded mode with one warning.
- [ ] Detach closes only self-created stores.

Record any further deviations found in §5 of this plan.

### Phase 3 — Dogfood on a real run (~1 hour)

Goal: watch one full lesson lifecycle end-to-end.

1. Pick a small task with a validator that fails at least once (or a mock validator
   that rejects round one). Run from a scratch project dir so the store lands in
   `<scratch>/.zeroshot/lyo-lessons.db`:
   `zeroshot run "<task>" --lyo` (add `--test-mode`/mock flags per repo conventions
   if a deterministic rejection is needed).
2. After the first rejection, inspect the store:

```sql
SELECT lesson_id, status, failure_class, trigger_cue, helpful_count, harmful_count
FROM lesson;
SELECT * FROM lesson_application;
SELECT delta_type, actor FROM lesson_delta ORDER BY delta_id;
```

3. After the next validation: counters moved exactly once per injected lesson;
   `counted = 1`; a `MARK_HELPFUL` or `MARK_HARMFUL` delta exists with the
   application_id in its payload.
4. Restart a similar run in the same project dir: the prior lesson appears in the
   injected guidance (cross-run recall works).
5. Success criteria: (a) run completes, (b) no LYO error blocks execution,
   (c) the lesson row survives process restarts, (d) second run's guidance contains
   the learned intervention.

### Phase 4 — Metrics + minimal observability (optional for v0.1)

Design §9 metrics are all SQL-able over the store today. Optionally add a
`zeroshot lyo` CLI subcommand later (list lessons, show counters, force a curator
pass, replay a lesson via `replayLesson`). Do not build it before Phase 3 confirms
the loop works.

### Phase 5 — Upstream decision (gated on explicit user approval)

- Option A: keep `lyo-integration` local on the fork.
- Option B: push `lyo-integration` to `origin` (github.com/the-open-engine/zeroshot)
  and open a PR. Requires user confirmation; use the GitHub MCP tools. Any PR
  description should state the two documented deviations and link the design doc.
- No pushes, no PRs without the user asking.

## 4. File-by-file spec (standalone, in case the draft is lost)

- **`src/lyo/lesson-store.js`** — `LessonStore(dbPath | ':memory:')`: `createLesson`,
  `selectLessons`, `recordApplication`, `applyValidationOutcome`, `applyStatusRules`,
  `maybeCurate`, `replayLesson`, `close`. WAL + synchronous NORMAL + 5s busy timeout.
  All multi-write ops in transactions. Beta draws via local Marsaglia–Tsang gamma
  sampler (no new dependencies).
- **`src/lyo/failure-classifier.js`** — `classifyValidationFailure(msg) → { failure_class, cue }`.
  Keyword rules over text + errors + criteriaResults → TRAIL classes
  (goal_deviation, tool_selection, context_handling, orchestration,
  output_generation, system_execution); default `output_generation`; cue = normalized
  first error/text line, ≤120 chars.
- **`src/lyo/observer.js`** — `attachLyoObserver({ messageBus, cluster, lessonStore, storageDir })`;
  no-op when `config.lyo.enabled !== true`; degraded mode (store = null) on store
  failure; detach closes only owned stores.
- **`src/orchestrator.js`** — one-line: pass `storageDir: this.storageDir`.
- **Tests** — `tests/unit/lyo-lesson-store.test.js` (store + classifier),
  `tests/unit/lyo-observer.test.js` (3 pre-existing tests unmodified + new
  lesson-lifecycle and degraded-mode tests).

## 5. Deviations register

| # | Deviation from design doc | Status |
|---|---|---|
| 1 | `UNIQUE(lesson_id, run_id, trigger_message_id)` replaces `UNIQUE(lesson_id, run_id)` — per-cycle attribution | Intended, documented in code |
| 2 | Promotion applied without a delta; replay recomputes it | Intended, documented in code |
| 3+ | Anything found in Phase 2 | Record here before fixing |

## 6. Open decisions (need the user, not the implementer)

1. **Store scope.** Current default: per-project `<cwd>/.zeroshot/lyo-lessons.db`
   (lessons stay with the codebase that produced them; no cross-project pollution).
   Alternative: global `~/.zeroshot/lyo-lessons.db` (transfer across projects for
   generic failure classes). Both are reachable via the resolution order; the default
   is the decision. Recommendation: keep per-project.
2. **Commit/PR strategy.** Checkpoint commit on `lyo-integration`? Push + PR to
   the-open-engine/zeroshot? Await explicit instruction.
3. **`--lyo` default.** Stays opt-in for v0.1. Revisit after dogfooding shows the
   loop is stable.
4. **Classifier quality.** Keyword rules are intentionally crude (design §8 defers
   the LLM Reflector). If dogfooding shows misclassification dominating, the fix is
   an LLM classify step — but counters stay validation-grounded regardless.

## 7. Risks

| Risk | Mitigation |
|---|---|
| Draft has latent bugs (never executed) | Phase 1 is the gate; do not dogfood before green. |
| Concurrent clusters in one process opening the same store file | WAL + busy timeout; better-sqlite3 allows multiple in-process connections. Watch for lock errors in Phase 3. |
| Memory pollution from bad lessons | Quarantine (never delete) + candidates need n ≥ 8 to promote; pollution-rate metric in §9 of the design doc. |
| Learning loop slows runs | No LLM calls added; all work is local SQLite. Curator runs only every 25 MARK_* deltas. |
| Test flakiness from better-sqlite3 exit crash | Already tolerated by `tests/run-tests.js`. |

## 8. Definition of done (v0.1)

- [ ] `git status` confirms scope limited to the six files.
- [ ] Targeted tests pass; full unit suite shows no new failures vs baseline; eslint clean.
- [ ] Phase 2 checklist fully checked; deviations recorded.
- [ ] Dogfood: one real rejection → lesson created → injected next cycle → counter moved
      exactly once → lesson recalled in a later run.
- [ ] User decision recorded on store scope and commit/PR strategy.

## 9. Deferred (v0.2+, from design §8 and §5.3)

Embedding retrieval (`sqlite-vec`) when cue-matching provably misses; LLM Reflector for
explanation extraction; Elo tournaments between competing explanations; counterfactual
lift gate (`lift = p(pass|with ℓ) − p(pass|without ℓ, same class)`) as a promotion
requirement; cross-lesson confounding (belief-propagation territory); lesson →
executable skill compilation.
