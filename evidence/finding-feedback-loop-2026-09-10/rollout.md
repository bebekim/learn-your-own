# Local rollout: 0.4.3-adaptive.6

The feedback-loop branch is squash-merged to local `main`. The rebuilt package
is installed at the Node 24 prefix used by both Codex and Claude hooks:
`/Users/marcus.kim/.nvm/versions/node/v24.15.0/lib/node_modules/lyo-kernel`.
Hook configuration hashes are unchanged. Existing staged and unstaged edits on
main were restored byte-for-byte; unrelated papers were untouched.

[Deployment receipt](deployment.json) and [configured-hook receipts](configured-hooks.json)
record verification against all 184 built source files. The installed package
passes the parser counterexample → suspension → revision → later-delivery check,
rejects stale registrations, and suspends a revision when its premise is withdrawn.
Both configured host commands retain action state and assess paired tool events.
All generated events and learning records are isolated from production stores.

Release gate: 651 tests passed, zero failed, one localhost-bind test skipped by
the sandbox; typecheck and package build passed. The previous implementation run
passed all 652 tests without skips. The static audit limitations in
[validation.json](validation.json) remain; they were not waived or reported green.

The first npm installation resolved Homebrew Node 26, leaving the hooks' pinned
Node 24 package unchanged. Installation was repeated with the exact Node 24
executable and explicit prefix, then that package was verified. Both the shell's
Homebrew package and the pinned hook package now contain `.6`. A rollback copy of
the prior pinned package is `/private/tmp/lyo-kernel-before-adaptive6.tgz`.

To repeat the installed verification, use the same Node executable as the hooks
and a fresh output directory:

```sh
rtk proxy /Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/node evidence/finding-feedback-loop-2026-09-10/verify-deployment.mjs /private/tmp/lyo-feedback-next-check
```

The retained run is `/private/tmp/lyo-feedback-installed-node24-adaptive6`,
including its isolated SQLite database, generated package runner, input files,
before-withdrawal journal, and after-withdrawal inspection.

This verifies installed commands with controlled events, not independent prompt
benefit. At inspection, the latest real Nectr billing and MLOps receipts were
still `.5`; the root's old thread still had `.1` receipts. The unchanged hook
commands load `.6` on their next invocation. Start a fresh session if the existing
one produces no new receipt, then check the recorded version before registering
a real application. Merely restarting does not prove capture or learning.

This rollout is local: no npm registry publication or remote push was performed.
