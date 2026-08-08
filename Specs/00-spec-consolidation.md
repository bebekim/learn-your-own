# Spec Consolidation — Meta Layer (00)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.
>
> **Priority: first** — this spec governs the cleanup of all other specs in this repository.
> It lands before any other item in the queue and its decisions are the authority
> that Specs 1–N rebind onto.
>
> **Numbering:** Tractatus *Tractatus Logico-Philosophicus* style.
> `00` is the meta/consolidation layer. `0` is reserved.
> Layers `1`–`4` are content. Decimals elaborate within a layer
> (e.g. `3.1` revises a section of `3`; `4.4` is the fourth night-shift item).
> A later decimal does **not** imply temporal order — it implies conceptual
> elaboration. Temporal order is stated explicitly in each spec's `Dependencies` block.

---

## 00.0 State of the two spec roots

### 00.0.1 What exists now

As of 2026-08-04 the repository has exactly one spec root: **`Specs/`** (capital S).

The former lowercase `spec/` directory was merged into `Specs/` on 2026-08-04 and
no longer exists. There is no `spec/` to revert to.

`Specs/` is **flat**: night-shift work items and long-lived design specs sit side by
side at the top level. Completed or archived items move to `Specs/done/`. There is
no hierarchy of subdirectories at the top level.

`Specs/done/` already exists. Its current content:

```
Specs/done/
  3.2-lesson-delta-implementation-plan.md
```

### 00.0.2 Does the night-shift workflow use `Specs/`?

**Confirmed: yes.** Three independent references in the repo use the `Specs/` path:

1. **README.md:256** — `lyo pipeline init --spec ~/repositories/work/nectr-crm/Specs/05-something.md`
2. **`dogfood/run-loop.sh`** — calls `lyo pipeline run --plan` against task dirs that originate from Specs
3. **`src/runner/spec-compiler.ts`** — reads night-shift markdown specs from `Specs/` at compile time
4. **`tests/bridge.test.js`** — bridge tests load specs from `Specs/`

The night-shift pipeline (`lyo pipeline init` → `lyo pipeline run` → `lyo pipeline apply`)
consumes markdown specs from `Specs/` and compiles them into `spec.json` + `plan.json`.
A spec that is not in `Specs/` (or not `State: ready`) is invisible to the pipeline.

**Corollary:** `Specs/` is not a design-notes folder. It is a pipeline input folder.
Every spec in it is either a pipeline work item or a design spec consulted by pipeline
items. Stale specs in `Specs/` are not cosmetic — they are dead weight in a live input path.

### 00.0.3 Is there a separate `design/` folder?

**No.** There is no `design/` directory in this repository. All design-level documents
live inside `Specs/` (long-lived design specs) or `docs/` (background literature and
product narratives). The idea of a separate `design/` folder is not current
architecture and needs no flattening.

If a `design/` folder is created in future, it should be treated as a view over
`Specs/`, not a parallel store — the pipeline only reads `Specs/`.

### 00.0.4 What `docs/` holds (and why it is not part of this consolidation's primary job)

`docs/` is a separate root for background literature, product narratives, and
superpowers plan docs. It is referenced by specs in `Specs/` but is not itself a spec
root. Key files referenced by the specs below:

```
docs/
  behavior-as-code.md                          ← scalar-credit tension (see 00.1.5)
  learning-as-explanation-graph.md             ← readable version of Specs/2
  telemetry-effect-semantics-for-lyo.md        ← effect algebra root doc
  trace-effect-tape-spec.md                    ← "tape" naming collision site (see 00.2.1)
  turing-tape-model-for-lyo.md                 ← "tape" naming collision site (see 00.2.1)
  future/
    learning-circulation-spec.md               ← "packet" naming collision site (see 00.2.2)
    workspace-activation-spec.md               ← scalar-credit tension site (see 00.1.5)
    agent-learning-control-plane-prd.md        ← promotion gate conflict (see 00.1.1)
  superpowers/
    specs/
      2026-07-27-principled-map.md             ← gate decision target (see 00.1.1)
      2026-08-04-lyo-workflow-mechanics.md    ← injection cap conflict (see 00.1.6)
```

The staleness sweep in §00.4 touches a small number of `docs/` files, but the full
docs/ inventory is out of scope for this spec. Only files implicated by a
contradiction, collision, or staleness finding listed below are touched.

---

## 00.1 The six contradictions

Six real contradictions were found in the audit that produced the prior
`0-spec-consolidation-and-cleanup.md`. All six are reproduced here, renumbered
under the 00 layer, with the resolution path each one requires.

**Reading convention:** each contradiction names the documents involved, the exact
locus of the conflict, the nature of the conflict, and the desired resolution.
"Authoritative" means the document that wins; "superseded" means the losing document
must carry an in-place pointer to the winner. No document is deleted.

### 00.1.1 Promotion / trust gate — four incompatible criteria

**Documents involved:**

- `Specs/3-lesson-delta-design.md` §5.2 — Wilson score interval, n ≥ 8, lower bound > 0.5 for promote; upper bound < 0.45 for quarantine
- `docs/superpowers/specs/2026-07-27-principled-map.md` — sequential likelihood ratio `E > 1/α`, explicitly claims to **replace** the Wilson floor
- `docs/cybernetic-association-learner.md` — threshold counts: support ≥ 3, score ≥ 2
- `docs/future/agent-learning-control-plane-prd.md` — ≥ 2 compatible preference pairs

**Nature of conflict:** Four documents, four different gate criteria, no document
states which one is authoritative for which store. A lesson could be promoted by one
criterion and quarantined by another. The conflict spans both the kernel SQLite store
and any future stores.

**Resolution:** A short gate-decision document (or a section added to
`docs/superpowers/specs/2026-07-27-principled-map.md`) must name the authoritative
promotion/quarantine rule **per store**, with rationale. Every losing variant is marked
superseded in its document with a pointer to the winner. The acceptable outcome is not
"one gate for everything" — different stores may have different gates — but the choice
must be written down. An undocumented divergence is a defect.

**Tractatus note:** If the gate decision resolves as "different gates for different
stores," that is a legitimate proposition at layer 3, not a contradiction. The
contradiction is the *absence* of the statement.

### 00.1.2 Two lesson stores, two quarantine rules

**Documents involved:**

- `src/lyo/lesson-store.ts` + `Specs/3-lesson-delta-design.md` §5.2 — Wilson-upper < 0.45 @ n ≥ 8 (kernel SQLite store)
- `Specs/4.3-at-bat-risk-inputs-cost-and-quarantine.md` §Desired Behavior item 3 — `isDemoted` computed as `harmful ≥ 2 ∧ helpful == 0` (file-based library)

**Nature of conflict:** Both quarantine rules are documented as intended. They disagree
numerically on the same concept (when is a lesson too harmful to serve?). The kernel
store uses a statistical bound; the file library uses a hard count threshold. Neither
document cross-references the other's rule.

**Resolution:** The gate decision in 00.1.1 should name the authoritative rule for each
store. If the two stores legitimately have different rules, that must be stated with
rationale. If they should agree, one must be changed to match the other. The file-library
rule in `Specs/4.3` must either cite the kernel rule as the model or state its own
rationale explicitly.

### 00.1.3 `sampled_score` schema gap — propensity missing

**Documents involved:**

- `Specs/3-lesson-delta-design.md` §3 (DDL) — `lesson_application.sampled_score REAL` stores the Thompson *draw* θ
- `Specs/3.1-counterfactual-credit-synthesis.md` §3.4 — convicts this: ratio-lift is unidentified without the selection *probability*

**Nature of conflict:** The design doc's DDL stores the draw. The credit synthesis
document proves that the draw is not enough — without the selection propensity
`P(ℓ top-ranked | candidate set, {(α,β)} at t)` plus the null arm, posterior snapshot
id, and decision-point context, IPW / doubly-robust estimation is impossible. The DDL
acknowledges this as a prerequisite in §5.3 but never updates the schema. It is
backward-incompatible to add later; cheap to add now.

**Resolution:** `lesson_application` (or a companion decision-log table) gains the
propensity fields named in `Specs/3.1` §3.4: full propensity vector, null-injection
decisions and negatives, decision-point context, bandit posterior snapshot id, and run
randomness record. The design doc DDL in `Specs/3` §3 is updated to match. A migration
is written. Legacy counters from the pre-propensity schema stay valid as Beta evidence;
the migration adds columns, it does not recompute history.

### 00.1.4 Two unconnected learning substrates

**Documents involved:**

- `Specs/2-learning-as-explanation-graph.org` — speaks evidence / hypothesis / belief / factor / message passing
- `Specs/3-lesson-delta-design.md` — speaks lesson / counters / lift / Thompson / Wilson
- `Specs/2.1-agent-ir-language.org` — claims plan-vs-trace diffs feed the explanation graph

**Nature of conflict:** The explanation graph (layer 2) and the lesson-delta system
(layer 3) are specified in different vocabularies with no mapping between them.
`Specs/2.1` asserts that plan-vs-trace diffs are a structured evidence source for the
explanation graph, but no document maps `lesson_delta` rows to `evidence_events`, or
explains whether the two systems are two views of one substrate or two independent
tracks. A reader cannot tell whether the lesson library is downstream of the explanation
graph, upstream of it, or orthogonal to it.

**Resolution:** One page — either in `Specs/` or in `docs/learning-as-explanation-graph.md`
— must either (a) map lesson-delta vocabulary onto explanation-graph vocabulary with
explicit join points, or (b) explicitly declare the two as separate tracks with stated
boundaries and a statement of which feeds which. Option (b) is acceptable if written
down. Silence is not.

### 00.1.5 Scalar rewards vs preference-first doctrine

**Documents involved:**

- `docs/behavior-as-code.md` — `credit_delta` as a scalar reward signal
- `docs/future/workspace-activation-spec.md` — `weight = support + pos − neg` formula
- `docs/future/preference-derived-budget-pressure-spec.md` — forbids "fake reward numbers"

**Nature of conflict:** `preference-derived-budget-pressure-spec.md` forbids scalar
reward numbers as a category. `behavior-as-code.md`'s `credit_delta` and
`workspace-activation-spec.md`'s `weight = support + pos − neg` are exactly the "fake
reward number" that document forbids. `workspace-activation-spec.md` acknowledges the
tension but specifies the formula anyway. This is a direct contradiction, not a
vocabulary disagreement.

**Resolution:** Either (a) the preference-first document wins and the scalar formulas
are marked superseded with a pointer, or (b) the preference-first document is revised to
name the conditions under which a scalar credit signal is acceptable (if any). The
current state — a document forbidding X and another document doing X while noting the
tension — is not a stable resolution.

### 00.1.6 Hardcoded injection caps vs no-magic-numbers doctrine

**Documents involved:**

- `docs/superpowers/specs/2026-08-04-lyo-workflow-mechanics.md` — caps delivery at "3 per role"
- `Specs/3-lesson-delta-design.md` §11.5 — "gas limit" of ≤ 3 pre-armed + top-2 reactive
- `src/lyo/lesson-library.ts:42` — `DEFAULT_LESSON_LIMIT = 3` with top-k slices at `lesson-library.ts:124` and `selection-policies.ts:97`
- `docs/superpowers/specs/2026-07-27-principled-map.md` — forbids constants that are neither error rates, data-derived rates, nor labeled scope decisions
- `Specs/4.4-lesson-injection-cadence.md` — replaces caps with a measured stopping rule: expected prevented loss > context cost

**Nature of conflict:** Three independent documents and the live code all hardcode the
number 3 as a lesson-injection cap. `principled-map.md` forbids exactly this category of
constant. `Specs/4.4` provides the replacement — a `min()`/`max()` stopping rule over
measured quantities — but the older documents have not been updated to point at it.

**Resolution:** The older documents (`workflow-mechanics.md`, `Specs/3` §11.5, and any
other document that states a hard cap) must carry a pointer to `Specs/4.4` as the
authoritative injection-cadence spec. The stopping rule is:

```
n_pass  = #{ i : θᵢ × P(failure_class recurs | cell) × C_failure > C_tokens(lesson i) }
n_budget = ⌊ lesson_block_token_budget / tokens_per_lesson ⌋
inject top min(n_pass, n_budget) candidates by expected prevented loss
```

Both bounds are `min()`/`max()` over measured quantities. No hardcoded heuristic.
The rule parameterizes itself from data — like Dijkstra's edge weights, not like a
Pagerank damping factor. Until `Specs/4.3`'s cost terms (`C_tokens`, `C_failure`) exist,
the interim values must be recorded in the plan artifact as explicitly labeled scope
decisions. Silent constants in code are forbidden.

**On hardcoded heuristics:** PageRank uses a damping factor (a model parameter, not a
heuristic — it has a probabilistic interpretation as restart probability). Dijkstra uses
`min()` over edge weights. Neither uses a magic number that says "stop after 3." The
lesson-injection cap should follow the same discipline: parameter.

---

## 00.2 Naming and metaphor collisions

Four naming collisions were found. Each is listed with its definition sites and the
disambiguation required.

### 00.2.1 `tape`

- **Sense 1:** Reducer state machine — `docs/turing-tape-model-for-lyo.md`. A verifier-gated
  grammar for a run loop; the tape is the sequence of reducer states.
- **Sense 2:** Telemetry compiler metaphor — `docs/trace-effect-tape-spec.md`. A tape is a
  serialized log of effects produced by the compiler frontend.

**Required disambiguation:** One sentence at each definition site naming the other sense
and pointing to it. If the two are intended to be the same concept under different names,
that must be stated explicitly. If they are different concepts, each document must use a
distinct term or carry a cross-reference.

### 00.2.2 `packet`

- **Sense 1:** Cross-zone circulation signal — `docs/future/learning-circulation-spec.md`.
- **Sense 2:** Corpus-slice export — `docs/local-corpus-effect-algebra-spec.md`.

**Required disambiguation:** Same as 00.2.1. These are different domains (learning
circulation vs corpus export); the collision is in the word, not necessarily in the
concept. A rename of one sense is acceptable if it removes the ambiguity.

### 00.2.3 `episode`

- **Sense 1:** Compiler work unit — a self-contained unit of compiler processing.
- **Sense 2:** Eval baseline run record — one frozen task execution with injected context,
  verifier evidence, cost, time, and outcome (see README.md:357).

**Required disambiguation:** The eval sense is the more concrete and is the one used in
the CLI surface. The compiler sense should either adopt the same term with a qualifier
("compiler episode") or use a different term. The README concept table at
README.md:345–363 is the canonical glossary; both senses must be represented there if
both survive.

### 00.2.4 `protocol` / `lesson` / `learned_rule` / `artifact`

**Documents involved:** README.md concept table (README.md:345–363), `Specs/3`, `docs/`
concept documents.

**Nature of conflict:** Four names, four slightly different lifecycle state machines,
overlapping concepts. A reader cannot tell from the names alone whether a `protocol` is
a `lesson` at a different status, whether a `learned_rule` is a kind of `artifact`, or
whether these are four distinct things.

**Required disambiguation:** One sentence at each definition site stating what the term
is, what it is not, and which other term it is closest to. The README concept table is
the canonical disambiguation site; each term must have a row there.

---

## 00.3 The layer structure — Tractatus numbering

### 00.3.1 Numbering convention

```
00   meta / consolidation layer  (this document; first priority; governs all others)
0    reserved — not used
1    problem library and core doctrine
2    learning as explanation graph (hypothesis generation + belief inference)
3    lesson-delta (durable lesson library, counters, gates, selection)
4    night-shift pipeline queue (work items that land in the pipeline)
```

Within a layer, decimals elaborate. `3.1` revises a section of `3`; `4.4` is the
fourth item in the night-shift queue. Decimal order is conceptual, not temporal —
temporal order is stated in each spec's `Dependencies` block.

Sub-numbers (e.g. `3.1.2`) are not used in this repository. If a section needs a
sub-section, it is written as prose within the parent document, not as a separate file.
This keeps the file count equal to the spec count.

### 00.3.2 Layer responsibilities

**00 — Meta / consolidation.** Governs the spec corpus itself: contradictions,
naming collisions, staleness, language policy, numbering discipline. First priority.
Lands before any other spec. Does not change learning algorithms, gate math, or shipped
behavior. Its one code change is the additive propensity schema migration (see 00.1.3).

**1 — Problem library and core doctrine.** The shared vocabulary and first-principles
statements that all other layers assume. Currently sparse (see 00.4.1). Must define the
terms that layers 2–4 use without redefining them.

**2 — Learning as explanation graph.** The inference substrate. Evidence, hypotheses,
factors, message passing, belief. Consumes plan-vs-trace diffs from layer 4's IR work
(see 00.1.4) and produces provisional beliefs that layer 3's lesson system consumes as
one input among several.

**3 — Lesson-delta.** The durable lesson library. Schema, counter update rule, status
rules, curation, selection (Thompson / UCB), the counterfactual lift gate (§5.3), the
abstraction ladder (§10), and the lesson mempool (§11). The credit synthesis document
(`3.1`) revises §5.3.

**4 — Night-shift pipeline queue.** Work items that enter the pipeline. Each is a bounded
fix or feature with files, acceptance criteria, and test expectations. They consume
layers 1–3 and do not redefine them.

### 00.3.3 Dependency discipline

A spec in layer N may depend on specs in layers < N. A spec may not depend on a spec
in the same layer unless that dependency is stated explicitly in its `Dependencies`
block. A spec in layer N must not redefine vocabulary established in layer < N without
an explicit revision marker.

The gate decision called for by 00.1.1 is the authority that `Specs/3` and `Specs/4.3`
rebind onto. `Specs/4.4` inherits that decision. `Specs/0`'s decisions are the authority
all other specs rebind onto.

---

## 00.4 Inventory — all specs, current and proposed numbers

### 00.4.1 Layer 00 — Meta / consolidation

| File | Current name | Proposed | State | Notes |
|---|---|---|---|---|
| `Specs/00-spec-consolidation.md` | *(this file)* | 00 | ready | First priority. Replaces `Specs/0-spec-consolidation-and-cleanup.md`. |

### 00.4.2 Layer 1 — Problem library and core doctrine

| File | Current name | Proposed | State | Notes |
|---|---|---|---|---|
| `Specs/1-problem-library.org` | `1-problem-library.org` | 1 | **stale — empty stub** | Contains one `*` line and nothing else. Either fill it or delete it. See 00.5.1. |
| `Specs/1.1-learning-layer-literature.md` | `1.1-learning-layer-literature.md` | 1.1 | ready | Literature review. Not a pipeline work item; a reference document. No change needed. |

### 00.4.3 Layer 2 — Learning as explanation graph

| File | Current name | Proposed | State | Notes |
|---|---|---|---|---|
| `Specs/2-learning-as-explanation-graph.org` | `2-learning-as-explanation-graph.org` | 2 | ready | Core inference spec. No change needed from this spec. |
| `Specs/2.1-agent-ir-language.org` | `2.1-agent-ir-language.org` | 2.1 | ready (sketch) | Plan-shaped IR sketch. Claims to feed layer 2 evidence (see 00.1.4). No implementation. |

### 00.4.4 Layer 3 — Lesson-delta

| File | Current name | Proposed | State | Notes |
|---|---|---|---|---|
| `Specs/3-lesson-delta-design.md` | `3-lesson-delta-design.md` | 3 | ready | Schema, counter rule, status rules, curation, mempool. §5.3 revised by 3.1. |
| `Specs/3.1-counterfactual-credit-synthesis.md` | `3.1-counterfactual-credit-synthesis.md` | 3.1 | ready | Deep-read synthesis of WCS + COCOA. Revises 3 §5.3. Schema additions required (see 00.1.3). |
| `Specs/done/3.2-lesson-delta-implementation-plan.md` | `done/3.2-lesson-delta-implementation-plan.md` | 3.2 | **stale — wrong target repo** | Targets external JS `zeroshot-lyo`. See 00.5.3. |

### 00.4.5 Layer 4 — Night-shift pipeline queue

| File | Current name | Proposed | State | Notes |
|---|---|---|---|---|
| `Specs/4.1-checkblindness-and-contract-small-fixes.md` | `4.1-checkblindness-and-contract-small-fixes.md` | 4.1 | ready | Three small contract gaps. No dependencies. |
| `Specs/4.2-credit-evidence-discipline.md` | `4.2-credit-evidence-discipline.md` | 4.2 | ready | Cell-based credit, ≥2-prior-recurrence rule. Depends on 4.1 only if same files touched. |
| `Specs/4.3-at-bat-risk-inputs-cost-and-quarantine.md` | `4.3-at-bat-risk-inputs-cost-and-quarantine.md` | 4.3 | ready | At-bat inputs, cost accounting, file-library quarantine. Independent of 4.1/4.2. |
| `Specs/4.4-lesson-injection-cadence.md` | `4.4-lesson-injection-cadence.md` | 4.4 | **draft** | Injection cadence hooks. Depends on gate decision (00.1.1), 4.2, and 4.3. |

---

## 00.5 Stale and orphaned documents

### 00.5.1 `Specs/1-problem-library.org` — empty stub

Current content: one line, `* `.

The problem library is a layer-1 document and should define the shared vocabulary and
first-principles statements that layers 2–4 assume. As it stands it provides nothing.
**Resolution:** fill it with the core doctrine statements (the aligned core listed in
the prior `0-spec-consolidation-and-cleanup.md` §Problem) or delete it and record the
deletion in CHANGELOG.md. Inaction is not a resolution — a reader looking for the
problem statement finds nothing.

### 00.5.2 `issues/prd.md` — written against 0.2.1

`issues/prd.md` carries the 0.2.1 product requirements. Its status section
contradicts shipped 0.3.0+ reality (lesson store, eval fixtures, gates). README.md:406
links to `issues/candidate-at-bat-prd.md` which has already been moved to
`issues/done/`.

**Resolution:** Refresh the status section of `issues/prd.md` to match 0.3.0+ reality,
or move it to `issues/done/` with a successor pointer. The README link at README.md:406
must be checked and fixed if it points to a moved file.

### 00.5.3 `Specs/done/3.2-lesson-delta-implementation-plan.md` — wrong target repo

This implementation plan targets the external JavaScript repository
`/Users/marcus.kim/repositories/oss/zeroshot-lyo` (branch `lyo-integration`, local only).
`Specs/4.1-checkblindness-and-contract-small-fixes.md` treats its requirements as binding
on this repository's TypeScript port. The re-homing is undocumented.

**Resolution:** Either (a) rewrite the plan's target to this repository's TS port and
update all file paths, or (b) mark it superseded in place with a pointer to whatever
replaces it in this repo, or (c) move it to `Specs/done/` with a clear note that it is
the JS-draft plan and that the TS port's implementation plan is a separate document to be
written when that work is scoped. The JS draft must not be treated as the reference
implementation for the TS port (see 00.6).

### 00.5.4 README.md — stale links and missing entries

- README.md:406 links to `issues/candidate-at-bat-prd.md` — already moved to `issues/done/`.
- README.md describes the blind pipeline, learning loop, corpus sync, and `lyo eval` with
  no CHANGELOG entries past 0.3.0 for some documented features.
- README.md:354 defines `lesson` in a way that should be consistent with `Specs/3`'s
  definition; check for divergence.

**Resolution:** Fix the stale link. Catch CHANGELOG up to documented features. Verify
the README concept table is consistent with `Specs/3` and `Specs/2`.

### 00.5.5 Dry-run-only retraction never recorded

0.2.x's "dry-run only" posture was removed (commit `c92958e`) but never formally
retracted in any document. A reader encountering old documentation that says "LYO is
dry-run only" has no way to know it is stale.

**Resolution:** Record the retraction in CHANGELOG.md and in any document that still
carries the dry-run-only claim.

### 00.5.6 `Specs/0-spec-consolidation-and-cleanup.md` — superseded by this document

The prior consolidation document (`0-spec-consolidation-and-cleanup.md`) is superseded
by this document (`00-spec-consolidation.md`). The old file must be moved to
`Specs/done/` with a pointer to this document, or deleted if this document captures
everything it contained. Its content has been absorbed into §§00.1–00.5 above.

---

## 00.6 Language directive: consolidate toward TypeScript

### 00.6.1 The directive

Going forward, **TypeScript is the single implementation language for this
repository.** JavaScript artifacts are legacy and should be migrated, not extended.

This is not a big-bang rewrite. It is a direction for all future work:

- New source files, test files, and tooling are written in TypeScript (`.ts`),
  matching the existing `src/` convention (ESM TypeScript on `node:sqlite`, zero native
  deps).
- Existing `.js` test files under `tests/` and `.cjs` tooling under `dogfood/` are
  migrated **opportunistically**: when a file is touched for another reason, convert it
  to TypeScript at the same time. Do not create a separate migration project.
- The external `zeroshot-lyo` JavaScript repository (better-sqlite3, `.js` source) is a
  **draft lineage that has been superseded** by this repository's TypeScript port. It is
  not the reference implementation. Documents that treat the JS draft as authoritative
  (e.g. `Specs/done/3.2-lesson-delta-implementation-plan.md`) are stale (see 00.5.3).

### 00.6.2 Why this is stated in the meta spec

A language directive buried in a single code file is easy to miss. A language directive
in the meta spec is inherited by every spec that follows. Any spec that proposes new code
must be consistent with this directive. Any work item that touches a `.js` or `.cjs` file
must carry the migration in the same commit.

### 00.6.3 Where this directive is recorded

This section (00.6) is the canonical statement. It must also be present in a
contributor-facing document: either `README.md` (under ## Development) or `AGENTS.md`.
Adding it to both is acceptable; adding it to neither is not.

---

## 00.7 What this spec does not do

- It does not change any learning algorithm, gate math, or shipped behavior. The
  contradiction resolutions are documentation updates plus one additive schema migration.
- It does not merge or rewrite the aligned core doctrine documents. The aligned core
  (NormalizedAction / effect monoid / temporal predicates vocabulary; association as
  hypothesis generation; append-only evidence with derived beliefs; deterministic verifier
  never LLM; aggregate-only writer feedback; counters grounded in external validation)
  is out of scope for change.
- It does not do a wholesale JS→TS rewrite. Migration is opportunistic per 00.6.2.

---

## 00.8 Acceptance criteria

- [ ] Gate decision documented in `docs/superpowers/specs/2026-07-27-principled-map.md`
      (or a new decision doc); losing variants in `docs/cybernetic-association-learner.md`
      and `docs/future/agent-learning-control-plane-prd.md` marked superseded with pointers
- [ ] Propensity / decision-log schema migrated; `Specs/3` §3 DDL updated to match
      `Specs/3.1` §3.4
- [ ] Substrate mapping or separate-tracks declaration written (see 00.1.4)
- [ ] Four naming collisions disambiguated at their definition sites (see 00.2)
- [ ] `Specs/1-problem-library.org` filled or deleted; deletion recorded in CHANGELOG
- [ ] `issues/prd.md` status refreshed or moved to `issues/done/` with successor pointer
- [ ] README.md:406 link fixed; CHANGELOG caught up to documented features
- [ ] Dry-run-only retraction recorded in CHANGELOG and any remaining stale documents
- [ ] `Specs/done/3.2` marked superseded or re-homed to TS port with documented rationale
- [ ] `Specs/0-spec-consolidation-and-cleanup.md` moved to `Specs/done/` or deleted
- [ ] TypeScript directive (00.6) added to README.md or AGENTS.md
- [ ] Full suite passes: `npm test`; `npm run typecheck`
- [ ] Schema migration applies cleanly over an existing 0.3.0-era lesson store

---

## 00.9 Dependencies

None — this is the first item in the queue and precedes all other specs. Where a later
spec touches a document this spec rewrites or marks superseded (e.g. `Specs/4.3` and the
file-library quarantine rule; `Specs/4.4` and the injection cap), this spec's decisions
are the authority those specs rebind onto.

## 00.10 Files implicated

```
Specs/00-spec-consolidation.md              ← this document (create)
Specs/1-problem-library.org                 ← fill or delete
Specs/done/3.2-lesson-delta-implementation-plan.md  ← mark superseded or re-home
Specs/0-spec-consolidation-and-cleanup.md   ← move to done/ or delete
docs/superpowers/specs/2026-07-27-principled-map.md ← gate decision section
docs/cybernetic-association-learner.md      ← mark superseded gate variant
docs/future/agent-learning-control-plane-prd.md      ← mark superseded gate variant
docs/behavior-as-code.md                    ← scalar-credit tension note
docs/future/workspace-activation-spec.md    ← scalar-credit tension note
docs/future/preference-derived-budget-pressure-spec.md ← pointer from scalar docs
docs/turing-tape-model-for-lyo.md           ← "tape" disambiguation
docs/trace-effect-tape-spec.md              ← "tape" disambiguation
docs/future/learning-circulation-spec.md    ← "packet" disambiguation
docs/local-corpus-effect-algebra-spec.md    ← "packet" disambiguation
docs/learning-as-explanation-graph.md       ← substrate mapping (or separate-tracks declaration)
src/lyo/lesson-store.ts                     ← propensity schema migration
issues/prd.md                               ← refresh or move to issues/done/
README.md                                   ← fix link, add TS directive
CHANGELOG.md                                ← catch up, dry-run retraction
AGENTS.md                                   ← add TS directive (or confirm README has it)
Specs/3-lesson-delta-design.md              ← §3 DDL update, §11.5 pointer to 4.4
Specs/4.3-at-bat-risk-inputs-cost-and-quarantine.md ← file-library quarantine rule alignment
Specs/4.4-lesson-injection-cadence.md       ← already points here; no change required from this spec
docs/superpowers/specs/2026-08-04-lyo-workflow-mechanics.md ← injection cap pointer to 4.4
```
