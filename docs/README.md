# Documentation

Start with the [project overview and runnable demo](../README.md). This index
separates current operation, product requirements, research and historical records.
Current source baseline: `0.4.3-adaptive.8`, reviewed 11 September 2026.

## For a first visit

| Read | Purpose |
|---|---|
| [Application and demo brief](hackathon-brief.md) | Explain the problem, demonstrate the loop and state the validation milestone |
| [Development status](development-status.md) | Implemented behavior, architecture/code map, evidence and open work |
| [Install and connect hooks](hook-installation.md) | Build the current package, configure hosts and distinguish the SQLite stores |
| [Prospective finding trials](prospective-finding-trials.md) | Reusable trigger/evaluator, ordinary enrollment, comparison, promotion and pause |
| [Finding evidence and refresh](scoped-session-findings.md) | Registration, semantic review, capture, correction and turn/compaction semantics |
| [Registered task experiments](task-feedback-cycle.md) | Explicit host-launched acceptance/regression and cost comparisons |

## Product requirements and contributor guidance

- [PRD](../issues/prd.md): product ambition and remaining capability gaps.
- [Spec map](../Specs/README.md): status of every numbered spec and dated design.
- [Learning acceptance](../Specs/8-learning-evidence-loop.md): what would establish useful learning.
- [Gate map](../Specs/2026-07-27-principled-map.md): distinct finding, task, SQLite and file-library gates.
- [Lyo/host boundary](lyo-shepherd-boundary.md): learning decisions versus execution authority.
- [Contribution workflow](../AGENTS.md) and [changelog](../CHANGELOG.md).
- [Telemetry source-boundary proposal](../issues/lyo-telemetry-v1-source-boundary.md): proposed common input interface, not an implemented integration guarantee.

## Supporting components

These components support or predate the ordinary finding workflow; they do not
all participate in one integrated learner.

- [Deterministic classification](deterministic-classification.md).
- [Descriptive workflow-style reports](style-learning.md).
- [Corpus/effect design](local-corpus-effect-algebra-spec.md): implemented sync alongside proposed extensions.
- [Learned rule/evaluation design](learned-reducer-rules-eval-rubric.md): component behavior and remaining integration.
- [First adaptive controller increment](adaptive-feedback-loop.md): dated recovery experiment and TDD walkthrough.
- [Blind pipeline](../Specs/2026-07-27-blind-pipeline-runner.md) and
  [pipeline mechanics](../Specs/2026-08-04-lyo-workflow-mechanics.md).
- [Evaluation fixtures](../eval/fixtures/README.md).

## Research and deferred directions

These documents motivate experiments; they do not establish product efficacy or
promise implemented behavior. The current loop does not depend on the proposed
explanation-graph/compiler architecture.

- [Cybernetic learning survey](../papers/2026-09-09-cybernetic-learning-survey.md)
  and [literature inventory](../Specs/1.1-learning-layer-literature.md).
- [Behavior as code](behavior-as-code.md).
- [Explanation graphs](learning-as-explanation-graph.md),
  [formal graph design](../Specs/2-learning-as-explanation-graph.org) and
  [agent IR](../Specs/2.1-agent-ir-language.org).
- [Association learner](cybernetic-association-learner.md) and
  [experimental protocol](cybernetic-learning-experiment-protocol.md).
- [Thermodynamic analogy](learned-context-thermodynamics.md).
- [Causal component prototypes](../Specs/6-causal-discovery-framework-integration.md).
- [Counterfactual credit](../Specs/3.1-counterfactual-credit-synthesis.md),
  [WCS digest](../papers/wouldacouldashoulda-digest.md) and
  [long-term credit digest](../papers/longtermcredit-digest.md).

## Historical and adjacent work

- [Evidence records](../evidence): dated experiment, audit and deployment results.
  Start with the [latest implementation validation](../evidence/context-refresh-2026-09-11/README.md)
  and [controlled feedback exercise](../evidence/finding-feedback-loop-2026-09-10/assessment.md).
- [Product learning log](product-learning-log.md): dated observations and interpretations.
- [Problem reports](../problems): diagnoses at their recorded dates, not a current backlog.
- [Historical manual handoff](first-real-task-handoff.md): superseded by reusable trials.
- [Archived plans](../Specs/done), [earlier implementation plans](superpowers/plans)
  and [earlier contracts](superpowers/specs/done).
- [Candidate-at-bat design](candidate-at-bat-telemetry-spec.md) and
  [its PRD](../issues/done/candidate-at-bat-prd.md): an adjacent interview-analysis
  application, not the primary Lyo hackathon workflow.
- [Dogfood artifacts](../dogfood): retained runs and candidate lesson files;
  a file's presence is not proof of useful transfer.

Local notebooks and downloaded papers not tracked in Git are not part of the
public documentation set. Historical reports can name local-only artifacts;
the portable demo uses committed inputs and creates its own temporary ledger.
