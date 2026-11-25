# Lyo development status

Updated 26 November 2026 for source package `0.4.3-adaptive.20` and later. This page describes current behavior; dated rollout
records preserve what was true at their checkpoints.

**The bounded feedback loop is implemented. Useful general coding transfer is
still an experimental result to establish.** The prototype can retain a lesson,
deliver it in a reviewed context, capture its declared action and outcome, and
change future delivery from that evidence.

## Architecture and code map

| Responsibility | Relevant code | Boundary |
|---|---|---|
| Host observations | [Adapters](../src/adapters), [hook runtime](../src/lyo/hooks/runtime.ts) | Records what the host exposes; missing status is unknown |
| Local and central capture | [Corpus sync](../src/lyo/corpus/sync.ts), [workspace sync](../src/lyo/corpus/workspace-sync.ts) | Central telemetry is distinct from the lesson store |
| Timely guidance | [Session hook](../src/lyo/selection/session-hook.ts) | Turn/compaction refresh, explicit scope, delivery-only receipts |
| Finding lifecycle | [Domain rules](../src/lyo/domain/finding-lifecycle.ts), [assessment](../src/lyo/application/finding-assessment.ts), [SQLite adapter](../src/lyo/storage/finding-state.ts) | Versioned support, contradiction, revision and correction; inward application/domain dependencies |
| Ordinary finding workflow | [Selection](../src/lyo/application/finding-selection.ts), [boundary ordering](../src/lyo/application/finding-workflow.ts) | Trial-managed withholding, scoped support, capture before measurement |
| Prospective ordinary trials | [Trial definitions](../src/lyo/interface/finding-trials.ts), [delivery](../src/lyo/interface/finding-opportunities.ts) | Reviewed trigger/evaluator before action; stable advice/no-advice assignment |
| Action and evaluator evidence | [Capture](../src/lyo/interface/session-finding-capture.ts), [evidence](../src/lyo/interface/session-finding-evidence.ts), [semantics](../src/lyo/interface/session-finding-semantics.ts) | Paired identity, declared files, explicit claim kind and attributed review |
| Scoped promotion and pause | [Trial policy](../src/lyo/domain/finding-trial-policy.ts) | Completed fixed cohort; conservative unknown handling; later failures pause scope |
| Registered task experiments | [Task runner](../src/lyo/control/task-run.ts), [task evidence](../src/lyo/control/task-evidence.ts), [report](../src/lyo/eval/task-report.ts) | Acceptance/regressions and cost; separate from a passing retry |
| Candidate derivation | [Task intervention](../src/lyo/control/task-intervention.ts) | Retained repair, removal/restoration checks and explicit later trial |
| Calibrated decisions | [Providers](../src/lyo/decisions/providers.ts), [queue](../src/lyo/decisions/queue.ts), [worker](../src/lyo/interface/finding-decision-worker.ts), [case sets](../src/lyo/decisions/case-sets.ts) | Typed 1-5 decisions (local mlxcel, OpenRouter, Jev) asked in the background; bands fitted on a calibration split and scored on a frozen test split ([Spec 12](../Specs/12-async-decision-trigger.md)) |
| Action evaluators | [Evaluator context](../src/lyo/interface/session-finding-evidence.ts), [example](../eval/finding-evaluators/action-outcome.mjs) | The next command's labels and a background outcome decision; adherence not yet measured ([Spec 13](../Specs/13-action-evaluator.md)) |
| Hypothesis generation | [Episodes](../src/lyo/hypotheses/episodes.ts), [generator](../src/lyo/hypotheses/generator.ts), [shadowing and recurrence](../src/lyo/hypotheses/store.ts) | Proposes candidate lessons from failures and repairs, shadows them without delivery, judges recurrence ([Spec 14](../Specs/14-hypothesis-generator.md)) |
| State location | [LYO home](../src/lyo/storage/lyo-home.ts) | One lesson store and all LYO state under `LYO_HOME` (default `~/.lyo`) |
| Legacy lesson storage | [LessonStore](../src/lyo/storage/lesson-store.ts), [file library](../src/lyo/storage/lesson-library.ts) | Separate credit/gate semantics; session banners excluded from run-level validation credit |

The ordinary trial loop, explicit task experiment and legacy pipeline are separate
paths. Their gates are not interchangeable. The
[gate map](../Specs/2026-07-27-principled-map.md) names the implementation for each.
The [host boundary](lyo-shepherd-boundary.md) keeps execution authority outside Lyo.

## Workflow today

A reviewer supplies a finding and meaningful checks for its applicability,
adherence and predicted result. A reusable trial definition fixes the scope,
model, diagnostic trigger, files, evaluator and comparison plan. Ordinary
Codex/Claude hooks then enroll matching future work automatically.

Completed comparisons can promote delivery in that declared scope. Later failed
or unknown outcomes pause it; withdrawn evidence triggers reassessment. The agent
or reviewer decides whether the lesson wording or applicability needs revision.
Lyo does not automatically invent a trustworthy evaluator or a generalized scope.
Since November a trial's trigger can be a calibrated typed decision instead of an
exact match, and the hypothesis generator proposes candidate findings, which stay
in shadow until a reviewer declares a finding and registers its trial.

Session hooks refresh currently eligible guidance (no fixed rules) at
new turns, startup, resume and compaction. An emitted reminder cannot establish
adherence or benefit. See [refresh semantics](scoped-session-findings.md#turn-and-compaction-refresh).

## Evidence

| Exercise | Observed result | What it establishes |
|---|---|---|
| [Evidence refactor](../issues/refactor-evidence-domain.md) | 689 passing tests, one skipped; typecheck and dependency guards | Preserved receipt/workflow behavior and inward domain/application imports |
| [Controlled parser feedback demo](../evidence/finding-feedback-loop-2026-09-10/assessment.md) | Counterexample → suppression → scripted revision → supported later application | Real parser checks and durable feedback transitions; actions are scripted |
| [Prospective policy tests](../tests/finding-trial-policy.test.ts) | Fixed comparison → promotion → pause after later failure; correction recomputes policy | Policy mechanics on controlled outcomes |
| [Context refresh rollout](../evidence/context-refresh-2026-09-11/README.md) | 672 passing tests, one skipped; typecheck; configured command checks | Tested implementation and installed-command behavior; no claim of observed host-dispatched compaction |
| [Syntax calibration](../evidence/adaptive-feedback-2026-09-09/assessment.md) | Frozen policy: 12 conversions versus baseline 6 on 12 supplied inputs | Narrow controlled adaptation, not general coding transfer |
| [Source repair](../evidence/native-task-intervention-2026-09-10/assessment.md) | Fail/pass/same-fail/pass under removal/restoration | The repair mattered to the source verifier |
| [Cross-repository screen](../evidence/specific-lesson-transfer-2026-09-10/assessment.md) | Inconclusive; guided arm used more tokens and failed a later Unicode audit | Exposed inadequate verifier coverage; no promotion |
| [Corrected SemVer screen](../evidence/learning-loop-2026-09-08-r2/assessment.md) | 0/8 successes in each condition | Negative outcome retained |

The retained experiments have not demonstrated a useful reusable coding
intervention on independent later work. Candidate counts, deliveries and synthetic
passing tests do not substitute for that outcome. [Spec 8](../Specs/8-learning-evidence-loop.md)
retains the detailed acceptance and cost accounting.

## Integration coverage

Codex and Claude support ordinary finding trials and paired evidence capture.
ECA/Emacs and IBM Bob capture telemetry and deliver guidance through their adapters;
they do not participate in the same adaptive trial contract. MLX models are observed
through their host, not directly by Lyo. Kimi, Gemini, Antigravity and Deep Agents
Code have capture adapters with different event contracts. A Go adapter is deferred.

## Next development

1. **Demonstrate useful ordinary-work learning.** The first real trial
   (`json-output-handling-haiku-1`, calibrated trigger, action evaluator) is
   enrolling; it needs about 80 sessions and a measured adherence signal before
   its comparison can justify continued delivery.
2. **Refine applicability.** Use later evidence to distinguish a bad lesson from
   a bad insertion context; test broader scope without inheriting unearned credit.
3. **Unify evidence correction.** Finding evidence supports withdrawal; finalized
   task measurements and legacy credit still have different correction semantics.
4. **Complete architecture separation.** Native host measurement, lifecycle,
   policy, persistence and formatting remain concentrated in the native controller.
5. **Extend domains after the loop earns its keep.** ECA/Bob trial coverage, Go,
   learned representations, explanation-graph integration and sequence credit.

Experiment budgets, verifier coverage and fixed ambient guidance remain controls,
not measures of learning by themselves.

## Release status

`0.4.3-adaptive.20` is the latest local rollout at this update. npm's `latest`
tag is still `0.2.0`, held until the live trial has data. Use the source demo or a locally built package;
see [installation](hook-installation.md). Registry publication is separate from
merging and pushing this repository. Historical test counts and installed paths
in `evidence/` are dated observations, not current setup instructions.
