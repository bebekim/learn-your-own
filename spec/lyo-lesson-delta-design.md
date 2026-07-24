# LYO Lesson-Delta Design (v0.1)

Design doc for LYO's durable lesson library on top of Zeroshot's SQLite ledger.
Companion documents: `lyo-learning-layer-literature.md` (motivation, Appendix A for
why monolithic rewrites are forbidden).

**Scope.** Specifies: (1) the lesson-delta schema, (2) the materialized-view query
that serves lessons to runs, (3) the validation-grounded counter update rule.
Defers: explanation-extraction prompts, embedding/semantic retrieval, hypothesis
tournaments, curation prompts (see §8). v0.2 design direction: §10 (abstraction
ladder), §11 (lesson mempool — broadcast and addressing); §5.3 revised after the
WCS/COCOA deep read (`lyo-counterfactual-credit-synthesis.md`).

## 1. Architecture invariants

1. **Append-only deltas.** All learning state changes are rows in `lesson_delta`.
   Nothing is rewritten in place at the event level. (DPI argument, literature review
   Appendix A: state survives only if it never passes through an LLM re-encoding.)
2. **The library is a view, not a document.** The "playbook" injected into runs is a
   SQL query over `lesson` + selection sampling. It can be rebuilt from
   `lesson_delta` at any point in time (replay).
3. **Counters are grounded in validation outcomes, never in model self-assessment.**
   The Generator/Reflector may *propose*; only `VALIDATION_RESULT` may *count*.
4. **Single writer.** LYO is the only writer of `lesson_delta`, `lesson`, and
   `lesson_application`. Zeroshot writes its own run ledger and reads LYO's view.
5. **Lessons are causal objects.** A lesson is not a tip; it is
   `(failure_class, explanation, intervention, counters, provenance)`.

## 2. Event mapping (message bus → deltas)

| Bus event | LYO role | Delta emitted |
|---|---|---|
| `VALIDATION_RESULT` (rejected) | Reflector: classify failure, abduce explanation | `CREATE` (new candidate) or `EDIT` (merge into similar lesson) |
| `LYO_INTERVENTION` issued | — | row in `lesson_application` (not a delta) |
| next `VALIDATION_RESULT` for that run | Validator rule (§5) | `MARK_HELPFUL` / `MARK_HARMFUL` |
| periodic curation (every N runs or size threshold) | Curator | `MERGE_INTO`, `QUARANTINE`, `REINSTATE` |

## 3. Schema (SQLite DDL)

```sql
-- Append-only event log. Writer: LYO only.
CREATE TABLE lesson_delta (
  delta_id    INTEGER PRIMARY KEY AUTOINCREMENT,
  lesson_id   TEXT NOT NULL,              -- lesson this delta mutates
  run_id      TEXT,                       -- provenance run; NULL for curator passes
  ts          TEXT NOT NULL DEFAULT (datetime('now')),
  actor       TEXT NOT NULL,              -- 'reflector' | 'validator-rule' | 'curator'
  delta_type  TEXT NOT NULL,              -- CREATE | EDIT | MARK_HELPFUL | MARK_HARMFUL
                                          -- MERGE_INTO | QUARANTINE | REINSTATE | RETIRE
  payload     TEXT NOT NULL               -- JSON. CREATE/EDIT: content fields.
                                          -- MARK_*: {application_id, outcome}.
                                          -- MERGE_INTO: {target_lesson_id}.
);

-- Current lesson state (folded from deltas; updatable in place, but only by LYO
-- applying deltas — the delta log remains the source of truth).
CREATE TABLE lesson (
  lesson_id     TEXT PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'candidate',  -- candidate | active | quarantined | retired
  failure_class TEXT NOT NULL,          -- taxonomy label (seed from TRAIL: goal_deviation,
                                        -- tool_selection, context_handling, orchestration,
                                        -- output_generation, system_execution, …)
  trigger_cue   TEXT NOT NULL,          -- short text matched at retrieval time
  explanation   TEXT NOT NULL,          -- abduced cause of the failure (regulator's model entry)
  intervention  TEXT NOT NULL,          -- guidance spec injected via USER_GUIDANCE_AGENT
  helpful_count INTEGER NOT NULL DEFAULT 0,
  harmful_count INTEGER NOT NULL DEFAULT 0,
  uses          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  provenance    TEXT NOT NULL DEFAULT '[]'      -- JSON array of run_ids
);

-- One row per (lesson, run) injection. The attribution join table: without it,
-- counters cannot be grounded.
CREATE TABLE lesson_application (
  application_id TEXT PRIMARY KEY,
  lesson_id      TEXT NOT NULL REFERENCES lesson(lesson_id),
  run_id         TEXT NOT NULL,
  task_cue       TEXT,                  -- what matched at retrieval time
  sampled_score  REAL,                  -- the Thompson draw that selected it (audit)
  outcome        TEXT NOT NULL DEFAULT 'pending',  -- pending | passed | failed
  counted        INTEGER NOT NULL DEFAULT 0,       -- 1 once folded into counters
  UNIQUE(lesson_id, run_id)
);

CREATE INDEX idx_delta_lesson ON lesson_delta(lesson_id, delta_id);
CREATE INDEX idx_app_run      ON lesson_application(run_id, counted);
CREATE INDEX idx_lesson_class ON lesson(failure_class, status);
```

## 4. Materialized view: serving lessons to runs

### 4.1 The library view

```sql
CREATE VIEW v_lesson_library AS
SELECT
  lesson_id, failure_class, trigger_cue, explanation, intervention,
  helpful_count, harmful_count, uses,
  CAST(helpful_count + 1 AS REAL) / (helpful_count + harmful_count + 2) AS posterior_mean
FROM lesson
WHERE status IN ('active', 'candidate');   -- candidates stay retrievable for exploration
```

### 4.2 Retrieval + selection (run time)

1. On `VALIDATION_RESULT` rejected, classify the failure → `failure_class` $c$.
2. Candidate set: rows of `v_lesson_library` where `failure_class = c`, plus a small
   number of near matches on `trigger_cue` (string similarity for now; embeddings are
   §8).
3. Select by **Thompson sampling** — for each candidate lesson $\ell$, draw

$$\theta_\ell \;\sim\; \mathrm{Beta}\!\left(\text{helpful}_\ell + 1,\; \text{harmful}_\ell + 1\right)$$

   and inject the top 1–2 by $\theta_\ell$ into `USER_GUIDANCE_AGENT` via the context
   builder. Sampling (not posterior-mean ranking) is what makes under-tested
   candidates get explored: a lesson with 0/0 counts has $\theta \sim
   \mathrm{Beta}(1,1)$, uniform — it competes fairly against a proven lesson at
   $\mathrm{Beta}(9,1)$ only sometimes, which is exactly the desired explore/exploit
   balance.
4. Write one `lesson_application` row per injected lesson (`outcome = 'pending'`,
   `sampled_score = θ` for later audit).

Pure-SQL fallback (if sampling must live in a query): UCB score
`posterior_mean + 1.96 * sqrt(ln(total_uses + 1) / (2 * (uses + 1)))`,
ordered desc. Thompson in code is preferred.

## 5. Validation-grounded counter update rule

### 5.1 The rule

```
on_validation_result(run):
    outcome := 'passed' if run.validation_passed else 'failed'
    for app in SELECT * FROM lesson_application
               WHERE run_id = run.id AND counted = 0:
        emit delta MARK_HELPFUL  {application_id: app.id, outcome}  if outcome == 'passed'
        emit delta MARK_HARMFUL  {application_id: app.id, outcome}  otherwise
        apply delta: lesson.helpful_count += (outcome == 'passed')
                     lesson.harmful_count += (outcome == 'failed')
        app.counted := 1
        app.outcome := outcome
    for each affected lesson: apply_status_rules(lesson)
```

Counters move **only** on observed validation outcomes for runs where the lesson was
actually injected (`lesson_application` row). Reflector proposals, Generator
opinions, and self-tags may create `EDIT` deltas but never move counters. This is the
Huang et al. (2023) constraint: self-assessment is a proposal channel; the
environment is the counting channel.

### 5.2 Status rules (retention as inference)

Let $n = \text{helpful} + \text{harmful}$ and $\hat{p} = \text{helpful}/n$. Use the
Wilson score interval with $z = 1.96$:

$$\mathrm{wilson}_{\pm} \;=\; \frac{\hat{p} + \frac{z^2}{2n} \;\pm\; z\sqrt{\frac{\hat{p}(1-\hat{p})}{n} + \frac{z^2}{4n^2}}}{1 + \frac{z^2}{n}}$$

- **Promote** `candidate → active` when $n \ge 8$ and $\mathrm{wilson}_{-} > 0.5$
  (lower bound of the helpful-rate clears chance).
- **Quarantine** (any status → `quarantined`) when $n \ge 8$ and
  $\mathrm{wilson}_{+} < 0.45$ (upper bound below useful). Quarantined lessons leave
  the view but keep their rows and deltas — replayable, reinstable.
- **Never hard-delete.** Pollution risk is handled by quarantine, not deletion
  (the OEP/Misevolve lesson: locally-correct-but-non-transferable lessons must be
  demotable, and their history must remain auditable).

### 5.3 Optional stronger gate (counterfactual lift) — revised 2026-07-20

Revised after deep-reading Buesing et al. 2018 (WCS) and Meulemans et al. 2023
(COCOA); full analysis in `lyo-counterfactual-credit-synthesis.md`. The original
difference-in-rates sketch is **convicted by both papers**: Thompson injection is
history-dependent — lessons are injected preferentially where failures persist —
so with-ℓ and without-ℓ groups differ in latent difficulty, and raw
difference-in-rates misattributes difficulty to the lesson (Simpson). The WCS
litmus test: an estimator is valid only where $p^{do(I)}(u) = p(u)$ — the
injection must not shift the scenario distribution.

**The replacement — propensity-standardized ratio-lift.** Within matched strata
$s$ = (failure_class × task family), per lesson $\ell$:

$$\widehat{\mathrm{lift}}_\ell(s) \;=\; \frac{P(\text{pass} \mid s,\ \ell)}{\sum_{\ell'} \rho_{\ell'}(s)\, P(\text{pass} \mid s,\ \ell')} \;-\; 1$$

with $\rho$ the selection propensities. Sign semantics (positive = helps), a
natural zero gate, and the result is usable as fractional evidence. Thompson's
randomization plus logged propensities yields the backdoor condition
(inject ⊥ outcome | s, ρ) — the COCOA argument that makes do() an observational
conditional. Estimation path: start with stratified rates; upgrade to IPW /
doubly-robust using the logged propensities; **cluster by run** (receipts within
a run share the scenario — naive pooling inflates $n$).

**Gate:** promote iff Wilson-lower > 0.5 (§5.2 pollution filter) **and** the
ratio-lift confidence interval excludes 0 within class strata, with both groups
≥ ~5–10 cycles per stratum. Identification requires **positivity**: never let a
propensity reach 0 in a stratum (exploration floor), and keep solo-injection
probability > 0 (top-2 joint injections cannot identify per-lesson main effects).

**Scope:** this is Pearl rung-2 (population-level). The unit-level question —
"would *this* run have passed without the lesson?" — is rung-3 (WCS) and needs
the run randomness record plus a trusted response surface; deferred.

**Schema prerequisite — decision log (backward-incompatible to add later).**
`sampled_score` currently stores the Thompson *draw* θ, not the *selection
probability* $P(\ell \text{ top-ranked} \mid \text{candidate set}, \{(\alpha,\beta)\}_t)$. Add a decision-log record per injection holding:
the full candidate set with each candidate's $(\alpha, \beta)$ at decision time;
the computed propensity per candidate; the null arm (no-lesson cycles);
decision-point context (task id, failure_class, cycle index, retry count);
a bandit posterior snapshot id (versioning as the bandit drifts); and the run
randomness record (seeds, temperature, model ids) — the down payment on rung-3.

## 6. Replay (counterfactual accounting, audit)

The library state at any time $T$ is a fold over the log:

```sql
SELECT * FROM lesson_delta
WHERE lesson_id = :lid AND ts <= :T
ORDER BY delta_id;
```

Fold in code: start from empty, apply `CREATE`/`EDIT` payloads, add `MARK_*` to
counts, apply status transitions. This gives:

- **Point-in-time library** for audits and regression analysis of the learner itself.
- **A/B estimation without new experiments**: re-run the status rule over history
  with a lesson forced in/out to sanity-check its attributed effect.
- **Rollback**: if curation misbehaves, the view can be rebuilt to before the pass.

## 7. Curation (the Curator pass)

Runs every N runs (start: N = 25) or when `lesson` rows cross a threshold — never
inline with execution, never as a full-library rewrite.

- **Merge**: pairs with identical `failure_class` and high `trigger_cue` similarity →
  `MERGE_INTO` delta; counters add, provenance unions.
- **Prune**: candidates with $n = 0$ uses after M days → `RETIRE` (they congest
  retrieval without evidence against them).
- **No re-summarization of lesson content.** Edits are localized payloads. (This is
  the ACE brevity-bias/context-collapse rule, Appendix A.)

## 8. Deferred (explicit non-goals for v0.1)

For each item, the v0.2+ design direction is now specified: see §10 (abstraction
ladder) and §11 (lesson mempool).

- Embedding retrieval (`sqlite-vec`): add when string-matched `trigger_cue` provably
  misses obvious matches (§10 L2, trigger condition specified there).
- Explanation-extraction prompt design (the Reflector role): seed with the TRAIL
  taxonomy as the `failure_class` label set (§10 L3).
- Hypothesis ranking beyond Thompson (Elo tournaments for competing explanations of
  the same failure).
- Cross-lesson interaction / confounded lessons (belief-propagation territory —
  revisit when two lessons' effects are observably entangled; see also the
  solo-injection identification rule in §5.3).
- Lesson compaction into executable skills (SkillWeaver-style: lesson → tested code)
  (§10 L5).
- Proactive broadcast and semantic addressing of lessons (§11); cross-project
  federation (§11.4, v0.3).

## 9. Metrics to watch from day one

- **Coverage (Ashby)**: distinct `failure_class` values observed in rejections vs.
  classes with ≥1 `active` lesson. Gap = requisite-variety deficit.
- **Lesson precision**: fraction of `active` lessons with $\mathrm{lift} > 0$ at last
  evaluation.
- **Attribution latency**: runs between a `CREATE` and its lesson reaching `active`.
- **Pollution rate**: `QUARANTINE` deltas per 100 `MARK_*` deltas.

---

## 10. The abstraction ladder (v0.2 direction)

v0.1 delivers **L0 evidence** (receipts, deltas) and **L1 parametric learning**
(per-lesson $p_\ell$, Wilson gates) — learning *about individual lessons*. It
provably does not generalize: a new lesson identical in substance to a trusted
one still starts at $\mathrm{Beta}(1,1)$; no strength transfers. Learning in the
strong sense = abstraction = "what is true *across* lessons?" The ladder, with
each rung's truth-risk and its slot in the delta schema:

| Rung | Name | Mechanism | Truth-risk control |
|---|---|---|---|
| L0 | Evidence | receipts (`lesson_application`), deltas | grounding invariant |
| L1 | Parametric | Beta counters + Wilson per lesson | environment counts only |
| L2 | Retrieval generalization | embedding similarity over `trigger_cue` (sqlite-vec) | content stays verbatim; only the *key* generalizes |
| L3 | Content compression | LLM Reflector proposes generalized lessons | enters as **candidate, Beta(1,1)**; Wilson decides; never rewrites existing text |
| L4 | Meta-structure | hindsight classifier $\hat h(\ell \mid s, u')$ over receipts (COCOA) | fractional counts $w_i = \hat h/\rho - 1$; Thm. 3 warns against joint attribution |
| L5 | Proceduralization | lesson → tested executable skill (SkillWeaver) | deferred (far end) |

Design rules for the ladder:

1. **Abstraction proposes; grounding disposes.** Every rung above L1 is a
   *proposal channel*. Counters still move only via validation outcomes on
   actual injections (§5.1). Compression can never assert — a generalized lesson
   (L3) is a new `CREATE` delta with candidate status and zero counters, linked
   to its source lessons through provenance; existing lesson text is never
   rewritten (the §7 collapse rule applies to all rungs).
2. **L2 trigger condition.** Add sqlite-vec when EDIT-merge rate collapses while
   same-class CREATEs with near-duplicate cue text accumulate (measurable in the
   delta log). Until then, exact-cue matching is the conservative default.
3. **L4 credit rule.** The hindsight classifier replaces "all pending injections
   get the outcome" (within-run over-crediting): per injection,
   $w_i = \hat h(\ell_i \mid s_i, u')/\rho_i - 1$ gates the Beta update — lessons
   irrelevant to the observed outcome get $w \approx 0$ and never move. Credit
   stays pairwise; no Shapley, no outcome-conditioned baselines (COCOA App L
   proves bias). Outcome encoding: $u' = (\text{failure\_class}, \text{pass})$ —
   coarse-but-fully-predictive (COCOA Thm. 3 / Prop. 2 traps).

**Partial pooling (statistical percolation, no LLM — the cheapest rung).**
Today each lesson's prior is independent uniform. Instead, share strength
within a failure class:

$$p_\ell \sim \mathrm{Beta}(a_c, b_c), \qquad (a_c, b_c)\ \text{fit from class } c\text{'s lesson history}$$

Evidence percolates: instances → class-level posterior → informs new instances.
A new lesson in a historically-successful class starts mildly optimistic; in a
class of failures, mildly suspicious. Use the pooled prior for **selection only**
(Thompson draws); keep raw per-lesson counters for Wilson/retention — grounding
stays per-lesson, so the gate is never contaminated by the class.

## 11. Lesson mempool — broadcast and addressing (v0.2 direction)

Cybernetics: stored lessons are *potential* variety; requisite variety is
satisfied only at the point of disturbance (Ashby). LYO (System 4) fails not
when it lacks intelligence but when the **channel** to System 1 units has the
wrong capacity or addressing (Beer). The design object is therefore a pool with
admission, priority, and delivery — structurally a mempool:

| Mempool | Lesson pool |
|---|---|
| CheckTx admission | candidate status on first sight (unverified) |
| pending pool | hypotheses awaiting evidence, not truth |
| fee-priority for limited block space | Thompson draw for top-2 injection slots; context window = block space |
| consensus finality / n confirmations | validator verdict / Wilson n ≥ 8 |
| recheck per new block, eviction | curator pass; quarantine on new evidence |
| gossip to peers | cross-run broadcast; cross-project = federation (§11.4) |

### 11.1 Proactive pre-arm channel (the reactive-only gap)

v0.1 delivers lessons **only after the failure recurs** — it waits for the next
rejection before shipping the cure. Add a pre-arm channel: at run start, profile
the task → resolve its topic set → inject matching lessons via
`USER_GUIDANCE_CLUSTER` *before the first attempt*. Pre-arm rules: **active
lessons only** (candidates wait for a live failure — an unconfirmed need should
not spend block space), cap ~3 lessons, hard token budget, ordered by posterior
mean. Reactive injection on rejection is unchanged (top-2 Thompson, candidates
eligible). Retention rules do not change: a pre-armed lesson earns counters only
through grounded outcomes of runs where it was actually delivered.

### 11.2 Addressing: topics and subscriptions

Lessons are published to topics `(failure_class × cue × task-profile tags)`;
runs subscribe by task profile. v0.2 uses exact topic keys; semantic addressing
(embedding topics) rides the L2 rung and shares its trigger condition.
Addressing is a first-class design object, not a WHERE clause: it decides
*where lessons go* — it never gets a vote on *what is true* (§5 unchanged).

### 11.3 Recheck semantics

On context change (bandit drift, taxonomy revision, executor model upgrade),
pending lessons are re-stratified: strata memberships recomputed, propensities
re-derived, quarantine re-evaluated. Quarantine is explicit invalidation on
recheck; rows and deltas are kept (replayable, reinstable, §5.2).

### 11.4 Federation (v0.3, deferred)

Cross-project gossip of *generic* lessons (tool-selection, output-format) with
full provenance; project-specific lessons stay local. Gossip before the pool is
trustworthy propagates pollution faster — federation starts only after §9 metrics
show pollution rate stably low. Scope and privacy review required.

### 11.5 Capacity metric

Track lesson token share of agent context (pre-arm + reactive) as a §9 metric;
the initial "gas limit" is ≤ 3 pre-armed active lessons + top-2 reactive.

---

## Appendix B — Is LYO necessary, or could Zeroshot do this alone?

Honest answer: **none of this is beyond Zeroshot's capability; the necessity is
architectural, not functional.** The tables above could physically live in the same
SQLite file. The boundary that matters is logical, and it has five reasons:

1. **Different control levels (Viable System Model).** Execution is System 1;
   learning is System 4 (adaptation). They operate on different objects: a run vs.
   the *history of runs*. Folded into one component, the immediate objective
   (complete this run) always eats the long-term one (improve future runs) — the
   organizational version of context collapse.
2. **The regulator must hold a model of the system (Conant–Ashby).** The failure
   taxonomy + explanations are LYO's model *of* Zeroshot. If Zeroshot owns that
   model, the model is subject to the same failure modes it describes — the map gets
   drawn by the territory. An external learner keeps the model honest.
3. **Write discipline.** Event sourcing needs one writer per log. Zeroshot already
   writes the run ledger; `lesson_delta` is a different log with different
   semantics. LYO-exclusive writes keep both logs clean and independently migrable.
4. **Blast-radius containment.** Learning is slow, batch, and risky (memory
   pollution, bad lessons, curation bugs). A separate layer means a curation bug
   never blocks a run, and a bad lesson is a quarantine away — not a hotfix to the
   executor. Self-evolving components earn their own sandbox.
5. **Replaceability.** Keyed on bus events (`VALIDATION_RESULT`,
   `USER_GUIDANCE_AGENT`) plus a ledger, LYO is executor-agnostic: the same layer
   can sit over a future executor. Baked into Zeroshot, it can't be lifted.

**Practical middle ground:** if Zeroshot is the only executor for the foreseeable
future, ship LYO as a *separate module inside the Zeroshot repo* — own tables, own
write path, feature flag (`--lyo` already exists), no shared code paths with the
retry loop. That keeps 90% of the boundary value without another service. What is
not negotiable: separate log, separate writer, validation-grounded counters. The day
a second executor appears, the module lifts out and becomes a service.
