# The Principled Map: LYO's Learning Mechanics

Date: 2026-07-27
Status: current
Scope: scaffolding improvement only — no θ updates, no world models.

## The principle

LYO's learning loop has three distinct decision points, and each belongs to a
different principled family. The core discipline: **no magic numbers** — every
constant is either an error rate in its own units, a rate derived from data,
or a scope decision explicitly labeled as such.

```
                 ┌─────────────────────────────────────┐
   disagreement  │  1. ADMISSION — falsifiability      │
   ───────────►  │  "an arm must be able to pay out"   │
                 └──────────────┬──────────────────────┘
                                ▼
                 ┌─────────────────────────────────────┐
                 │  2. TRUST — sequential analysis     │
                 │  evidence accumulator, E > 1/α      │
                 └──────────────┬──────────────────────┘
                                ▼
                 ┌─────────────────────────────────────┐
                 │  3. SELECTION — Thompson sampling   │
                 │  Beta posteriors per artifact       │
                 └──────────────┬──────────────────────┘
                                ▼
                          delivery into
                          future runs
```

The order matters and is not negotiable: falsifiability **before** trust,
trust **before** selection. Sampling cannot fix an arm that cannot pay out;
delivery cannot redeem an artifact that hasn't earned trust.

## 1. Admission — falsifiability (Popper, operationalized)

A lesson enters the bandit only if it states what observation would prove it
wrong. Unfalsifiable advice ("always address all acceptance criteria") is
infinitely consistent with every outcome — it can never earn or lose credit
and would sit at Beta(1,1) forever, being delivered as knowledge.

- Judge contract: `falsifiable_by` is **required**; the parser throws without
  it ("an arm must be able to pay out").
- Judgments lacking it are recorded with scope `undeliverable` — kept as
  evidence, never installed, never delivered.
- Lesson files carry the `- falsifiable_by:` line; `loadLessons` parses it.

Commit: `b889a6e`. Origin: the azure-beacon trace (a content-free reflector
lesson delivered at session start).

## 2. Trust — sequential likelihood-ratio evidence

When does a disagreement class earn promotion into future runs? This is a
**sequential testing** problem, not allocation: "is this a real recurring
pattern or noise, with controlled false-promotion rate?"

Mechanism (`src/lyo/evidence.ts`):

- Each run is one Bernoulli observation per class: recurrence = 1, clean run
  (same spec + same writer model, zero disagreements of the class) = 0.
- `E = ∏ LR(x)`, `LR(x) = Bernoulli(x | p1) / Bernoulli(x | p0)`.
- **Promote when E > 1/α.** The threshold is the tolerated false-promotion
  rate in its own units (α=0.05 → 20:1 evidence), always-valid — checkable
  after every run with the error guarantee intact.

Parameters and why they are not heuristics:

| Constant | Value | Meaning |
|---|---|---|
| α | 0.1 permissive / 0.05 strict | tolerated false-promotion rate |
| p1 | 0.5 | definition of "recurring pattern" (majority rate) |
| p0 | 0.1 | noise base rate — corpus-estimable; overestimating errs strict |
| minSpecs | 1 / 2 | **scope decision, not a statistic** — cross-spec generalization is a policy choice |

Replaced heuristics: `minRuns: 2`, Wilson floor + z=1.96, `weakenBlocks`
veto. Weaken events are now arithmetic: one clean run drops E from 25 to
13.9, which is why α=0.1 promotes and α=0.05 blocks on `[1,1,0]` — the split
is derived, not declared.

Commit: `eae2f5e`.

## 3. Selection — Thompson sampling (bandit allocation)

Which trusted lessons go into the next run's prompt? This **is** allocation:
repeated choice under uncertainty with feedback — the bandit frame, with the
best-proven policy in the toolbox.

- Per-lesson posterior: `Beta(helpful + 1, harmful + 1)` — conjugacy is a
  theorem; nothing was picked except the prior (see "parked" below).
- One draw per lesson; top-N (default 3) delivered. Proven lessons win most
  draws; unproven ones keep exploring — no temperature knob.
- Demotion cliff (placeholder): `harmful ≥ 2 ∧ helpful == 0` excludes.
- Blindness routing composes first: lessons reach only the stage whose
  failure class they came from.
- Reproducibility: candidates sampled in path order with injectable RNG
  (same convention as the kernel LessonStore).

Commit: `efb1f41`. The prior version (sort by observation count) ranked a
lesson *higher* the more it failed.

## Parked (awaiting data volume)

| Item | Why parked | Unblocks when |
|---|---|---|
| **Empirical Bayes prior** (replace Beta(1,1)) | needs a lesson population to estimate from | library grows past ~20 lessons |
| **Staleness decay** (TrueSkill-style uncertainty growth) | cliff-edge `isDemoted` is the placeholder | counters are actually fed (area 6) |
| **Contextual bandits / LinUCB** (condition on model × vehicle) | needs volume per cell | enough runs per model × vehicle class |
| **Feeding the counters** (roadmap area 6) | `recordLessonOutcome` exists, no caller | transfer-verdict discipline lands |

## What was learned about the frame itself

- **The failure modes live at the boundaries, not the core.** The framework
  (Bayes + Thompson + LR) is principled; heuristics hide in assumptions:
  uniform priors, i.i.d. outcomes, stationarity. Each fix stays inside the
  Bayesian frame — empirical prior, decay, context features — not a
  different religion, a better model of the same data.
- **Try and trust are different doors.** Allocation (Thompson) and promotion
  (sequential testing) look similar and must not be merged — using the
  sampler's posterior as the trust criterion is how confounded credit slips
  in. (Kernel synthesis doc, same conclusion: "Thompson = which to try;
  gates = which to trust.")
- **Falsifiability precedes everything.** The reflector's most fluent output
  is its least checkable. An arm that cannot pay out is not an arm.

## Authoritative gates per store

The three decision points above (admission, trust, selection) define the
authoritative promotion and quarantine discipline for the **kernel SQLite
lesson store**. This section makes the per-store authority explicit, resolving
the contradiction catalogued in `Specs/00-spec-consolidation.md` §00.1.1.

### Kernel SQLite store (`src/lyo/lesson-store.ts`)

| Decision point | Authoritative rule | Source |
|---|---|---|
| Admission | `falsifiable_by` required; undeliverable lessons kept as evidence, never installed | §1, commit `b889a6e` |
| Trust / promotion | Sequential likelihood ratio `E > 1/α`; α=0.05 strict / α=0.1 permissive | §2, commit `eae2f5e` |
| Quarantine | Wilson upper bound < 0.45 at n ≥ 8 (see `Specs/3-lesson-delta-design.md` §5.2); demotion cliff `harmful ≥ 2 ∧ helpful == 0` as placeholder | `Specs/3` §5.2; `principled-map.md` §3 |
| Selection / delivery | Thompson sampling, Beta(helpful+1, harmful+1), top-N draws | §3, commit `efb1f41` |

The sequential LR trust gate **replaces** the Wilson score floor + z=1.96
heuristic and the `minRuns: 2` rule. The Wilson interval in `Specs/3` §5.2
remains the quarantine side of the same gate. Together they are the
authoritative kernel-store discipline.

### File-based lesson library (`Specs/4.3`)

The file-library quarantine rule in `Specs/4.3-at-bat-risk-inputs-cost-and-quarantine.md`
(`isDemoted` as `harmful ≥ 2 ∧ helpful == 0`) is a **separate store with a
separate rule**. It is not the kernel-store rule and must not be applied to
kernel-store lessons. The two rules coexist because the two stores have
different data regimes: the kernel store accumulates Bernoulli observations
per class and can use a statistical bound; the file library has coarse
per-lesson counters and uses a hard threshold. This divergence is legitimate
provided it is stated — which this section now does.

**Superseded variants marked elsewhere:**
- `docs/cybernetic-association-learner.md` — bootstrap thresholds
  (`support >= 3`, `score >= 2`, etc.) are superseded by the sequential LR
  gate for the kernel store. See the note added at that document's threshold
  section.
- `docs/future/agent-learning-control-plane-prd.md` — the "≥ 2 compatible
  preference pairs" promotion criterion is a product-level aspiration, not the
  operational gate for either store. See the pointer added at that document.
