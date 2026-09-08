# Learning evidence loop

State: implemented and measured; product benefit not demonstrated (2026-09-08)

The product acceptance criterion is improved verified work on comparable later
attempts, including the cost of learning. Passing component tests is insufficient.

This work closes the September 8 audit findings in three steps:

- [x] Evidence: reject duplicate observations, incomparable evaluations and missing-cost wins;
      record all delivery vehicles, idempotent outcomes, quarantine and judge/retry usage.
- [x] Daily use: connect normalized session telemetry to scoped lesson candidates and
      delivery/outcome receipts. Uncontrolled session efficiency must not earn causal credit.
- [x] Proof: run repeated variants against a frozen independent verifier with baseline,
      static guidance and learned guidance; preserve costs, failures and an honest gate result.
- [x] Refresh capability claims and retain runnable regression checks.
- [x] npm test, npm run typecheck, package build.

This supersedes the draft Spec 7 proposal to validate lessons from session
efficiency alone. A shorter session is not causal evidence of a helpful lesson.

The initial artifact is a scoped lesson/verifier intervention. A generic explanation
graph and all five PRD artifact types are outside this first proof; their docs must
say they are future work. Native observations and controlled experiment results are
different evidence kinds. A negative or inconclusive experiment is a valid result.

Result: the corrected experiment recorded 0/8 successes in each condition; the
learning gate is inconclusive. The broader learning ambition is not complete.
See [the assessment and retained evidence](../evidence/learning-loop-2026-09-08-r2/assessment.md).

Legacy completed sessions contain 4,655 hook events but no preserved numeric
exit status. They cannot be backfilled into verifier-based outcome credit.
Future hook events retain that status; the full native hook round trip is tested.
