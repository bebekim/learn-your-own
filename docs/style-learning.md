# Workflow-style reports

Current component reference, reconciled 2026-09-11. This replaces the obsolete
`lyo learn style` guide; that command and its candidate generator are absent from
the current source tree.

For an existing run with retained telemetry:

```sh
lyo report --style --run-id <run-id> --db .agent-learning/learning.sqlite
```

[Workflow-style analysis](../src/compiler/workflow-style.ts) reports version
`lyo/workflow-style/v1`, a classification, metrics, evidence strings and missing
signals. Classifications are `prompt_driven`, `manual_orchestrated`,
`loop_assisted`, `loop_driven_candidate` or `insufficient_evidence`.

The report uses hand-set descriptive rules over prompts, actions, verifier
activity and touched workflow files. Its `confidence` is a rule-derived label,
not a calibrated probability of engineering quality. It reports
`lineageMode: inferred_only`; missing explicit agent/reviewer lineage and approval
receipts remain visible. Test invocation density does not prove meaningful test
coverage or accepted work.

This report does not persist a lesson, establish its usefulness or promote prompt
delivery. The [ordinary finding trial](prospective-finding-trials.md) is a separate
feedback mechanism. [CLI tests](../tests/report-cli.test.ts) and
[component tests](../tests/workflow-style.test.js) establish the reporting contract.
