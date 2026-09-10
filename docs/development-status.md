# LYO development status

Assessment: 2026-09-10. Audit baseline: `dd5f160`, reconciled in `557f9a3`.
Current increment: `feat/ordinary-finding-feedback`, package `0.4.3-adaptive.4`.

**We have implemented a bounded feedback, experiment and prompt-delivery workflow.
We have not demonstrated useful reusable coding learning.** Three evidence-linked
findings can reach future prompts; none has validated helpful/harmful outcomes.
The new [ordinary-session feedback path](scoped-session-findings.md) records
registered-check applicability, adherence and outcome, then revises validity
or requests scope review for subsequent work. It also supports versioned wording revisions and
explicit correction of prior reviews. No live outcomes were invented or backfilled.

The subsequent [D-3/D-2/D-1 audit](../evidence/finding-evidence-link-2026-09-10/assessment.md)
reproduced four gaps in that broader contract: unresolved evidence accepted as
support, task inapplicability generalized to a coarse context, repeated evidence
counted across deliveries, and corrected premises not propagated into derived
wording. [Spec 7](../Specs/7-session-telemetry-lesson-bridge.md) now defines the
required boundaries and TDD gates. The [evidence-validation fix](../evidence/finding-evidence-validation-2026-09-10/assessment.md)
now corrects these four runtime boundaries with registered checks, evidence binding,
task-local misfire handling and withdrawal propagation. The
[ordinary-session increment](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md)
adds fixed claim kinds, attributed semantic review, paired Codex/Claude action
capture, automatic assessment and durable review prompts/recovery. Independent
evaluator qualification, automatic contract preparation and scope generalization remain open.

## What is done

| Capability | Relevant code | Evidence boundary |
|---|---|---|
| Central collection and workspace connection | [Corpus sync](../src/corpus/sync.ts), [workspace sync](../src/corpus/workspace-sync.ts) | Data accumulation enables analysis; it is not a learning outcome |
| Codex/Claude native recovery feedback | [Native controller](../src/lyo/control/native-feedback.ts) | Persistent decisions, propensities, feedback and revisions; unknown checks remain unknown |
| Task acceptance, regression and cost receipts | [Task evidence](../src/lyo/control/task-evidence.ts), [task runner](../src/lyo/control/task-run.ts) | Criteria/source/verifier declared before work; task acceptance separate from retry success |
| Registered later-policy comparisons | [Task feedback](../src/lyo/control/task-feedback.ts), [task report](../src/eval/task-report.ts), [evaluation gate](../src/eval/report.ts) | Explicit freezing and trial use; no automatic daily promotion |
| Specific candidate derivation | [Task intervention](../src/lyo/control/task-intervention.ts) | Retained reflection, failed-analysis reuse, repair removal/restoration and trial registration |
| Session observations and scoped prompt findings | [Session bridge](../src/lyo/bridge/session-bridge.ts), [session hook](../src/lyo/selection/session-hook.ts), [finding feedback](../src/lyo/selection/session-findings.ts) | Registered evidence drives validity; misfires request scope review; withdrawal suspends dependent advice; no automatic scope widening |
| Descriptive measurement | [Prompt report](../src/measurement/prompt-kind.ts), [episodes](../src/measurement/episodes.ts) | Classification/grouping priors and spend summaries are not calibrated usefulness or waste measures |

The [task workflow](task-feedback-cycle.md) connects declared work → native delivery
→ host execution → independent acceptance/regression checks and usage → persistent
feedback → frozen policy/candidate → later comparison. Registered tasks suppress
the proxy recovery experiment. Exploration remains randomized; using a measured
frozen revision for evaluation is explicit.

Codex and Claude support the adaptive native path. The live registered coding
pilot used Codex; Claude also has task contract tests. ECA/MLX and IBM Bob capture
telemetry; ECA delivers session lessons. They do not yet share this adaptive task
experiment. MLX is observed through its host. Go needs a separate domain adapter.

## What the evidence says

The [current acceptance ledger](../Specs/8-learning-evidence-loop.md) contains the
complete experiment comparison and cost scopes. Its key results are:

- Corrected SemVer: 0/8 successes in each condition; inconclusive.
- Syntax calibration: a frozen policy improved the narrow supplied task; this
  demonstrated the feedback path, not general coding transfer.
- Source repair: removal/restoration reproduced fail/pass/same-fail/pass.
- Cross-repository transfer: one pair, both passed frozen checks, guided arm used
  6.5% more tokens; both exceeded allowances. A post-hoc Unicode audit exposed
  a guided-arm failure. Candidate parked, no promotion or further runs.
- Scoped finding delivery: three approved observations delivered in hook
  simulations, with evidence and unvalidated-usefulness labels. Future benefit
  remains unmeasured.

The transfer candidate, source and evaluation cost 767,184 tokens before the
separate multi-million-token orchestration/implementation checkpoints.
Zero validated useful coding interventions means there is no finite useful
tokens-per-intervention ratio yet. Counts of candidates/findings cannot fill
that denominator.

The preceding session-finding-feedback increment passed 627 tests with one sandbox skip,
typecheck and built-executable feedback checks. Eleven new behavioral tests exercise
later support, context exclusion, content contradiction, correction, versioning,
CLI delivery, alias handling, inherited scope evidence and malformed-history isolation. These establish the
mechanism; real positive future-task results remain unmeasured.

The preceding evidence-validation fix passed 637 tests with zero failures and one
sandbox localhost bind skip, plus typecheck. Its four audit regressions and built
package workflow pass. [Validation and boundaries](../evidence/finding-evidence-validation-2026-09-10/assessment.md)
retain the exact scope: registered evaluator execution and evidence integrity,
not qualified semantic assessment or measured agent benefit.
After the test-file split, 27 focused checks and typecheck pass. That increment's Opcore
check passed with zero errors and 12 retained warnings; no rules were relaxed.

That increment's Opcore changed-code check passed with no errors. Eight warnings were retained: four
generated-package import graph edges, complexity in feedback recording and hook
emission, and length in CLI help and the package lifecycle test. No checks were
suppressed. The new TypeScript test is included in the configured typecheck.

The previous retained validation records 616 passing tests and one sandbox
localhost skip. After the final session-marker fix, seven focused hook/package
tests and typecheck passed. Package build/local installation and configured-hook
simulations passed. These are retained checks, not new test runs for this
documentation audit. [Validation and rollout](../evidence/scoped-session-findings-2026-09-10/assessment.md)
also retain the complexity warning and four Ripwire historical-churn findings;
they were not suppressed.

The ordinary-session increment passes 648 tests with one sandbox skip and no
failures (two test workers), final typecheck, and the built/configured-command
probes. After package-fixture consolidation, eight focused checks pass. Opcore
passes with 14 warnings and no errors. These establish the execution and review
delivery path, including retained-evidence review from a different repository;
they do not establish useful learning. [Detailed evidence](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md).

## What remains

| Priority | Work | Completion criterion |
|---|---|---|
| 1 | Validate and refine ordinary-work learning | Obtain real reviewed outcomes; use them to revise learning versus context, then test broader applicability while preserving supported narrower scopes |
| 2 | Establish useful transfer and connect qualified results to routine selection | Independent later tasks show benefit including learning cost; failed/inconclusive results cannot promote; rollout can be reversed |
| 3 | Reconcile legacy credit and corrected task evidence | Finding reviews can now be superseded; legacy counters and finalized task measurements still need consistent correction/promotion semantics |
| 4 | Complete architecture separation | Host measurement, lifecycle, policy, persistence and formatting have clear boundaries with behavior preserved |
| 5 | Extend adapters | ECA/MLX, Bob and Go complete domain-appropriate observation/action/evaluation loops |
| Deferred | General learning compiler | Five artifact types, learned applicability, explanation graphs and sequence credit establish value beyond existing components |

Experiment controls, including spending limits, ambient guidance and verifier
coverage, remain necessary constraints. They are not the leading learning objective.

The older file-library recurrence counters and SQLite sparse-data fallback still
exist. Their status/ranking semantics are a development risk, described in
[Spec 4.2](../Specs/4.2-credit-evidence-discipline.md). The three small contract/store
fixes in [Spec 4.1](../Specs/4.1-checkblindness-and-contract-small-fixes.md) also remain open.

## Branches and rollout

At audit time, main was `5759cc8`. The native feedback/task/intervention work
continues across feature worktrees, culminating in `dd5f160`; this audit does not
merge them. Locally installed CLI/hooks now use `lyo-kernel@0.4.3-adaptive.4`. The
[rollout record](../evidence/ordinary-finding-feedback-2026-09-10/assessment.md) records
the installed artifact and configured-command checks. This is not an npm-registry
publication claim; no real usefulness outcomes were backfilled.

Historical release `v0.4.2` and its retained CI/package evidence predate these
increments. Current branch reconciliation, merge/test gates and registry publication
remain separate delivery work. The [spec map](../Specs/README.md) and
[PRD](../issues/prd.md) now distinguish that state from product completion.
