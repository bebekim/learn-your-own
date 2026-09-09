# Native runtime diagnosis and local rollout — 2026-09-09

The local installation now runs `lyo-kernel@0.4.3-adaptive.0`. Codex and Claude
completed live hook canaries through the installed package. Everyday useful
learning remains unverified; production has no native decisions or rewards.

## Why the central experiment was empty

The read-only [diagnostic snapshot](diagnosis.json) contained 147,831 corpus
events from 94 registered source ledgers, but no native control observations,
decisions, or feedback. There were two native session records.

All 89 work events captured with the previous adaptive installation came from
`client_type: kimi_code_cli`. They used the Claude-compatible hook entry point
and were incorrectly labelled as Claude telemetry. Their tool identifiers and
results use `tool_call_id` and `tool_output`, rather than the native Claude
experiment's `tool_use_id` and `tool_response` contract. These recent commands
also contained no recognized test/build/lint checks; most were inspection,
Databricks, and ticket queries.

Thus the collected activity did not establish that eligible native Codex or
Claude checks were reaching the controller. Merely aliasing the tool ID would
not implement Kimi's measurement or guidance-delivery contract.

## Test-driven correction

Three regressions were reproduced before their fixes:

1. A Kimi prompt produced `runtime: claude`. The adapter now preserves Kimi
   identity in the observation, session, and captured metadata.
2. Previously Claude-labelled Kimi output normalized as Claude. Normalization
   now recognizes the retained host marker, and completion without a status
   signal stays unknown.
3. Kimi using `claude-hook` created a native Claude experiment session. It now
   remains captured as telemetry without entering that experiment.

The native evaluator still supports only Codex and Claude. No Kimi action,
result-envelope, or guidance-delivery support is claimed. Existing stored
payloads and already-derived historical records were not rewritten. The
normalizer correction applies when payloads are processed; it is not an
automatic repair of previously materialized records.

## Installed-package and host verification

The [installation manifest](installation.json) records that all 171 installed
source files match the isolated, tested package. Existing Codex hooks, Claude
settings, and central configuration retained their hashes. The previous
installation is backed up under
`/private/tmp/lyo-runtime-identity-rollout-20260909/previous-installation.tar.gz`.
No npm publication was performed.

| Host | Assigned action | Initial measurement | Subsequent measurement |
| --- | --- | --- | --- |
| Codex CLI 0.153.4 | No guidance | Execution receipt, exit 1 | Execution receipt, exit 0 |
| Claude Code 2.1.263 | Recovery reminder | Native Bash failure envelope | Native foreground completion |

Both episodes finalized reward 1 in the isolated canary database. The hosts
were instructed in advance to recover: these are instrumentation canaries,
not evidence that the reminder improved their work. Their outcomes did not
enter the production database; the [post-rollout snapshot](production-after.json)
still has zero native decisions, observations, and feedback.

[Status](status.json), [host summary](host-summary.json), and the checksummed
[artifact archive](artifacts.tar.gz) retain the actual-host results, execution
receipts, fixture programs, runner, and a consistent SQLite snapshot. Archived
paths identify the original disposable workspace.

Validation: [589 tests passed, one sandbox skip](tests.txt); typecheck passed;
[all 15 native tests passed against the installed isolated package](packaged-tests.txt).
[Opcore passed](opcore.json) with five complexity/length warnings. Its first run
rejected the enlarged native test file; the boundary regression was tightened
to check retained capture and excluded experiment membership. No guardrail was
disabled.

## What this enables and what remains

New supported Codex and Claude checks under `~/repositories/work/` can enter
the experiment through the updated installation. Kimi remains telemetry-only.
The immediate native outcome is still same-check recovery at a turn boundary,
not ticket acceptance, independent verification, or measured net benefit.

The planned task-outcome, outcome-receipt, episode-cost, and experiment-report
branches remain necessary. A real later-task comparison must distinguish the
benefit of a fixed reminder from the added benefit of a learned policy, declare
quality and cost limits, retain unknown outcomes, and exclude these canaries.
