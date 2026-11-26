# Specs

Reviewed 2026-11-26, source package `0.4.3-adaptive.20` and later.
Asynchronous calibrated decisions, action evaluators and the hypothesis generator
are merged, and one live prospective trial (`json-output-handling-opus-2`, which supersedes the Haiku trial) is
enrolling. Source availability, local installation and npm publication are
separate: the registry's `latest` tag still points to `0.2.0` on this date.

The [PRD](../issues/prd.md) defines the product ambition.
[Spec 8](8-learning-evidence-loop.md) owns current acceptance and evidence.
[Development status](../docs/development-status.md) summarizes delivery and remaining work.
[Spec 00](00-spec-consolidation.md) records this reconciliation.

**Status meanings:** done = bounded implementation exists; partial = named gaps
remain; ready = an unimplemented, bounded work item; draft/deferred = design,
not an execution instruction; research = background, not a product guarantee.
A checked implementation box never establishes useful learning. Archive location
alone does not establish completion.

| Spec | Status | What is established / missing |
|---|---|---|
| [1.1 Literature](1.1-learning-layer-literature.md) | Research | Background; unsupported collapse proof and novelty claims withdrawn |
| [2 Explanation graph](2-learning-as-explanation-graph.org) | Partial / deferred integration | Dry-run inference components; no telemetry-to-graph delivery loop |
| [2.1 Agent IR](2.1-agent-ir-language.org) | Deferred | Language sketch; no integrated plan/trace compiler |
| [3 Lesson delta](3-lesson-delta-design.md) | Partial | Storage, replay, selection, credit components exist; counters do not prove benefit |
| [3.1 Counterfactual credit](3.1-counterfactual-credit-synthesis.md) | Research / partial components | Receipt/estimator machinery exists; causal identification and sequence credit unproven |
| [4.1 Contract fixes](4.1-checkblindness-and-contract-small-fixes.md) | Done | Loose or missing feedback policy rejected by checkBlindness, optional test-manifest entrypoint, 5s lesson-store busy timeout |
| [4.2 Credit discipline](4.2-credit-evidence-discipline.md) | Partial | Comparable reports and scoped counters; legacy observational credit remains a risk |
| [4.3 Risk, usage, quarantine](4.3-at-bat-risk-inputs-cost-and-quarantine.md) | Done, bounded scope | Inputs, verifier ordering, judge usage, explicit unknown Kimi usage, file quarantine |
| [4.4 Injection cadence](4.4-lesson-injection-cadence.md) | Partial | Turn/compaction refresh implemented; broader pipeline stages and learned cost gate deferred |
| [4.5 Prompt evidence](4.5-prompt-kind-evidence.md) | Done, bounded scope | Evidence accumulation/recompute; likelihood weights uncalibrated |
| [4.6 Prompt measurement](4.6-prompt-kind-measurement.md) | Done, bounded scope | Descriptive reports; no validated accuracy or waste measure |
| [4.7 Prompt backfill](4.7-prompt-kind-evidence-backfill.md) | Done, bounded scope | Idempotent reconstruction from retained summaries |
| [5 Scoring](5-scoring-layer.md) | Partial | Cost/activity measurement; useful-learning yield not established |
| [5.2 Turn cost](5.2-cost-attribution-turn-id.md) | Done, bounded scope | Nullable turn linkage and reports; historical missing attribution remains |
| [5.3 Episode cost](5.3-episode-compression-cost.md) | Done, bounded scope | Heuristic grouping and spend summaries; no proven waste classification |
| [6 Causal components](6-causal-discovery-framework-integration.md) | Partial | Six prototypes; no demonstrated integrated causal learner |
| [7 Session bridge](7-session-telemetry-lesson-bridge.md) | Partial | Registered checks constrain finding feedback; misfires request scope review and withdrawal suspends dependent wording; real benefit remains open |
| [8 Learning evidence loop](8-learning-evidence-loop.md) | Partial | Reviewed ordinary trials feed scoped promotion, pause and correction; product benefit still open |
| [9 Parallel lab screen](9-parallel-lab-screen.md) | Partial | Parallel paired runs in isolated worktrees, task-stratified exact test, pre-launch token budget; scripted-executor tests only, no live screen yet |
| [10 Harness² entry trial](10-harness2-entry-trial.md) | Draft | Screens a Harness² library entry on unseen tasks and tests its per-task refinement against a same-execution best-of-four baseline; needs an entry importer and file-tree lab advice |
| [11 Harness² borrowings](11-harness2-borrowings.md) | Partial | Open activity names and root-scoped findings exist (`lyo finding declare`); retagging/revision of scopes and hashed runnable attachments remain open; rejects self-rated confidence and ordered replay |
| [12 Async decision triggers](12-async-decision-trigger.md) | Done, bounded scope | Trials recognise a failure with a calibrated typed decision (local mlxcel, OpenRouter Solar Decide or TypeSafe Jev, swappable) asked by a background worker; enrollment happens when the decision lands |
| [13 Action evaluators](13-action-evaluator.md) | Done, bounded scope | Trials can measure the agent's next command: checks receive its labels via `LYO_FINDING_ACTION`; a failed command's outcome is a background calibrated decision; adherence deferred until it has its own case set |
| [14 Hypothesis generator](14-hypothesis-generator.md) | Done, bounded scope; recurrence untested | Generates candidate lessons from failures and their repairs (OpenRouter, ZDR), shadows them without delivery, judges recurrence (untested kept apart from refuted), and harvests review packs; promotion stays a review step |
| [15 Tuning](../docs/tuning.md) | Done, bounded scope | Machine-dependent budgets in config; `lyo tune` measures and suggests per file; install-time diagnostics |

## Dated designs

| Document | Role today |
|---|---|
| [Learning gate map](2026-07-27-principled-map.md) | Current reference, corrected against source |
| [Blind pipeline](2026-07-27-blind-pipeline-runner.md) | Historical pipeline design and its assumptions |
| [Pipeline mechanics](2026-08-04-lyo-workflow-mechanics.md) | Historical as-built snapshot; separate from ordinary trials |
| [Kimi wrapper](2026-08-08-awok-wrap-design.md) | Implemented bounded wrapper; original design retained |
| [Branching strategy](2026-08-08-branching-strategy-design.md) | Historical rationale; AGENTS.md owns the active policy |

Historical plans in `done/` and `docs/superpowers/` preserve provenance.
They do not override this status or the current contracts. Existing source and
tests use both TypeScript and JavaScript; this audit imposes no language migration.
