# Prospective trial rollout — 10 September 2026

The three feature increments were squash-merged to `main`: `8c51b51`
(opportunities), `b9a0fe0` (ordinary enrollment), and `3be6463` (policy feedback).
`lyo-kernel@0.4.3-adaptive.7` was installed in the existing Node 24.15.0 global
prefix used by Codex and Claude. npm publication and remote push are separate.

## Verified

- Full source suite: 666 passed, one skipped; typecheck passed.
- The archive regression failed before adding the prospective trial guide to
  the custom packer's document list, then passed with the fix.
- All 197 staged package files match the installed files byte for byte.
- Fifteen prospective/enrollment/policy tests passed against the installed
  JavaScript modules. Temporary copies of the existing tests changed only
  `src/*.ts` references to `src/*.js`; their `src` symlink targets the global
  installed package. These are synthetic tests, not production observations.
- `evidence/ordinary-finding-feedback-2026-09-10/verify-rollout.mjs --installed`
  passed for both configured host commands, using isolated temporary stores.
- Opcore's changed-code gate passed with complexity warnings. Unavailable
  Python/Rust tooling is not reported as coverage.

See [verification.json](verification.json) and
[installed-trial-tests.txt](installed-trial-tests.txt). The private rollback copy
of the previous installation and the new archive are in
`/private/tmp/lyo-prospective-rollout-20260910/`. The new archive also lives in
the repository's ignored `dist/` directory.

## Ordinary use and the remaining activation gap

Hook configurations are unchanged and their hashes were checked. Each existing
command loads the installed package on invocation; this rollout needs no added
event or mandatory restart. Codex reports failed Bash commands through
[`PostToolUse`](https://learn.chatgpt.com/docs/hooks#posttooluse); Claude also
has its existing `PostToolUseFailure` handler.

MLOps's latest real receipt at inspection was a stop at
`2026-09-10T12:39:41.160Z`, on `0.4.3-adaptive.6`. A fresh `.7` host receipt
has **not** yet been observed. The older LYO thread likewise has stale capture;
installation tests must not be substituted for either session's live receipts.

The central lesson store has **zero ordinary trial definitions**. Its three
catalog findings concern transfer review, experiment design, and learning
budgets; none provides a sound trigger/evaluator for the current MLOps deployment
task. No production trial was registered, no past work was enrolled, and no
usefulness was established.

The next required development-in-use step is to specify and review one real
finding's recurring diagnostic, applicability check, observable action, and
outcome check, then register that reusable contract once in
`~/.zeroshot/lyo-lessons.db` with `lyo finding trial-register`. It must describe
future work and fit the one-second automatic evaluator limit. A comparison
also needs a predeclared evaluation plan and independent repository units;
repeated worktrees of one repository cannot supply that evidence.

After that one-time definition, matching ordinary sessions enroll automatically;
no pasted per-ticket handoff is needed. `lyo finding trials` shows activation,
and `lyo finding trial-report --trial-id <id>` shows outcomes and the current
delivery policy. More waiting or telemetry alone will not fill the missing
contract. The [trial guide](../../docs/prospective-finding-trials.md) describes
the implemented chain and its evidence limits.
