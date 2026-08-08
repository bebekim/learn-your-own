# LYO Workflow and Mechanics

Date: 2026-08-04
Status: as-built documentation
Companion to: blind-pipeline-runner.md (execution), principled-map.md (learning mechanics)

## The two tracks

**Execution track** (per task): human authors `spec.json` → `plan.json` binds
stages (code-writer / test-writer / verifier) with per-stage authority and
executor models → `checkBlindness` statically refuses violations → sandboxes
materialize with declared reads only → writers run in parallel, blind →
manifests hashed → deterministic verifier runs frozen tests on the merged
tree → optional aggregate-only feedback rounds → `trace.json` records
everything.

**Learning track** (per batch of runs): `pipeline learn` loads run dirs →
extracts disagreements → classifies them (mechanical first, LLM judge for the
residue) → gates promotions on sequential evidence → installs lessons into
the library → next run's prompts get Thompson-selected lessons → outcomes
flow back as credit → posteriors and demotions update.

## Recording

Three surfaces, all content-hashed:

- **Run dirs** (`runs/<id>/`): the seven artifacts — plan, spec, code/test
  manifests, verifier-report, trace, lyo-update — plus per-round transcripts
  (`transcript.round-N.txt`), file snapshots (`files.round-N/`), raw TAP
  output (`verify-tap/`). Every round fully reconstructible; failed stages
  leave their transcripts behind.
- **Session ledgers**: hooks in all five harnesses (kimi / codex / gemini /
  agy / dcode) spool events to `.agent-learning/hook-spool/`, drained into
  per-repo `learning.sqlite` (global `agy.sqlite` for agy) on Stop/SessionEnd.
- **The trace** (`lyo.trace.v1`): per-stage, per-round records — model,
  prompt sha256, input/output artifact refs, token usage + USD cost, timings,
  and feedback summary (rounds, stop reason). The prompt hash makes every
  delivered lesson attributable.

## What determines verifiable and false

Four deciders, in increasing subtlety:

1. **The verifier** — never an LLM. `node --test` on the merged tree; TAP
   gives counts and per-test verdicts. Code correctness is machine-decided
   or undecided, never vibes.
2. **Mechanical classifier** (`classifyMechanically`,
   `src/lyo/mechanical-judge.ts`) — signature rules for machine-decidable
   failures: test-code ReferenceError/SyntaxError, ESM/CJS mismatch, the
   `-0`/Object.is trap. Free, consistent, zero judge spend.
3. **The LLM judge** — a third model family (currently claude-sonnet-5) that
   sees everything (spec, code, tests, TAP) and classifies semantic
   disagreements: `code-bug | test-hallucination | spec-gap`, with quoted
   evidence and a transferable lesson. Reserved for what machines can't decide.
4. **Falsifiability** — a lesson must name the observation that would prove
   it wrong (`falsifiable_by`), or it is recorded as `undeliverable` and
   never delivered. An arm must be able to pay out.

The asymmetry is deliberate: *verification* (did the code pass) is fully
deterministic; *judgment* (whose fault is the disagreement) is
mechanical-first, LLM-second.

## Promotion and demotion

**Promote (trust):** group judgments by classification across runs;
accumulate sequential likelihood-ratio evidence — each recurrence is
`+log(p1/p0)`, each clean run (same spec + writer model, zero disagreements
of the class) is a negative observation; promote when `E > 1/α` (α = tolerated
false-promotion rate: 0.1 permissive / 0.05 strict), plus `minSpecs` as the
scope decision. Promoted lessons install into the library as files with
classification, vehicle, falsifiability, and helpful/harmful counters.

**Deliver (try):** Thompson sampling over `Beta(helpful+1, harmful+1)` per
lesson, role-routed (test lessons → test-writer only; code lessons →
code-writer only; spec-gap lessons to no stage), capped at 3 per role,
vehicle-compiled (prose title / skeleton-patch / spec-constraint).

**Demote:** outcomes return as credit — the class recurred despite the lesson
(harmful) or was expected but absent (helpful). Counters accumulate on the
artifact itself (`recordLessonOutcome`); `harmful ≥ 2 ∧ helpful == 0`
excludes a lesson from selection entirely (`isDemoted`). Weaken events feed
the evidence arithmetic both ways: clean runs pull E down, so a lesson that
stops being true loses both its delivery odds and its trust standing.

## The one-line summary

Runs are evidence, artifacts are beliefs, evidence outranks belief, and
nothing is trusted that can't be wrong.
