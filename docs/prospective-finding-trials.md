# Prospective finding trials

An opportunity exists before deciding whether to deliver a finding. This allows the ordinary workflow without added advice to supply an outcome without inventing a delivery receipt.

## Evidence boundary

`finding register` accepts either the existing `deliveryId` or a `prospective` object containing `sessionId`, `trialId`, `model`, `findingVersion`, and `context`. These forms are mutually exclusive. The prospective form requires paired live action capture and retains the same source files, verifier files, eligibility check, and adherence-before check used by existing finding evidence. The action must match the current finding version. Neither registration nor assignment proves that advice reached the model.

An attributed semantic review qualifies the evaluator. `finding assign --opportunity-id <id>` then records a 50/50 advice/no-advice assignment. Retrying that command returns the original decision. A trial cannot enroll the same session twice or enroll it after the finding has been delivered there. Assignment and delivery must precede the captured action. Changed source, changed verifier, or suspended finding prevents a new decision.

The delivery adapter calls `emitFindingOpportunity` only after assignment. The no-advice arm emits nothing and creates no delivery receipt. A successful emission records the exact finding version. A receipt establishes emission, not attention or adherence. An I/O failure between emission and durable receipt remains a delivery uncertainty; it is not evidence of benefit.

Both arms use the same predeclared prediction check. `observedOutcome` records pass/fail/unknown independently of adherence; `outcome` retains the existing, stricter deterministic claim-support meaning. Without an actual delivery, a passing result cannot award lesson support. An assignment without delivery remains an assigned-but-undelivered observation rather than silently becoming a control. A withdrawn or semantically disputed measurement becomes unknown on reinspection.

Prospective observations without delivery are inspectable through `finding inspect`. They are omitted from agent-facing review prompts to avoid exposing withheld advice through a review request.

## Implemented increments

1. `feat/finding-opportunities`: prospective records, assignment, delivery, paired measurement, and compatibility with existing validity evidence.
2. `feat/ordinary-lesson-trials`: implemented reusable reviewed trigger/evaluator configuration and automatic opportunity recognition/capture in Codex/Claude hook boundaries.
3. `feat/finding-policy-feedback`: implemented a fixed prospective comparison, traceable scoped decisions, later delivery consuming those decisions, and evidence correction.

An individual receipt's `incrementalBenefit` remains unknown: it cannot reveal its own counterfactual. Comparative evidence lives in `finding trial-report`. Existing task-pair comparisons still require identical task fingerprints; arbitrary new tasks are not relabeled as those pairs. Token cost is a diagnostic, not a substitute for useful outcomes.

Completion requires a real chain from opportunity through outcome and revision to a later session using the revision, followed by another observation. Synthetic tests establish implementation behavior only. A complete loop can conclude that a lesson is unhelpful; evidence of useful learning requires improved later outcomes.

## Ordinary-session adapter

Register a reviewed definition once with `lyo finding trial-register --input trial.json --store <central-lessons.db>`; inspect definitions with `lyo finding trials --store <central-lessons.db>`. This is configuration of a reusable mechanism and evaluator, not per-ticket registration. See [the strict schema](../src/lyo/interface/finding-trials.ts) and [a synthetic fixture](../tests/helpers/finding-trial-fixture.ts).

A definition fixes the finding version, repository roots, model, exact diagnostic tool/input, source paths relative to each workspace, absolute verifier paths, claim/checks, and attributed semantic review. A non-interrupted failure of that diagnostic creates a prospective opportunity; a checked precondition must still pass before random assignment. Missing model identity, changed verifiers, and suspended/revised findings cannot enroll. The opportunity retains the definition hash and triggering tool identity/hashes. An ineligible registration remains unassigned and inspectable; it contributes no comparative result.

Hosts may report the model only at session start. LYO retains that observation with its runtime and session identity and uses it when later events omit the field; it never substitutes a configured default for an unobserved model. A model change reported at the measured action makes that outcome unknown for the old model. Unreported host/model changes remain a limitation of the available observations. One ordinary trial owns a host session, including when another finding's trigger matches later.

The advice is returned as host hook context after the diagnostic, before the agent chooses its next action. This does not modify a system prompt or rewrite an already dispatched tool call. The first later tool call of the declared name is bound by its actual input and call ID at pre/post boundaries. The same evaluator measures either arm. A missing, interrupted, or mismatched action remains unknown. Repeated tool hooks do not rerandomize or duplicate the original emission. Compaction/resume refresh can deliberately re-emit still-pending advice, as described below; spool replay cannot discover a trial in hindsight.

The trial controller owns delivery for registered findings, suppressing their ordinary banners and agent-facing review requests. An enrolled session also skips the separate native recovery intervention. Operators retain `finding inspect` and legacy `finding pending` access. No live definition has been enabled by the implementation tests; a production trial needs a real reviewed trigger and outcome evaluator. A copied review remains the original reviewer's assertion about that unchanged evaluator, not a new independent semantic judgment.

## Outcome to later delivery

Add a declared `runtime` and `evaluation: { sampleSize, minimumEffect, alpha, assumptions }` when registering a comparative trial. Sample size and the minimum worthwhile increase in outcome probability are chosen before any assignments; `alpha` is the trial's error allowance (at most 0.1). A definition without an evaluation plan can collect observations but cannot promote. Definitions are immutable: changing the contract requires a new ID.

The observation window is the next matching tool action or the next `UserPromptSubmit`, `Stop`, or `SessionEnd`, whichever closes first. The latter boundaries close missing evidence as unknown. No later action can fill that closed window. A session that produces neither an action nor an end boundary remains pending and prevents a completed-cohort decision; elapsed time alone is not an observed failure.

`lyo finding trial-report --trial-id <id> --store <central-lessons.db>` rechecks the retained evidence and records a policy revision when it changes. The same reconciliation runs automatically in ordinary hooks. The policy states are:

| State | Later eligible sessions |
| --- | --- |
| collecting | Randomized 50/50 advice versus no added advice, until the fixed sample is assigned. |
| awaiting-outcomes | Withhold advice while the fixed cohort's windows are unfinished. |
| promoted | Deliver advice, with probability 1 recorded, and continue measuring later applications. |
| harmful / inconclusive | Withhold; the declared comparison did not justify continued delivery. |
| needs-review | Withhold after a promoted application has a failed or unknown closed outcome. |
| suspended / superseded | Stop the old contract; current finding/verifier/replacement gates take precedence. |

Promotion requires a conservative interval for the average assigned-advice effect to lie above `minimumEffect`. For independent fair assignments, each contribution is `Z = 2*A*Y - 2*(1-A)*Y`, with binary outcome `Y` and advice assignment `A`. Its range is `[-2, 2]`; applying [Hoeffding's bounded-sum inequality](https://www.cs.rpi.edu/academics/courses/spring06/random/hoefding.pdf) gives radius `sqrt(8*log(2/alpha)/N)`. Unknown outcomes are assigned both worst- and best-case values to widen the interval. All randomized assignments stay in the denominator, including emitted advice that was not followed or whose delivery is uncertain. The fixed cohort is assessed only after its windows close. Later probability-1 observations are monitoring evidence and are excluded from this randomized estimate.

`evaluation.method: "exact-binomial"` replaces that interval with exact unconditional bounds on the difference in pass rates between the arms (a Barnard-type test ordered by the observed difference, maximised over the nuisance pass rate). Each bound uses `alpha/2`, matching the two-sided allowance above, and unknown outcomes again take their worst and best cases. The promotion and harm rules are unchanged. The test uses the observed counts rather than the worst-case range of each contribution, so it needs far fewer assignments. At `alpha = 0.1` with 80% power, a pass-rate increase from 50% to 80% needs about 72 assignments instead of 352 against zero, and about 160 instead of 828 against `minimumEffect = 0.1`. The added assumption is that outcomes are independent within and between arms, rather than only that assignments are fair. This method allows at most 1000 assignments. An absent `method` means Hoeffding, so existing definitions keep their registered meaning.

`enrollment: { unit: "session", maxPerRepository }` lets each repository contribute up to that many randomized sessions instead of one. Such trials must use `evaluation.method: "stratified-exact"`: an exact stratified randomization test (exact Cochran–Mantel–Haenszel) that compares advice and no-advice sessions only within each repository, then combines the repositories. Conditional on each repository's arm sizes, its validity rests on fair assignment alone, so sessions from one repository may be arbitrarily alike. The test checks for no effect, so it requires `minimumEffect: 0`. Promotion means the advised sessions passed more often than "no effect" plausibly explains, at `alpha/2`; it does not bound the effect's size, and the record reports `pValues` instead of `effectInterval`. Unknown outcomes count against the advice for the benefit test and for it in the harm test. In simulation at `alpha = 0.1`, a 30-point pass-rate increase was detected with about 80% power from 80 sessions across only two to four repositories with different baselines.

The substantive assumption is **no interference**: advice delivered in one session must not change another session's outcome. An advised session that edits shared files, such as AGENTS.md, or a person who remembers the advice, violates it. The per-repository cap limits how much one repository can contribute. The cap applies only while the cohort is collecting; after a decision, capped repositories still receive the promoted or withheld delivery.

This estimates an effect on the **declared proximal check**, not automatically ticket acceptance, fewer regressions, or general competence. The design is informed by the separation of decision points and proximal outcomes in [micro-randomized trials](https://pmc.ncbi.nlm.nih.gov/articles/PMC9276848/). Independence, outcome meaning, and lack of cross-task interference remain substantive assumptions for the reviewer. One Git common directory (or real directory outside Git) can enroll only once per trial, which also prevents worktree duplicates. Known prior delivery and literal duplicate library advice are guarded; undisclosed external advice and semantic paraphrases cannot be ruled out by these receipts. The error allowance applies to one declared trial, not an unlimited search over new trials.

A failed later application is grounds to pause that delivery scope, not proof that advice caused the failure or that its wording is false. Inspect its existing applicability/adherence/semantic evidence before deciding which contract to change. A replacement definition uses `supersedes: <old-trial-id>` and newly reviewed conditions or roots; old successful outcomes do not transfer into its sample. An actual content correction continues to use the existing `finding revise` chain, followed by a new trial bound to that finding version. LYO automatically revises **delivery eligibility**; it does not invent and validate replacement wording from a failure by itself.

Withdrawals or disputed semantics change the resolved evidence hash. Subsequent reconciliation can revoke promotion immediately; the next assignment and emission also check their policy's evidence snapshot. Historical policy receipts retain their predecessors and evidence references. A policy is therefore neither a permanent badge nor a cached win count.

## Turn and compaction refresh

Source `0.4.3-adaptive.8` refreshes the proxy-versus-witness mandate and eligible
session guidance at user-turn, compaction and resume boundaries. The host must
invoke its configured hook; there is no background prompt watcher. The mandate
asks for direct evidence, alternative causes of a proxy, and checks across
parallel code paths. It is a standing reasoning instruction, not a validated
claim that repetition improves model behavior.

A pending ordinary trial may re-emit its already assigned advice on compaction or
resume only while its observation window, finding, files, model and policy remain
valid. It retains the same application; the control arm stays hidden. A new user
turn closes an unfinished trial window as unknown. Refresh never supplies outcome
credit or a new random assignment. See [the configured-command proof](../evidence/context-refresh-2026-09-11/README.md)
and [installation guide](hook-installation.md). Actual host event dispatch must be
checked in an ordinary session after installation.

## Code and rollout boundary

- `finding-trials.ts`: reviewed definitions, raw host trigger recognition, prospective enrollment.
- `finding-opportunities.ts`: assignment and host-context emission.
- `session-finding-capture.ts` / `session-finding-evidence.ts`: retained action boundaries, checks, corrections.
- `finding-trial-policy.ts`: fixed comparison, window closure, scoped delivery decisions.
- `src/cli/hooks.ts`: Codex/Claude wiring; no background watcher or mid-generation system-prompt mutation.

The original policy increment is included in `0.4.3-adaptive.7`; current source is `0.4.3-adaptive.9`. Its tests are not evidence that a real lesson helped. Rollout requires installing the built package and registering one genuinely reusable, reviewed real-task contract in the store the hooks resolve (normally `~/.zeroshot/lyo-lessons.db`, distinct from the telemetry corpus). Ordinary matching tasks then enroll without pasted per-task handoffs. The 2026-09-10 rollout inspection found no registered trial and no matching finding/evaluator for the current MLOps deployment task, so it is not retrospectively enrolled. See `evidence/prospective-trial-rollout-2026-09-10/README.md` in the repository for installation and live-capture verification.

Verification on 2026-09-10, Node 24.15.0: 666 tests passed, one skipped; typecheck, npm build, built CLI smoke check, and Opcore's changed-code gate passed. Opcore still reports complexity warnings; unavailable Python/Rust tooling is not claimed as coverage. `tests/finding-trial-policy.test.ts` exercises promotion → later delivery → later failure → scope pause, correction of the original comparison, closed unknown outcomes, and a replacement scope with fresh evidence.
