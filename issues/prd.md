# LYO learning workflow PRD

Status: partial implementation; useful reusable coding benefit unproven.
Reconciled 2026-09-10 against `dd5f160` (`feat/scoped-session-findings`).
Follow-up `feat/session-finding-feedback` adds the ordinary-session review loop;
it is not yet installed or merged. The later `fix/finding-evidence-validation`
branch adds registered checks and evidence withdrawal while removing generalized
context exclusions inferred from individual task misfires.
See [Spec 8](../Specs/8-learning-evidence-loop.md) for measured acceptance and
[development status](../docs/development-status.md) for branch/rollout status.

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
| Evidence, provenance, confidence and review (22–25) | Retained receipts/report gates; registered finding evidence constrains validity with withdrawal and scope-review requests | Real useful outcomes, automatic trustworthy assessment, unified evidence semantics and qualified routine promotion |
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
| Context pack | Compact, applicable guidance with provenance | Lesson snapshots and three scoped findings deliver context; adaptive selection by validated benefit remains open |
| Policy | Choose an available intervention using outcome evidence | Native action estimates, revisions, freezing and registered evaluation exist; routine evidence-based promotion/rollback remains open |

A policy artifact is guidance to the execution host. It cannot grant permissions,
change a sandbox or approve destructive/external actions. Host/Shepherd owns those
decisions and workspace custody; see [the boundary](../docs/lyo-shepherd-boundary.md).

## Workflow and architecture

The current bounded path is:

```text
register task, source, verifier and budget
→ deliver a recorded action
→ host executes work
→ independent checks and usage produce a task receipt
→ retain feedback and freeze a policy or specific candidate
→ register a comparable later task
→ evaluate against baseline, including learning cost
```

An explicit derivation can inspect a retained repair, test removal/restoration and
propose advice for a trial. The recovery controller does not automatically invoke
that derivation. Ordinary session observations do not earn causal credit.
Three approved findings now reach scoped prompts; their future usefulness remains
unvalidated.

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
- [ ] Use validated outcomes for reversible routine promotion and rollback.
- [ ] Supersede invalid finalized measurements and recompute affected policies.
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
Before another live transfer test, enforce spend controls, freeze ambient guidance
and verifier edge cases, and separate execution time from approval waiting.
Automatic semantic selection or learned representations should be added only
when the simpler registered comparison establishes a useful intervention.

Out of scope: a replacement agent runtime, permission authority, hosted hiring or
SaaS workflows, full OS process capture, and unbounded autonomous experimentation.
Building all runtime adapters equally at once is not required.
