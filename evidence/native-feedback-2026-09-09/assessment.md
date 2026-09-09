# Native Codex and Claude connection — 2026-09-09

**Connected:** installed local package `lyo-kernel@0.4.2-adaptive.0` and enabled
`adaptiveFeedback: {"mode":"explore"}` in the existing central configuration.
The managed root is `/Users/marcus.kim/repositories/work`; the database is
`/Users/marcus.kim/.lyo/corpus.sqlite`.

The existing Codex and Claude hook definitions were retained. Their hashes were
checked before and after installation. All 171 installed source files matched
the tested package. The previous package and configuration are backed up at
the path in [installation.json](installation.json). Nothing was published.

## Actual host verification

Both hosts ran their normal installed user hooks in disposable workspaces,
with a shared **isolated** central database and an empty lesson store. Each was
asked to run a failing check, create the fixture's `ready` file, and rerun the
same check. Their processes exited successfully.

| Host | Delivery selected | Initial measurement | Later measurement | Recorded reward |
| --- | --- | --- | --- | ---: |
| Codex 0.153.4 | Recovery reminder | Wrapper receipt: exit 1 | Wrapper receipt: exit 0 | 1 |
| Claude Code 2.1.263 | Recovery reminder | Native Bash failure envelope | Native foreground completion | 1 |

The [status report](status.json) contains both decisions, their selection
probabilities, observations, and measured feedback. Both assignments happened
to select the reminder. The Claude host stream explicitly reports successful
delivery of the context hook. Codex executed the hook-rewritten commands and
completed without hook errors; its stored hook output contains the reminder.
This does not prove that either model followed the reminder because of Lyo.

These fixtures were instructed in advance to recover. Their results establish
the connection, **not guidance effectiveness**. Their two outcomes did not enter
the production feedback ledger. The [production snapshot](production-status.json)
showed zero native decisions immediately after installation, awaiting subsequent
eligible work.

## Measurement finding

A preceding live Codex probe ran two commands that printed nothing and exited
1 and 0 respectively. Both post-tool hooks contained `tool_response: ""`.
Inferring failure or success from those hooks would have been invalid.

The Codex adapter now wraps supported simple foreground verifier commands to
produce an exit-status receipt inside the workspace. It preserves the command's
streams, exit status, and actual working directory. The post-tool hook validates
the receipt and writes the measurement centrally. No central database access is
required from the sandboxed command itself.

Claude's observed foreground success shape lacks a numeric exit code. The
adapter records its host-reported basis explicitly. Background, interrupted,
and unsupported outputs stay unknown. Neither adapter interprets arbitrary
stdout text saying “passed” as a trustworthy exit status.

## Checks

- Ten native integration tests passed, including real child-process execution,
  command working-directory preservation, duplicate hooks, parallel-check
  chronology, cross-repository evidence, and unknown outcomes.
- Full suite: 580 passed, 0 failed, 1 skipped because localhost binds are not
  permitted by the sandbox.
- Typecheck passed. The compiled package also passed the Claude and Codex
  measurement integration cases before installation.
- Both actual-host probes passed through the installed package and existing
  hook definitions.

After the live probes, receipt-directory validation was moved before directory
creation and observation/session counters were added to status. The final full
suite and compiled-package checks passed with those changes. The archive retains
both the probe-time and final adapter source; installation metadata identifies
both package hashes.

## Retained artifacts and limits

[artifacts.tar.gz](artifacts.tar.gz) contains a consistent SQLite snapshot,
controlled fixture programs, Codex exit receipts, relevant host events, the
raw Codex contract finding, and source snapshots. Its checksum is in
[artifacts.sha256](artifacts.sha256). Paths identify the original probe
workspace; after extraction, use the matching runtime subdirectory.

Inspect everyday accumulation with:

```sh
rtk lyo control status --db ~/.lyo/corpus.sqlite
```

The experimental outcome concerns the last qualifying retry of the same check
before the turn stops. It does not prove the final code meets ticket criteria
or that a test's contents stayed fixed. Randomised exploration updates action
estimates but does not automatically promote a policy or increment the existing
lesson library's helpful/harmful counts.

Native control depends on the central database being available at the decision
point. Failures are reported on stderr while the existing local telemetry
capture remains available; missed native decisions are not reconstructed later.

The [workflow walkthrough](../../docs/adaptive-feedback-loop.md#native-codex-and-claude-connection)
documents configuration, measurement, and the next evaluation step.
