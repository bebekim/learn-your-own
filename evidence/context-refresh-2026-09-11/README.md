# Context refresh rollout — 2026-09-11

Installed `lyo-kernel@0.4.3-adaptive.8` at the existing Node 24.15.0 prefix.
Codex and Claude already register `lyo-session-hook` on SessionStart and
UserPromptSubmit without a source matcher; their configuration was unchanged.
New processes launched at those boundaries load the new package. No restart or
new configuration is required for those existing command paths.

- Full suite: 672 passed, one skipped (673 tests); typecheck passed.
- `opcore check --changed`: exit 0. Its initial status reported degraded Python/Rust tooling; this does not claim clean coverage for those stacks.
- All 197 files in the built package matched the installed files byte for byte.
- [Configured-command verification](verification.json): startup, two user turns,
  two compactions and resume restored the mandate and synthetic lesson for each
  host, with one application and zero helpful/harmful credit. Maximum duration
  was 159 ms for Codex and 117 ms for Claude, within the configured five seconds.
- The existing installed evidence-chain exercise passed for both hosts: paired
  action capture, automatic assessment, and counterevidence suppressing later
  advice. Its temporary output is at
  `/private/tmp/lyo-context-refresh-rollout-20260911/evidence-chain.json`.

These are isolated invocations of the configured commands, not observations of
host-dispatched compaction events or evidence of useful learning. The tests also
exercise scope reset, workspace binding, pending advice/no-advice assignments,
changed source state, and the outcome-recording boundaries. Actual task benefit
still needs prospective outcome evidence.

Reproduce with Node 24:

```sh
rtk proxy node evidence/context-refresh-2026-09-11/verify-refresh.mjs
rtk proxy node evidence/ordinary-finding-feedback-2026-09-10/verify-rollout.mjs --installed
rtk proxy node --test tests/lyo-session-hook.test.js tests/ordinary-finding-trials.test.ts
```

The previous installed package is backed up under
`/private/tmp/lyo-context-refresh-rollout-20260911/previous-package`.
Registry publication and remote push were not part of this rollout.
