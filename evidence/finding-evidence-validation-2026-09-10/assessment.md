# Evidence validation and D-3 → D-2 → D-1 recheck

Date: 2026-09-10. Branch: `fix/finding-evidence-validation`.
Base: audit `e0acb7f`, runtime implementation `70a5e9e`.

All four audit regressions pass; [retained recheck output](recheck.txt).
The final full suite passes 637 tests with zero failures and one sandbox localhost
bind skip; [retained summary](full-suite-summary.txt). Typecheck passes. The full
suite includes the built-package registration/measurement/feedback/hook check.
An earlier run caught the malformed-evidence error boundary; the fix and final
run are reflected in these results.
After splitting evidence/feedback tests to satisfy the repository's 300-line file
limit, all 27 focused evidence/feedback/hook checks and typecheck pass. Assertions
were preserved; runtime code did not change during that test organization.
The final [Opcore check](robustness.json) passes with zero errors and 12 warnings:
four generated-package graph edges, five complexity warnings, one parameter-count
warning and two function-length warnings. No rule was suppressed. Both test files
and their shared fixture are explicitly included in the TypeScript project.
Opcore reports JavaScript coverage limitations and degraded Python/Rust tooling;
the runtime tests and package checks above supply the executed behavior evidence.

The four [prior audit gaps](../finding-evidence-link-2026-09-10/assessment.md) now
have behavioral regressions at the public finding/hook APIs. The runtime fix adds
registered local check execution and evidence validation. It does not establish
an autonomous ordinary-session learner or empirical usefulness.

| Prior probe | Corrected runtime boundary | Regression name |
|---|---|---|
| P1: nonexistent evidence accepted | Reject unresolved, wrong-type and corrupt evidence; require the registered application/delivery/version and matching measured judgments | `an unresolved evidence reference cannot change finding validity` |
| P2: task misfire excludes a whole context | Retain a request for scope review; preserve eligibility for other tasks sharing the repository/activity | `one inapplicable task requests scope review without excluding a different task in the same repository` |
| P3: one result counted through two deliveries | Reject cross-delivery evidence reuse; one current review per opportunity; deduplicate support by opportunity identity | `a measurement cannot be reused for another delivery or counted twice` |
| P4: corrected premise leaves derived advice eligible | Append evidence withdrawal; remove current credit; suspend dependent wording pending reassessment | `withdrawing evidence suspends feedback and wording derived from that premise` |

The positive path registers checks before the action, runs real subprocess
evaluators, retains their results, records matching feedback and inspects the next
hook output. CLI and package checks use the same delivery store. Additional cases
cover evaluator/source changes, unsuccessful evaluator execution, pre-existing
adherence, legacy attestations, late version evidence and corrupted history.

## Reproduce

Use Node 24+ with the repository dependencies:

```sh
rtk proxy node --test tests/session-finding-evidence.test.ts tests/session-finding-feedback.test.ts tests/lyo-session-hook.test.js
rtk proxy node --test tests/package.test.ts
rtk proxy node node_modules/typescript/bin/tsc --noEmit
```

The historical `audit.mjs` was written to demonstrate the old API's permissiveness.
Its fixtures no longer pass the corrected evidence boundary. Preserve its original
results as baseline evidence; use these public-API regression tests to recheck the
new behavior rather than interpreting early rejection as an audit crash to fix.

## Proof limits

The mechanical link now checks a declared deterministic evaluator. Correct mapping
of lesson semantics, applicability and observed action into that evaluator remains
a reviewer responsibility. The tested fixtures establish execution and provenance,
not the quality of a real coding or Go evaluator. No causal benefit or independent
transfer has been measured here.

Automatic hook-to-opportunity capture and pending-review recovery are still open.
Semantic scope revision and broader trials are open; this fix removes an unsound
generalized exclusion rather than inventing a new scope rule. Withdrawn derivations
are suspended, not automatically re-grounded. See the
[workflow](../../docs/scoped-session-findings.md) and
[remaining contract gates](../../Specs/7-session-telemetry-lesson-bridge.md).
