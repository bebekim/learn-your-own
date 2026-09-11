# LYO learning workflow PRD

Status: partial implementation; useful reusable coding benefit unproven.
Reconciled 2026-09-11 against main `f39ed6c`, source `0.4.3-adaptive.8`.
Registered finding evidence, ordinary Codex/Claude trials, scoped policy updates
and turn/compaction refresh are implemented. A reviewed trigger and evaluator are
still required before ordinary work can supply meaningful trial outcomes.
See [Spec 8](../Specs/8-learning-evidence-loop.md) for measured acceptance and
[development status](../docs/development-status.md) for implementation and rollout.

## Problem and intended outcome

Agent telemetry records work but does not by itself improve the next task.
LYO should identify a specific intervention, deliver it when applicable, measure
independent outcomes, and revise future decisions from that evidence. Tasks can
move between repositories; useful learning must transfer by task conditions, not
depend on revisiting the same ticket.

The product objective is equal or better accepted work with fewer regressions
and acceptable total time/token cost, including learning itself. Lesson count,
prompt delivery, verifier recovery and session brevity are insufficient evidence.
The same feedback architecture should eventually support coding and baduk/Go,
with domain-specific observations, legal actions and evaluators.

## Ambition compared with implementation

| Requirement (original user stories) | Current state | Gap |
|---|---|---|
| Task families, attempts, milestones and verifier criteria (1–5) | Partial: registered tasks, acceptance/regression commands, frozen source/verifier identities | General milestone curriculum and automatic task-family inference |
| Capture and compile existing work (6–8, 34–35) | Implemented telemetry normalization, effects, episodes, central sync and read-side analysis | Missing historical outcomes/usage cannot be reconstructed as facts |
| Infer purpose, preconditions, threats and failure structure (9–12) | Partial: deterministic classifications and dry-run semantic components | Validated learned interpretations and integrated artifact generation |
| Produce procedures, critics, verifiers, context packs and policy (13–21) | Partial; artifact-by-artifact scope below | Integrated compiler for all five types |
| Evidence, provenance, confidence and review (22–25) | Retained receipts/report gates; registered finding evidence constrains validity with withdrawal and scope-review requests | Real useful outcomes, automatic trustworthy evaluator preparation and unified evidence semantics |
| Applicable replay and delivery explanation (26–28) | Scoped guidance; explicit trials; checked later outcomes suppress contradicted findings or request scope review | Learned cross-repository applicability, broader-scope trials and automatic selection of useful interventions |
| Compare quality, cost and learning delta (29–33) | Frozen comparisons, known/unknown outcomes, regression and cost reports | Demonstrated useful transfer and all-in spend enforcement |
| Bounded modules, typed contracts, durable state, deterministic checks and CLI (36–41) | Many components and task CLI implemented | Complete controller separation and compiler-to-artifact integration |
| Optional autonomous improvement (42) | Deferred | Requires qualified evidence, bounded execution and reversible policy changes |

All earlier user-story groups remain represented above. Historical release
inventories and a mandatory database-from-scratch first benchmark are removed:
a benchmark is an experimental choice, not the product acceptance criterion.

## Five artifact types remain the target

| Artifact | Intended behavior | Implemented scope / remaining work |
|---|---|---|
| Procedure | Reusable steps with purpose, preconditions and checks | Trace/episode and draft components exist; no validated general procedure compiler/replay loop |
| Critic | A scoped intervention that catches a specific mistake earlier | Candidate lesson generation, local repair checks and one later transfer screen exist; useful transfer failed to establish |
| Verifier | An independent check with identity, scope and evidence | Registered/frozen checks and source mechanism tests exist; automatic extraction and validation of new verifiers remain partial |
| Context pack | Compact, applicable guidance with provenance | Versioned scoped findings and lesson snapshots refresh at host boundaries; benefit-driven delivery is bounded to reviewed ordinary trials |
| Policy | Choose an available intervention using outcome evidence | Reviewed ordinary trials can promote, pause and recompute scoped delivery; useful real-task effects and broader applicability remain unproven |

A policy artifact is guidance to the execution host. It cannot grant permissions,
change a sandbox or approve destructive/external actions. Host/Shepherd owns those
decisions and workspace custody; see [the boundary](../docs/lyo-shepherd-boundary.md).

## Workflow and architecture

The ordinary-session path is:

```text
review finding, reusable trigger, scope and evaluator
→ matching Codex/Claude task creates a prospective opportunity
→ assign advice or no added advice before the next action
→ capture paired action and declared outcome, retaining unknowns
→ reconcile the fixed comparison and record a scoped policy
→ deliver, withhold or pause in later eligible sessions
→ recheck later outcomes and corrected evidence
```

A separate explicit task workflow registers tasks, acceptance/regression checks,
source and verifier fingerprints, budgets and comparable attempts. It can derive
advice from a retained repair and test removal/restoration. The recovery controller
does not automatically invoke that derivation. Neither ordinary observations nor
repeated prompt refresh earn causal credit. Meaningful evaluator preparation and
semantic review remain explicit; the system does not discover a trustworthy
intervention and its evaluator from arbitrary telemetry by itself.

The five architectural responsibilities remain benchmark/task definition,
telemetry, learning, replay/delivery and evaluation. The durable kernel stores
evidence and state transitions. Normalization/effect analysis consumes raw host
events; model-assisted interpretation proposes candidates; deterministic contracts
check those proposals. Independent task evaluation judges measured work.
The task launcher is an explicit experiment utility outside the kernel.

Explanation-graph and plan-shaped IR work remain deferred integration designs,
not prerequisites for the next feedback experiment. The current controller still
concentrates host measurement, turn lifecycle, policy selection, persistence and
formatting in `native-feedback.ts`; the architecture refactor is incomplete.

## Acceptance

- [x] Record real native work centrally and retain decision/outcome identity.
- [x] Distinguish observed recovery from independently measured task acceptance.
- [x] Register comparable attempts and freeze verifier, policy/candidate and budget.
- [x] Retain negative/inconclusive results, missing evidence and learning costs.
- [x] Deliver scoped guidance and record which later session/attempt received it.
- [x] Feed checked later finding reviews into validity, scope-review requests and
      versioned content revisions; preserve withdrawn, corrected and late evidence.
- [ ] Demonstrate an intervention improves independent later accepted work without
      unacceptable regressions or total learning cost.
- [ ] Enforce the declared all-in spend allowance while execution is running.
- [x] Connect registered ordinary-trial comparisons to scoped promotion, later
      pause and evidence-correction recomputation; useful real-task effect unproven.
- [x] Withdraw ordinary finding measurements and recompute affected delivery policies.
- [ ] Extend correction to invalid finalized measurements in the separate task workflow.
- [ ] Complete general applicability, five-artifact integration and sequence credit.
- [ ] Extend the adaptive experiment to ECA/MLX, IBM Bob and a Go adapter.

The current experiments establish the machinery and a local repair mechanism.
They establish **zero validated useful reusable coding interventions**.
The specific transfer screen was stopped after an inconclusive, over-budget pair;
the guided arm used more tokens and missed a post-hoc Unicode edge case.
All measured results and cost scopes are in [Spec 8](../Specs/8-learning-evidence-loop.md).

## Verification and scope

Use TDD for runtime increments: external behavior through temporary ledgers,
retained host fixtures, actual subprocess checks, independent verifiers and
known/unknown result handling. Tests of delivery or estimator arithmetic establish
contracts; product benefit requires controlled later-task evidence.

The next priority is real ordinary-session validation and evidence-driven
applicability revision/generalization through the [finding workflow](../docs/scoped-session-findings.md).
Before another live transfer test, freeze meaningful evaluator coverage and ambient
guidance, set and observe spend limits, and separate execution from approval waiting.
Automatic semantic selection or learned representations should be added only
when the simpler registered comparison establishes a useful intervention.

Out of scope: a replacement agent runtime, permission authority, hosted hiring or
SaaS workflows, full OS process capture, and unbounded autonomous experimentation.
Building all runtime adapters equally at once is not required.
