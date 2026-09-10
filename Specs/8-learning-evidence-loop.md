# Learning evidence loop

State: partial — feedback and delivery implemented; useful transfer unproven (2026-09-10)
Audit baseline: `dd5f160`; local package `0.4.3-adaptive.3`.
Follow-up: `fix/finding-evidence-validation` is unreleased; see Spec 7.

## Product acceptance

An intervention must improve verified work on comparable later tasks, including
the cost of acquiring, generating, delivering and evaluating it. A passing retry,
a saved lesson or a delivery receipt does not satisfy this requirement.
The intended loop is observation → candidate → scoped intervention → independent
outcome → comparison → policy revision. The implementation closes bounded versions
of that loop; routine useful learning remains unproved.

## Implementation and acceptance

| Requirement | Status | Relevant implementation / check |
|---|---|---|
| Collect repository/session evidence centrally | Done | [Corpus sync](../src/corpus/sync.ts), [workspace sync](../src/corpus/workspace-sync.ts), [tests](../tests/workspace-sync.test.ts) |
| Record native decisions, propensities, feedback and revisions | Done for Codex/Claude experiment | [Native controller](../src/lyo/control/native-feedback.ts), [tests](../tests/native-feedback.test.ts) |
| Separate task acceptance from recovery; preserve unknown outcomes/cost | Done | [Task evidence](../src/lyo/control/task-evidence.ts), [evidence tests](../tests/task-feedback-evidence.test.js) |
| Register tasks, verify acceptance/regressions, freeze policy, compare later tasks | Done, experimental | [Task feedback](../src/lyo/control/task-feedback.ts), [task report](../src/eval/task-report.ts), [workflow](../docs/task-feedback-cycle.md) |
| Derive advice from a retained failure/repair; test removal/restoration | Done, experimental | [Task intervention](../src/lyo/control/task-intervention.ts), [tests](../tests/task-intervention.test.js) |
| Freeze a trial budget and reject over-budget results | Done after execution | [Task workflow](../docs/task-feedback-cycle.md); this does not stop provider spend |
| Deliver scoped findings with evidence and no automatic credit | Done | [Session hook](../src/lyo/selection/session-hook.ts), [delivery tests](../tests/lyo-session-hook.test.js), [Spec 7](7-session-telemetry-lesson-bridge.md) |
| Reject unsupported promotion from incomplete/incomparable evidence | Done in controlled report path | [Evaluation gate](../src/eval/report.ts), [tests](../tests/eval-report.test.ts); legacy paths differ (Spec 4.2) |
| Revise ordinary finding delivery from later reviewed outcomes | Done, bounded review path | [Finding feedback](../src/lyo/selection/session-findings.ts), [Spec 7](7-session-telemetry-lesson-bridge.md): registered checks, task-local scope-review requests, content suspension and evidence withdrawal |
| Demonstrate useful cross-repository coding transfer including learning cost | **Open** | No validated reusable coding intervention benefit in retained experiments |
| Enforce all-in spend limits while work is running | **Open** | Source, reflection, task and orchestration costs need a common enforced limit |
| Correct finalized evidence and recompute affected policies | **Open** | Feedback revisions exist; invalid finalized task measurements cannot yet be superseded |
| Promote/rollback routine interventions from validated task outcomes | **Open** | Experimental freezing/reporting does not deploy a production policy |
| Integrate all five PRD artifact types, sequence credit and Go | **Deferred** | Components/designs exist; complete compiler and Go evaluator do not |

## Measured evidence

| Experiment | Result | What it establishes |
|---|---|---|
| [Corrected SemVer screen](../evidence/learning-loop-2026-09-08-r2/assessment.md) | 0/8 successes in each condition; inconclusive | The evaluation can retain a negative result |
| [Adaptive calibration](../evidence/adaptive-feedback-2026-09-09/assessment.md) | 32 randomized training executions; 12 later inputs; fixed baseline 6 vs learned 12 conversions | Controlled path calibration on a narrow syntax task |
| [Registered coding pilot](../evidence/native-task-cycle-2026-09-09/assessment.md) | Real tasks and native receipts; inconclusive | The task workflow connects to the central ledger |
| [Source mechanism check](../evidence/native-task-intervention-2026-09-10/assessment.md) | Fail/pass/same-fail/pass under repair removal/restoration | A local source repair mattered to the source verifier |
| [Specific transfer screen](../evidence/specific-lesson-transfer-2026-09-10/assessment.md) | Both arms passed frozen checks; guided arm used 6.5% more tokens; post-hoc Unicode audit exposed a guided-arm failure | One pair, incomplete verifier coverage, failed budget screen; candidate parked |
| [Scoped finding rollout](../evidence/scoped-session-findings-2026-09-10/assessment.md) | Three findings delivered in configured-hook simulations; zero credit | Prompt delivery works; future helpfulness/harmfulness is unvalidated |

The transfer screen recorded 767,184 source, learning and evaluation tokens.
Its separate implementation/orchestration checkpoint recorded 7,198,984 additional
tokens. The later finding-delivery increment recorded another 4,730,631-token
checkpoint. These include cached input, have distinct scopes and are not a complete
project spend total or dollar estimate. Validated useful coding interventions from
this work: **zero**, so no finite tokens-per-validated-useful-intervention ratio can
yet be reported. See [Spec 5](5-scoring-layer.md).

## Next acceptance increment

The primary objective is validation → ordinary workflow insertion → later positive
results → tested generalization, with counterexamples revising either the learning
or its scope. Cost remains a constraint, not the leading objective.

- [ ] Obtain real ordinary-session outcome reviews through the implemented finding
      feedback path and establish improved subsequent work.
- [ ] Refine applicability beyond repository/activity/trigger context and test
      broader scopes while preserving supported narrower scopes.
- [ ] Automate trustworthy outcome/adherence/applicability assessment from host
      evidence; the current path requires an explicit reviewer/evaluator judgment.
- [ ] Enforce the declared experiment spend limit before and during execution,
      including orchestration and reflection, and retain interrupted outcomes.
- [ ] Freeze verifier edge cases and ambient guidance; separate execution time
      from approval waiting before authorizing another transfer test.
- [ ] Show an intervention helps independent later tasks at acceptable total cost.
      Unknown acceptance, missing usage, regressions or an inconclusive comparison
      must remain visible.
- [ ] Connect validated results to reversible routine selection and promotion.

The earlier session-efficiency credit proposal is withdrawn. Legacy hook events
without numeric exit status cannot be backfilled into verifier-based outcome credit.
The full five-artifact/compiler ambition in the [PRD](../issues/prd.md) remains open.
