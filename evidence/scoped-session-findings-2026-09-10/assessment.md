# Scoped findings rollout — 2026-09-10

The three approved findings now reach future prompts through the installed
Codex and Claude session hooks. Local package: `0.4.3-adaptive.3`. Existing
hook definitions and Codex configuration hashes stayed unchanged.

Automatic scope is LYO's Git common directory, including linked worktrees.
Elsewhere, `[lyo:transfer-review]`, `[lyo:experiment-design]`, or
`[lyo:learning-budget]` explicitly selects the corresponding finding. Each
finding arrives once per session, including when it becomes applicable after
the initial banner. Ordinary lessons preserve their previous once-per-session
behavior. Unrelated prompts receive none of these findings.

The source report was checked against the central corpus before publication.
`installation.json` identifies the three immutable traces in the central
corpus and existing delivery store. `findings.json` contains their exact
wording, scope and evidence reference. Publication created no ordinary lesson
rows. The unsuccessful trim advice was not installed for routine use.

The implementation uses tagged `behavior` traces in the existing stores.
This lets the older source hook on `main` ignore findings safely while the
updated package validates and scopes them. No new table, inference service,
automatic semantic classifier, or helpfulness score was introduced. Emission
adds a delivery-only trace and leaves source evidence unchanged.

TDD reproduced missing scoped delivery, failure to deliver a newly applicable
finding, and unintended repetition of ordinary lessons. The last regression
was fixed while retaining the original banner marker. Full suite: 616 passed,
one sandbox localhost skip. After the final marker fix, all seven focused
session-hook and packaged executable tests passed. Final typecheck and pack
passed. The installed configured commands also passed local simulations for
both hosts: automatic scope, all three tags outside LYO, repeat suppression,
and legacy-source compatibility (`rollout.json`). No coding model was launched.

Opcore passed with a complexity warning on `emitSessionLessons` (15 versus
10). Ripwire quality delta exits 2 with four historical-churn findings on
`claimSessionBanner`, `emitSessionLessons`, `renderSessionLessons`, and
`selectSessionLessons`. These are retained, documented tradeoffs; no checks
were suppressed. The function still combines emission and delivery receipts;
splitting it was deferred to keep this behavior change bounded.

`cost-checkpoint.json` separately records this implementation task's usage:
at least 4,730,631 input-plus-output tokens, including cached input, through
its checkpoint. Later reporting is excluded. No additional model experiment
was run. This implementation cost must not be presented as free learning.

Delivery is now implemented; improved outcomes from following the findings
remain unvalidated. Executable token caps, automatic semantic matching, and
freezing ambient guidance for experiments remain unimplemented. Existing
per-workspace delivery-store overrides still take precedence over the global
store. See [the workflow guide](../../docs/scoped-session-findings.md).

To repeat local verification after installation:

```sh
rtk proxy node evidence/scoped-session-findings-2026-09-10/verify-rollout.mjs
```

This writes only delivery receipts for clearly named simulated sessions and
the local rollout artifact; it makes no model call.
