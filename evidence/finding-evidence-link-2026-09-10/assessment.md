# D-3 → D-2 → D-1 soundness audit

Date: 2026-09-10. Implementation audited: `70a5e9e`.
Audit branch: `feat/finding-evidence-contract`.

Verdict: **the stronger evidence-to-learning contract is not yet sound end to end**.
The current implementation is a working explicit-review ledger. Its passing tests
establish receipt/version linkage, correction bookkeeping and selection effects;
they do not establish the provenance or meaning of the supplied judgments.

## Reproduced gaps

The [diagnostic](audit.mjs) uses only public finding/hook APIs and temporary stores.
It makes no model calls, reads no live telemetry and changes no installed hooks.
All four gaps reproduced; see [retained output](results.json).

| Probe | Observed behavior | Missing boundary |
|---|---|---|
| P1 | A nonexistent evidence reference plus supplied applicable/followed labels produces `supported` validity | D-3 → D-2: checked evidence identity, content and relevance; separate attestation from verification |
| P2 | Inapplicability on a formatting task suppresses a later transfer task in the same directory/activity | D-2 → D-1: opportunity-specific applicability versus generalized scope revision |
| P3 | Two delivery reviews citing the same synthetic result produce two supporting observations | D-3 → D-2 → D-1: observation identity and independence, beyond idempotent review IDs |
| P4 | A wording revision based on a subsequently corrected review remains eligible without a dependency-staleness indication | D-2 → D-1: corrections propagated to dependent content revisions |

These are gaps relative to the stronger requested contract. P1 is an explicitly
documented trust boundary of the manual CLI; P2 is behavior that the current tests
deliberately assert. Fixing them requires an explicit contract change, not claiming
that the original narrower tests already prove semantic learning.

Run from this worktree with Node 24+ and installed dependencies:

```sh
rtk proxy node evidence/finding-evidence-link-2026-09-10/audit.mjs
```

Exit 1 means at least one open gap reproduced. This is an audit diagnostic outside
the normal regression suite; its nonzero exit is retained evidence, not a passing
soundness gate. When a contract is implemented, replace the corresponding probe
with a failing-then-passing behavioral regression test at the public boundary.

## Existing assurance and remaining proof

The existing focused run passed **17 tests**, zero failures/skips:

```sh
rtk proxy node --test tests/session-finding-feedback.test.ts tests/lyo-session-hook.test.js
```

Opcore's changed-code check passed without diagnostics. Its status reports ESM
JavaScript as unsupported and Python/Rust tooling as degraded; this is not static
coverage of the `.mjs` diagnostic. That diagnostic was executed directly above.
All 41 local links in the changed documents resolve, and whitespace checks pass.

Read-side tracing also confirmed that `recordFindingFeedback` is called by the
manual CLI, while ordinary session completion invokes `bridgeSessionOnEnd`.
There is no ordinary-event assessment edge between them. Session events currently
retain command observations, not structured lesson-opportunity/adherence evidence.

Reuse the existing task intervention's prediction/falsification fields, task
verifier fingerprints, artifact hashes, hook-event ledger and comparison gate.
The task report remains `experimental-only`; it does not deploy a finding.
No new database, scheduler, model service or general graph engine is needed to
test the first connection.

The [revised Spec 7 contract](../../Specs/7-session-telemetry-lesson-bridge.md)
defines D-3 inputs, D-2 assessment limits, D-1 permitted updates, recovery behavior
and six ordered TDD gates. These are **required work, not implemented guarantees**.
No runtime implementation changed in this audit. No empirical benefit or automatic
promotion is claimed. Instrumentation cannot by itself establish evaluator accuracy.
