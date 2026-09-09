# LYO development status

Assessment: 2026-09-09. Implementation baseline: `61e81b0`, tag `v0.4.2`.

Follow-up: the [runtime diagnosis and local rollout](../evidence/native-runtime-2026-09-09/assessment.md)
installed `0.4.3-adaptive.0`, corrected Kimi events mislabelled as Claude, and
verified both native hosts in an isolated database. The production native
experiment still has zero decisions and rewards; collected telemetry alone
does not demonstrate that the adaptive loop has run on everyday work.

The first experimental adaptive feedback loop is implemented. LYO has progressed
from collecting telemetry and candidate lessons to recording interventions,
measuring consequences, and using that evidence in later decisions. Useful
improvement in everyday coding work or Go play remains unproven.

This assessment distinguishes implementation, measured evidence, and remaining
development. Historical assessments describe the increment tested at their date.

## Implemented

| Capability | Current behavior | Boundary |
| --- | --- | --- |
| Central collection | Workspace connection and hook-driven synchronization collect repository telemetry centrally. | Imported observations alone cannot establish that an intervention helped. |
| Agent integration | Codex and Claude support the opt-in native recovery experiment. ECA and IBM Bob capture telemetry; ECA also delivers session lessons. | ECA/MLX and Bob do not participate in the new adaptive controller. MLX is reached through its host, rather than a separate model-level hook. |
| Persistent controller | Decisions, assignment probabilities, feedback, and policy revisions survive restarts. Evaluation can use a frozen revision shared across controllers. | The policy learns action averages for exact states, with one decision per episode. |
| Native measurement | Supported Codex checks use execution receipts; Claude uses supported host result signals. Turn and working-directory boundaries constrain recovery credit. | Unsupported, interrupted, background, and pending checks remain unknown. |
| Lesson infrastructure | Candidate storage, scoped delivery, outcome receipts, pipeline selection, and demotion already exist. | Native recovery measurements do not award validated helpful/harmful credit to lesson candidates. |
| Evaluation infrastructure | Existing runners and reports support controlled comparisons and retain inconclusive results. | Native status reporting currently summarizes observations and outcomes; it is not a complete evaluation of task benefit and cost. |

The current native experiment is:

```text
failed verifier
-> observe verifier class and reported model
-> assign no guidance or a generic recovery reminder
-> measure a later retry of the same command and working directory
-> record its outcome at the turn boundary
-> update action estimates for matching states
```

Exploration continues randomized assignment while collecting evidence.
Evaluation selects from measured action averages using a frozen revision.
Switching into evaluation is explicit; there is no automatic promotion into
daily use. The controller does not yet discover a failure's cause, generate a
specific lesson, or learn similarity between different task states.

## Evidence and what it establishes

| Evidence | Result | Supported conclusion |
| --- | --- | --- |
| [Node execution calibration](../evidence/adaptive-feedback-2026-09-09/assessment.md) | 32 randomized training executions; on 12 later inputs, the fixed baseline passed 6 and the frozen learned policy passed 12. | The observation, action, execution, feedback, and adaptation path works for two supplied syntax states. This is not a general coding-benefit result. |
| [Native host probes](../evidence/native-feedback-2026-09-09/assessment.md) | Retained Codex and Claude hook/measurement evidence. | The host connection can deliver a decision and record a measured check result. It does not establish intervention efficacy. |
| [Corrected SemVer experiment](../evidence/learning-loop-2026-09-08-r2/assessment.md) | 0/8 successes in each condition; learning gate inconclusive. | No demonstrated benefit from learned guidance in that experiment. |
| Release regression checks | 586 tests passed; one localhost-bind test skipped in the local sandbox. Typecheck passed. All 14 native feedback tests passed against packaged JavaScript. | The implemented behavior is covered, including false-credit and lifecycle regressions. Component tests do not establish product benefit. |
| [Release CI](https://github.com/bebekim/learn-your-own/actions/runs/34324349151) | Passed for `61e81b0`. | The release passed repository CI, including package construction. |

The release fixes cover unfinished parallel retries, repeated prompt callbacks
with a turn ID, late results from earlier turns, working-directory isolation,
shared evaluation cutoffs, and Codex output without a status signal. Missing
measurements are preserved as unknown rather than converted into success.

Opcore remains degraded: its isolated analysis could not resolve Node types,
and two clone errors matched five shared import lines each. It also reported
seven complexity/length warnings. No validation rules were disabled or weakened.

## Remaining development

| Priority | Work | Completion evidence |
| --- | --- | --- |
| 1 | Connect native episodes to task acceptance, verifier identity, regressions, time, and token cost; reuse the existing evaluation machinery for a native experiment report. | Every report result traces to its decision and measurement; absent costs or outcomes remain explicit; incompatible attempts cannot yield a claimed win. |
| 2 | Support an evidence-based transition from exploration to a frozen policy in daily use, with rollback. | A registered comparison on independent later tasks meets declared acceptance criteria; failed or inconclusive comparisons do not promote an intervention. |
| 3 | Connect specific candidate lessons and their versions to intervention selection and measured outcomes. | A targeted intervention derived from a failure is delivered on an appropriate later task, compared with a baseline, and retained or rejected from evidence. |
| 4 | Complete the LYO architecture refactor around host measurement, turn lifecycle, policy selection, persistence, and output formatting. | Those responsibilities have clear boundaries while the existing public hook and controller tests retain the same observable behavior. |
| 5 | Extend the adaptive experiment to ECA/MLX and Bob, and implement a Go adapter with its own observations, legal actions, objective, and evaluator. | Each adapter completes a real observation-to-action-to-measurement round trip with a domain-appropriate evaluator. |
| 6 | Add traceable supersession of invalid finalized measurements and recomputation of affected policies. | An invalidated measurement ceases to train new policies while its original receipt and the correction remain inspectable. |

The architecture refactor remains unfinished: `native-feedback.ts` still
combines configuration, SQLite transactions, host measurements, turn state,
decision delivery, and status reporting. The release addressed correctness
failures in that path; the broader separation of responsibilities is still due.

The next bounded increment is priority 1: a native experiment report with
task-outcome and cost receipts, developed through public-interface regression
tests. After that, collecting independent real attempts and assessing the
intervention is evaluation work. Further telemetry collection alone cannot
substitute for that comparison.

Learned state representations, credit across sequences of edits or Go moves,
the explanation-graph runtime, and the full learned-artifact compiler remain
longer-term development. They are not prerequisites for testing one useful
intervention with the current controller.

## Release and rollout

As of this assessment:

- Release source is pushed to `origin/main`; tag `v0.4.2` is also on `origin`.
- The `lyo-kernel@0.4.2` tarball passes npm publish dry-run, isolated installation,
  and a CLI smoke check. Actual publication failed with `ENEEDAUTH` and is pending.
- The local installation now runs `0.4.3-adaptive.0`, with existing hooks retained
  and actual Codex/Claude canaries verified. This local rollout is separate from
  registry publication and does not establish useful learning on real tasks.

See the [adaptive-loop architecture and TDD walkthrough](adaptive-feedback-loop.md)
for implementation details and [Spec 8](../Specs/8-learning-evidence-loop.md)
for the acceptance requirement: improved verified later work, including the cost
of learning.
