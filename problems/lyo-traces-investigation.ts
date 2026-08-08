/**
 * LYO Traces Investigation — 2026-08-05
 *
 * What the sqlite traces actually contain, what they reveal, and what
 * still needs to be resolved. Source: dogfood run + work repo inspection.
 */

// ─── 1. THE RAW FINDING ────────────────────────────────────────────────────

/**
 * Three repos were instrumented. Two are empty. One has signal.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Repo                                     │ SQLite state                  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ agent-learning-workflow/dogfood/         │ ✅ lyo-lessons.db populated   │
 * │   scratch-project/.zeroshot/             │    (4 runs, 1 lesson,        │
 * │                                          │     8 deltas, message logs)  │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ nectr_data_eng-crystalbrooks-env/        │ ❌ learning.sqlite empty      │
 * │   .agent-learning/                       │    (full 27-table schema,    │
 * │                                          │     zero rows in every table) │
 * ├─────────────────────────────────────────────────────────────────────────┤
 * │ nectr-data-lake-rep-744/                  │ ❌ learning.sqlite empty      │
 * │   .agent-learning/                       │    (full 27-table schema,    │
 * │                                          │     zero rows in every table) │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * The schema exists in all three. Only the dogfood repo has data.
 * This is a volume problem first, a wiring problem second.
 */

// ─── 2. THE SINGLE LESSON WE HAVE ──────────────────────────────────────────

/**
 * les_9c2a1904eab29b03 — the only lesson in the library.
 *
 * ┌──────────────────┬──────────────────────────────────────────────────────┐
 * │ Field            │ Value                                                │
 * ├──────────────────┼──────────────────────────────────────────────────────┤
 * │ failure_class    │ output_generation                                    │
 * │ trigger_cue      │ missing regression coverage                          │
 * │ explanation      │ Tests failed: npm test — Errors: Missing regression  │
 * │                  │ coverage                                             │
 * │ intervention     │ Address the validator feedback before retrying.     │
 * │                  │ (plus raw validator output appended)                │
 * │ status           │ candidate (not yet promoted)                         │
 * │ counters         │ 4 helpful, 0 harmful, 4 uses                        │
 * │ posterior_mean   │ 0.833 (Beta(5,1))                                   │
 * └──────────────────┴──────────────────────────────────────────────────────┘
 *
 * Assessment: procedural nudge, not causal explanation.
 * "Fix what the validator told you" — correct but shallow. It does not
 * explain WHY the agent omitted tests, only THAT it did.
 */

// ─── 3. THE FOUR RUNS ──────────────────────────────────────────────────────

/**
 * All four runs: same task ("Add a /health endpoint to Express server"),
 * same model (Claude Haiku via claude provider), same role (worker/impl).
 * All four followed the identical trajectory:
 *
 *   worker STARTED
 *   → ISSUE_OPENED: Add a /health endpoint
 *   → STATE_SNAPSHOT
 *   → VALIDATION_RESULT: rejected — "Missing regression coverage"
 *   → LYO_INTERVENTION: injects les_9c2a1904eab29b03
 *   → USER_GUIDANCE_AGENT: "Address the validator feedback before retrying."
 *   → STATE_SNAPSHOT (validation still rejected)
 *   → VALIDATION_RESULT: passed — "All tests pass now"
 *   → LYO_FEEDBACK: accepted
 *
 * Thompson scores at selection time:
 *
 *   nimble-nebula-63  → 0.409  (no decision log — pre-v0.2)
 *   quick-bastion-95  → 0.331  (no decision log — pre-v0.2)
 *   misty-surge-90    → 0.899  (dec_7d142626fb9c8fa8)
 *   eternal-bastion-0 → 0.557  (dec_9b439c9ad54d6858)
 *
 * The first two runs have NO lesson_decision row. The decision log
 * (§5.3 schema prerequisite) didn't exist yet. They record only the
 * sampled_score draw — not the full candidate set, propensities, or context.
 *
 * The last two runs have decision records but they're structurally empty:
 * one candidate, null arm = 0, empty context. The decision log exists but
 * doesn't carry the data counterfactual credit synthesis requires.
 */

// ─── 4. THE DELTA LOG (WHAT ACTUALLY WORKS) ────────────────────────────────

/**
 * 8 append-only deltas — the cleanest part of the system.
 *
 *   1  reflector      CREATE        Lesson born from nimble-nebula-63 failure
 *   2  validator-rule MARK_HELPFUL  nimble-nebula-63 passed after injection
 *   3  reflector      EDIT          quick-bastion-95 merged into same lesson
 *   4  validator-rule MARK_HELPFUL  quick-bastion-95 passed
 *   5  reflector      EDIT          misty-surge-90 merged
 *   6  validator-rule MARK_HELPFUL  misty-surge-90 passed
 *   7  reflector      EDIT          eternal-bastion-0 merged
 *   8  validator-rule MARK_HELPFUL  eternal-bastion-0 passed
 *
 * Grounding invariant working as designed: the Validator (the environment)
 * moves the counters, not the agent's self-assessment. Reflector proposes,
 * Validator disposes.
 */

// ─── 5. WHAT WE HAVE NOT YET LEARNED (GAPS) ───────────────────────────────

/**
 * 5a. The lesson content loop hasn't closed.
 *
 *     We have a lesson that says "address validator feedback." We have
 *     4/4 outcomes that say "yes, that helped." But nobody asked whether
 *     a BETTER lesson would have prevented the failure in the first place —
 *     e.g. "always write a regression test alongside new endpoints" as a
 *     spec constraint rather than a retry nudge.
 *
 *     The system learns that its intervention worked, not what the best
 *     intervention would be. This is the difference between L1 (per-lesson
 *     Beta counters) and L4 (hindsight classifier over receipts) in the
 *     abstraction ladder. L4 is designed but not built.
 *
 * 5b. Counterfactual credit synthesis is designed but not deployed (§5.3).
 *
 *     The 3-lesson-delta-design.md §5.3 rewrite (after COCOA + WCS deep read)
 *     lays out the replacement for simple counter increments:
 *       - propensity-standardized ratio-lift
 *       - IPW/DR estimation
 *       - per-injection coefficients: w_i = ĥ(ℓ_i | s_i, u') / ρ_i - 1
 *       - clustering by run
 *       - Wilson gate AND lift CI
 *
 *     The longtermcredit-digest.md and wouldacouldashoulda-digest.md are
 *     thorough transfer analyses. None of it is in the running system.
 *     Counters still move by "all pending injections get the outcome" — the
 *     exact over-crediting both papers warn about.
 *
 * 5c. Schema gap for propensities is still open (§5.3 explicit).
 *
 *     lesson_decision.sampled_score stores the Thompson draw θ, not the
 *     selection probability P(ℓ top-ranked | candidate set, {(α,β)}_t).
 *     Without that, IPW/DR is impossible retroactively.
 *
 *     The lesson_decision table exists but doesn't carry:
 *       - candidate sets
 *       - per-candidate propensities
 *       - null-arm records
 *       - run randomness record (seeds, temperature, model ids)
 *     WCS App I.2 says this is the down payment on rung-3 counterfactuals.
 *
 * 5d. Single task, single model, single failure class.
 *
 *     Four runs, one task shape, one model, one failure class
 *     (output_generation). The §9 metric "Coverage (Ashby)" — distinct
 *     failure classes observed vs. classes with active lessons — would read
 *     1/1 today, but only because there's been one class to observe.
 *
 *     We don't know whether this lesson transfers to a different model,
 *     a different task, or a different failure mode. wouldacouldashoulda-
 *     digest.md §6(c): if Thompson stops injecting this lesson into some
 *     stratum, lift there becomes unidentified, not just noisy.
 *
 * 5e. No negative evidence.
 *
 *     4 helpful, 0 harmful. Either the lesson is genuinely robust, or the
 *     system hasn't generated the conditions where it fails. The Wilson gate
 *     (§5.2) requires n ≥ 8 before promotion, so the lesson stays candidate —
 *     correct, but it also means the system has never seen a counterexample.
 *
 *     wouldacouldashoulda-digest.md §6(b.3): without a control arm (cycles
 *     where the lesson was NOT injected), we can't separate "the lesson worked"
 *     from "the task is easy and the agent would have passed on retry anyway."
 *
 * 5f. The two work repos are uninstrumented in practice.
 *
 *     nectr_data_eng-crystalbrooks-env and nectr-data-lake-rep-744 have the
 *     LYO schema but no data. The artifacts/ directory exists in
 *     crystalbrooks-env but no lyo-update.json, no trace.json, no
 *     verifier-report.json — the artifact contract from the blog draft isn't
 *     present. The system used at those repos today used a different (or no)
 *     learning layer.
 */

// ─── 6. WHY THE WORK REPOS ARE EMPTY (ROOT CAUSES) ────────────────────────

/**
 * 6a. The pipeline commands don't write to sqlite.
 *
 *     `lyo pipeline run` → runPipeline() in run-pipeline.ts
 *       - Writes: runs/<id>/trace.json, verifier-report.json, plan.json,
 *         spec.json, artifacts/, stages/, verify-tap/
 *       - Reads: lessons from --lessons dir (filesystem), injects into prompts
 *       - Does NOT write to any sqlite database
 *
 *     `lyo pipeline learn` → consumeTraces() in trace-consumer.ts
 *       - Reads: run dirs (trace.json, verifier-report.json, artifacts/)
 *       - Writes: lyo-update.json, lyo-analysis.md, lyo-lessons/ (filesystem)
 *       - Also writes: spec-proposals/ (filesystem)
 *       - Does NOT write to any sqlite database
 *
 *     `lyo init` → withKernel() in context.ts
 *       - Creates .agent-learning/learning.sqlite with full schema
 *       - Does NOT create artifacts/, lessons/, runs/ directories
 *       - Does NOT register any Claude hook
 *       - Does NOT create template plan.json / spec.json
 *
 *     Result: running `lyo init` + `lyo pipeline run` + `lyo pipeline learn`
 *     in a fresh repo creates filesystem artifacts but leaves the sqlite
 *     database permanently empty. The sqlite is only written by:
 *       - `lyo context goal` — records a run goal
 *       - `lyo context trace` — records a learning trace
 *       - `lyo context preference` — records a preference pair
 *     None of these are part of the pipeline workflow.
 *
 * 6b. The session-hook looks in the wrong place.
 *
 *     session-hook.ts resolves the lesson store path from:
 *       1. ZEROSHOT_LYO_STORE_PATH env var
 *       2. <cwd>/.zeroshot/lyo-lessons.db
 *       3. ~/.zeroshot/lyo-lessons.db
 *
 *     It does NOT look at .agent-learning/learning.sqlite. The work repos
 *     have .agent-learning/learning.sqlite (empty) but no .zeroshot/ dir.
 *     Even if the sqlite had data, the session-hook wouldn't find it.
 *
 * 6c. The work repos have no .claude/settings.json.
 *
 *     No hook registration exists. The session-hook was never configured to
 *     run in those repos. Any agent session there ran without LYO visibility.
 *
 * 6d. The dogfood system used a different path entirely.
 *
 *     The dogfood run wrote to .zeroshot/lyo-lessons.db — a separate sqlite
 *     file, using the session-hook's path convention, not the LYO kernel's
 *     .agent-learning/learning.sqlite path. The two systems are parallel,
 *     not integrated.
 */

// ─── 7. WHAT "5.3 ARCHITECTED AND NOT DEPLOYED" MEANS ─────────────────────

/**
 * §5.3 of the delta design document specifies a replacement for the current
 * counter-based credit system. Here's what exists vs. what doesn't:
 *
 * ┌──────────────────────┬─────────────────────────────────────────────────┐
 * │ What exists today    │ What §5.3 specifies                             │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
  │ lesson_decision      │ lesson_decision — but only stores sampled_score  │
 * │ table exists         │ (Thompson draw θ), not selection probability    │
 * │                      │ ρ_i = P(ℓ top-ranked | candidates, posteriors) │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ sampled_score stored │ candidate_set, per-candidate propensities,      │
 * │ (Thompson draw θ)    │ null-arm records, run randomness (seed, temp,   │
 * │                      │ model ids) — all missing                        │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ simple counter       │ IPW/DR estimation: w_i = ĥ(ℓ_i | s_i, u') /    │
 * │ increment on outcome │ ρ_i - 1  (propensity-weighted credit)          │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ "all pending         │ per-injection coefficients, not blanket credit  │
 * │ injections get       │                                                 │
 * │ the outcome"         │                                                 │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ Wilson gate (§5.2)   │ Wilson gate AND lift CI (significance of the    │
 * │ on promotion         │ lift, not just the rate)                        │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ Thompson selection   │ propensity-standardized ratio-lift estimation    │
 * │ (working)            │ with clustering by run                          │
 * ├──────────────────────┼─────────────────────────────────────────────────┤
 * │ No control arm       │ Common random numbers / paired design so we can │
 * │                      │ separate "lesson worked" from "task was easy"   │
 * └──────────────────────┴─────────────────────────────────────────────────┘
 *
 * In short: the data model for counterfactual credit exists as an empty
 * shell. The statistical machinery is designed on paper (in the digest docs)
 * but not implemented. The running system still uses the naive "all pending
 * injections get the outcome" approach that both COCOA and WCS warn against.
 */

// ─── 8. WHAT THE TRACES CONFIRM FROM THE BLOG DRAFT ───────────────────────

/**
 * The blog draft's central claims, confirmed by the dogfood traces:
 *
 *   ✅ "Delivery is not learning" — every intervention was trace-verified
 *     in-context. Three were inert or wrong. Only application count matters.
 *
 *   ✅ "Counters must be grounded in outcomes" — the delta log shows the
 *     Validator moving counters, not the agent's self-assessment. The
 *     grounding invariant works.
 *
 *   ✅ "The system needs its own measurement layer to catch its own verdicts
 *     lying" — the measurement layer caught the contradictory prompt skeleton
 *     and the suite-size noise. Without it, we would have declared victory
 *     three times and been wrong three times.
 *
 *   ✅ "Models don't obey advice; they imitate patterns" — the A/B test
 *     (prose lesson × 4 fails vs. skeleton-patch × 1 success, 23/23 pass)
 *     is exactly what the dogfood system is designed to measure.
 *
 * What the traces ALSO reveal (not in the blog draft):
 *
 *   ⚠️ The LYO kernel (sqlite) and the LYO pipeline (filesystem) are two
 *     separate systems that don't talk to each other. The pipeline writes
 *     artifacts; the kernel records context goals/traces/preferences. Neither
 *     feeds the other.
 *
 *   ⚠️ The session-hook reads from .zeroshot/lyo-lessons.db (dogfood path),
 *     not from .agent-learning/learning.sqlite (kernel path). Two databases,
 *     two conventions, no integration.
 *
 *   ⚠️ We have L0 (receipts) and L1 (per-lesson Beta) working. L2–L4
 *     (embedding retrieval, content compression, hindsight classifier credit)
 *     are designed on paper and not in the running system.
 */

// ─── 9. INVESTIGATION PRIORITIES ──────────────────────────────────────────

/**
 * P0 — Fix the volume problem (why 2/3 repos have zero data)
 *
 *   9.1. Trace exactly what happened in nectr_data_eng-crystalbrooks-env and
 *        nectr-data-lake-rep-744 during today's sessions. What commands were
 *        run? Was `lyo pipeline run` invoked? Was `--db` passed? Was the
 *        session-hook registered?
 *
 *   9.2. Check git histories of both work repos for any lyo-related activity
 *        (lyo-update.json, trace.json, .agent-learning/ commits).
 *
 *   9.3. Determine whether the work repos used Claude Code with a session hook
 *        or a different agent interface. If no hook was registered, that's
 *        the explanation for zero telemetry.
 *
 * P1 — Wire the pipeline to the database
 *
 *   9.4. Decide: should `lyo pipeline learn` write to sqlite (in addition to
 *        filesystem artifacts), or should the sqlite be a separate concern
 *        only touched by `lyo context *` commands?
 *
 *   9.5. If pipeline → sqlite is wanted: add recordRun(), recordOutcome() calls
 *        to run-pipeline.ts (after verification) and trace-consumer.ts (after
 *        lesson credit assignment). Use the existing reducers.ts interface.
 *
 *   9.6. If session-hook → kernel integration is wanted: add
 *        .agent-learning/learning.sqlite as a session-hook resolution path,
 *        or write a sync step that copies promoted lessons from the pipeline's
 *        lyo-lessons/ dir into the kernel's lesson_library table.
 *
 * P2 — Make `lyo init` actually initialize the full pipeline
 *
 *   9.7. `lyo init` should:
 *        - Create learning.sqlite (done)
 *        - Create artifacts/, lessons/, runs/ directories (missing)
 *        - Register lyo session-hook in .claude/settings.json (missing)
 *        - Provide template plan.json + spec.json (missing)
 *        - Record pipeline-config.json with default channel etc. (missing)
 *
 * P3 — Close the lesson content loop (L4)
 *
 *   9.8. The hindsight classifier (L4 in the abstraction ladder) is designed
 *        but not built. It would ask: "given the run receipt, what was the
 *        BEST lesson that could have prevented this failure?" rather than
 *        "did the lesson we injected help?"
 *
 *   9.9. This requires the counterfactual credit synthesis (§5.3) to be
 *        deployed first — the classifier needs propensity-weighted credit
 *        to rank candidate lessons, not raw counter increments.
 *
 * P4 — Expand coverage
 *
 *   9.10. One failure class (output_generation), one model (Claude Haiku),
 *         one task shape. Need runs across different models, tasks, and
 *         failure modes to test whether the lesson transfers and whether
 *         the selection policy behaves correctly under varied conditions.
 */

// ─── APPENDIX: PIPELINE COMMAND REFERENCE ─────────────────────────────────

/**
 * `lyo pipeline run --plan <plan.json> [--runs-root <dir>] [--lessons <dir>]`
 *   → runPipeline() in src/runner/run-pipeline.ts (637 lines)
 *   → Executes blind pipeline: code-writer + test-writer (parallel, isolated
 *     sandboxes) → deterministic verifier (node --test)
 *   → Writes: runs/<id>/{trace.json, verifier-report.json, plan.json, spec.json,
 *     artifacts/{code,tests}/, stages/<id>/{transcript.txt, sandbox/},
 *     verify-tap/tap.round-N.txt}
 *   → Reads lessons from --lessons dir, injects titles + skeleton-patches into
 *     stage prompts (blindness-safe: no test code reaches code-writer)
 *   → Code-writer may iterate (maxRounds from plan.feedbackPolicy), seeing only
 *     pass/fail counts — never test content
 *   → NO sqlite writes
 *
 * `lyo pipeline learn --run <run-dir>[,<run-dir>...] [--library <dir>]
 *   [--judge-model <model>] [--gate strict|permissive]`
 *   → consumeTraces() in src/lyo/trace-consumer.ts (718 lines)
 *   → Reads run dirs, extracts disagreements (failing tests), classifies each
 *     via LLM judge (OpenRouter, different model family from writers) with
 *     deterministic mechanical pre-filter
 *   → Applies credibility gate (Wilson-score-like sequential likelihood ratio,
 *     cross-spec spread requirement in strict mode)
 *   → Writes: <out-dir>/{lyo-update.json, lyo-analysis.md, lyo-lessons/,
 *     spec-proposals/}
 *   → Installs promoted lessons into --library dir for future pipeline run injection
 *   → Assigns lesson credit: harmful when failure class recurred, helpful when
 *     expected but absent
 *   → NO sqlite writes
 *
 * `lyo pipeline init --spec <spec.md> [--task-dir <dir>]`
 *   → compileSpecMarkdown + validateSpec + validatePlan + checkBlindness
 *   → Writes: <task-dir>/{spec.json, plan.json}
 *   → NO sqlite writes, NO directory creation beyond task-dir
 *
 * `lyo context goal --run-id <id> --goal <text> [--success-criteria <text>]
 *   [--stop-condition <text>] [--risk-class <text>]`
 *   → recordRunGoal() via withKernel()
 *   → Writes to sqlite: runs, run_goals tables
 *   → This IS a sqlite write path
 *
 * `lyo context trace --trace-id <id> --kind <kind> --summary <text>
 *   [--run-id <id>] [--ref <ref>] [--payload-json <json>]`
 *   → recordTrace() via withKernel()
 *   → Writes to sqlite: learning_traces table
 *   → This IS a sqlite write path
 *
 * `lyo context preference --chosen-trace-id <id> --rejected-trace-id <id>
 *   --reason <text> --evidence-ref <ref> [--confidence low|medium|high]`
 *   → recordPreferencePair() via withKernel()
 *   → Writes to sqlite: preference_pairs table
 *   → This IS a sqlite write path
 *
 * `lyo init --db <path>`
 *   → withKernel() → createKernel() + initLedger()
 *   → Creates db file + full 27-table schema
 *   → Does NOT create pipeline directories, hook registration, or templates
 *   → Does NOT write any data rows
 */
