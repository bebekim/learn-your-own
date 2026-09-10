# LYO lesson delta: implemented contract and limits

State: partial (reviewed 2026-09-10)

The SQLite lesson library records proposals, applications and changes with
provenance. This is one learning substrate; it is not the complete PRD compiler.
This reconciliation replaces the obsolete v0.1 DDL and roadmap with links to the
implemented schema and current acceptance.

## Implemented

- [x] Lesson, delta and application persistence, idempotent application recording,
      replay and curation in [LessonStore](../src/lyo/storage/lesson-store.ts).
- [x] Candidate retrieval and Thompson selection, with sampled scores distinct
      from estimated inclusion propensities.
- [x] Decision records with candidate/posterior/propensity data, context and
      randomness metadata where supplied. Historical missing data stays missing.
- [x] Ratio-lift credit components and sparse-stratum uniform fallback in
      [credit](../src/lyo/credit/ratio-lift.ts), with
      [fidelity diagnostics](../src/lyo/credit/fidelity.ts).
- [x] Semantic prior and calibration/controller components; see
      [Spec 6](6-causal-discovery-framework-integration.md).
- [x] Runnable storage/selection/replay checks in
      [lesson-store tests](../tests/lyo-lesson-store.test.js) and
      [ratio-lift tests](../tests/lyo-ratio-lift.test.js).

Append-only provenance supports audit and replay. It is an engineering choice,
not a mathematical guarantee against loss of meaning. A lesson's explanation and
intervention are hypotheses; their presence in a structured row does not make
them identified causes.

## Existing status and credit semantics

`applyValidationOutcome` processes pending applications for a passed/failed run.
It records estimator and credit magnitude; sparse data can fall back to assigning
the run outcome to each application. Wilson rules activate candidates at n ≥ 8
and lower bound > 0.5, or quarantine at n ≥ 8 and upper bound < 0.45.

These are implemented legacy rules, **not a validated causal promotion gate**.
Multiple deliveries, task difficulty, weighted counts and fallback credit limit
their interpretation. The earlier claim that propensity logging alone supplies
causal identification is withdrawn. A Thompson draw is also not a selection
probability.

The file lesson library has different recurrence-based credit and quarantine
rules; see [Spec 4.2](4.2-credit-evidence-discipline.md). Native session observations
and scoped findings intentionally do not call the helpful/harmful update path.
The registered task report uses its own explicit comparison gate.

## Remaining acceptance

- [ ] Establish useful later-task benefit including total learning cost.
- [ ] Reconcile legacy observational counters with controlled evidence so
      status/ranking cannot be mistaken for validated usefulness.
- [ ] Support traceable correction of invalid finalized measurements and policy recomputation.
- [ ] Validate per-intervention and sequence credit instead of assuming attribution
      from a final run outcome.
- [ ] Connect explanation-graph inference and all PRD artifact types to this ledger,
      if later evidence justifies that added machinery.

Session delivery is documented in [Spec 7](7-session-telemetry-lesson-bridge.md).
Task derivation and transfer acceptance are in [Spec 8](8-learning-evidence-loop.md).
Embedding retrieval, learned addressing, hierarchical priors, federation and a
plan-shaped IR remain optional research/design directions, not implementation
prerequisites. LYO supplies evidence and guidance; execution authority remains
with the [host/Shepherd boundary](../docs/lyo-shepherd-boundary.md).
