# Learning gates: which evidence changes which state

Status: implementation reference, reconciled 2026-09-11 against main `f39ed6c`.
This replaces the July map's incorrect claim that sequential likelihood ratios
had replaced SQLite's Wilson promotion rule. These mechanisms coexist; they do
not share evidence semantics or a single promotion threshold.

## Ordinary findings and trials

This is the current product path for reviewed Codex/Claude interventions.

| Decision | Mechanism | Evidence limit |
|---|---|---|
| Is this claim supported here? | [Finding feedback](../src/lyo/selection/session-findings.ts) consumes registered, reviewed applicability, adherence and check evidence for the exact version | A supported deterministic prediction is not an incremental benefit estimate |
| May this trial enroll? | [Trial definitions](../src/lyo/selection/finding-trials.ts) bind trigger, roots, model/runtime, finding version and reviewed evaluator | A matching diagnostic still needs the checked precondition; arbitrary telemetry is insufficient |
| Which action to try? | [Opportunity assignment](../src/lyo/selection/finding-opportunities.ts) records stable 50/50 advice/no-advice allocation while collecting | Allocation precedes action; emission does not prove the agent followed advice |
| May later sessions receive it routinely? | [Trial policy](../src/lyo/selection/finding-trial-policy.ts) evaluates the predeclared fixed sample; the conservative effect interval must exceed `minimumEffect` | Unknown outcomes widen the interval; benefit concerns the declared proximal check under the stated assumptions |
| What happens after promotion? | Probability-1 delivery is monitored; a later closed failed/unknown outcome pauses the scope for review | Pause is not proof of causal harm or false wording |
| What if evidence changes? | Reconciliation checks current evidence, finding and verifier versions; corrections can revoke promotion | Historical policy receipts remain; support does not transfer to replacement wording or trial definitions |

A new broader scope requires a newly reviewed trial. LYO does not infer and
validate a replacement scope from one failure. The complete fixed-comparison
contract and statistical assumptions are in the [trial protocol](../docs/prospective-finding-trials.md).

Turn/compaction refresh rechecks eligible guidance and preserves assignment and
application identity. It supplies context, not new outcome evidence.

## Legacy SQLite lesson store

[LessonStore](../src/lyo/storage/lesson-store.ts) retains lesson deltas,
applications, counters and status. It also houses finding receipts in
`learning_trace`; sharing a database does not make these the same learner.

- Status promotion: candidate → active when `n >= 8` and the Wilson lower bound
  exceeds `0.5`, with `z = 1.96`.
- Quarantine: `n >= 8` and the Wilson upper bound is below `0.45`.
- Selection includes Thompson sampling over counter-derived Beta distributions.
- Legacy validation uses ratio-lift credit with a sparse-data uniform fallback.
  Session-banner applications are excluded from `applyValidationOutcome`.

These status counters do not establish an independently measured task effect.
A sequential likelihood-ratio gate has **not** replaced these Wilson rules.

## File lesson library and pipeline judgments

The [trace consumer](../src/lyo/judge/trace-consumer.ts) groups disagreements,
requires a falsifier for future delivery, and uses a separate recurrence gate:
`E = product(Bernoulli(x | p1) / Bernoulli(x | p0))`, admitted when `E > 1/alpha`
and the preset's cross-spec condition holds. Presets use `p1 = 0.5`, `p0 = 0.1`,
with `alpha = 0.1` / one spec or `alpha = 0.05` / two specs.

Those are configured assumptions, not demonstrated empirical calibration. A
likelihood-ratio calculation alone does not certify false-promotion control on
confounded, dependent or misspecified observations. Recurrence of a failure class
also does not establish that the proposed intervention prevents it.

The [file library](../src/lyo/storage/lesson-library.ts) selects role-compatible
lessons using Thompson draws. Its separate quarantine rule is `harmful >= 2 &&
helpful === 0`. The trace consumer **does** call `recordLessonOutcome`; its
scoped recurrence/absence counters remain observational. The old map's claim
that there was no caller is obsolete.

## Other experimental components

The [task report](../src/eval/task-report.ts) and [evaluation report](../src/eval/report.ts)
compare explicitly registered tasks and enforce their own evidence gates. They
are separate from ordinary finding-trial policy. Association/explanation-graph
thresholds are prototypes, not authority for either lesson store.

The remaining work is to establish useful effects on independent later tasks
and reconcile legacy credit semantics. [Spec 4.2](4.2-credit-evidence-discipline.md)
tracks the legacy risk; [Spec 8](8-learning-evidence-loop.md) defines product
acceptance. No sampler or confidence formula can turn delivery into a witness
of learning.
