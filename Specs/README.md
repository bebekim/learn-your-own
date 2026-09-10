# Specs

Reviewed: 2026-09-10, against `dd5f160` (`feat/scoped-session-findings`).
The audited implementation is on feature branches and in local package
`0.4.3-adaptive.3`; it is not all merged into `main`. The subsequent unreleased
`feat/session-finding-feedback` increment adds ordinary-session finding reviews,
validity/context revision and version-aware delivery (Spec 7). The subsequent
`fix/finding-evidence-validation` branch requires registered evidence, removes
coarse exclusions from task misfires and propagates evidence withdrawal. It is unreleased.

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
| [4.1 Contract fixes](4.1-checkblindness-and-contract-small-fixes.md) | Ready | Loose-plan blindness, test entrypoint, SQLite timeout remain open |
| [4.2 Credit discipline](4.2-credit-evidence-discipline.md) | Partial | Comparable reports and scoped counters; legacy observational credit remains a risk |
| [4.3 Risk, usage, quarantine](4.3-at-bat-risk-inputs-cost-and-quarantine.md) | Done, bounded scope | Inputs, verifier ordering, judge usage, explicit unknown Kimi usage, file quarantine |
| [4.4 Injection cadence](4.4-lesson-injection-cadence.md) | Draft | Pipeline stages and learned cost gate remain unimplemented |
| [4.5 Prompt evidence](4.5-prompt-kind-evidence.md) | Done, bounded scope | Evidence accumulation/recompute; likelihood weights uncalibrated |
| [4.6 Prompt measurement](4.6-prompt-kind-measurement.md) | Done, bounded scope | Descriptive reports; no validated accuracy or waste measure |
| [4.7 Prompt backfill](4.7-prompt-kind-evidence-backfill.md) | Done, bounded scope | Idempotent reconstruction from retained summaries |
| [5 Scoring](5-scoring-layer.md) | Partial | Cost/activity measurement; useful-learning yield not established |
| [5.2 Turn cost](5.2-cost-attribution-turn-id.md) | Done, bounded scope | Nullable turn linkage and reports; historical missing attribution remains |
| [5.3 Episode cost](5.3-episode-compression-cost.md) | Done, bounded scope | Heuristic grouping and spend summaries; no proven waste classification |
| [6 Causal components](6-causal-discovery-framework-integration.md) | Partial | Six prototypes; no demonstrated integrated causal learner |
| [7 Session bridge](7-session-telemetry-lesson-bridge.md) | Partial | Registered checks constrain finding feedback; misfires request scope review and withdrawal suspends dependent wording; real benefit remains open |
| [8 Learning evidence loop](8-learning-evidence-loop.md) | Partial | Registered feedback, derivation, trials and reports; product benefit still open |

Historical plans in `done/` and `docs/superpowers/` preserve provenance.
They do not override this status or the current contracts. Existing source and
tests use both TypeScript and JavaScript; this audit imposes no language migration.
