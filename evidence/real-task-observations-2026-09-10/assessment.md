# First audit of ordinary work evidence

Collected 10 September 2026 on `exp/real-task-evidence`, based on `1e250c4`.
The [snapshot](snapshot.json) retains five real observations from two existing
Codex sessions. All five output fingerprints match their original central
hook records. These are retrospective observations, not intervention trials.
All five were also written through `lyo context trace` to the central
`~/.lyo/corpus.sqlite` and read back for verification. Their IDs and stored
payload hashes are in [recording.json](recording.json), under source
`retrospective-real-task-observation@1`. They do not enter the pending finding
review queue: there is no prior finding opportunity to review. They are
available for analysis without revisiting the old repositories.

## What we actually found

| Actual work | Observation | Justified interpretation |
| --- | --- | --- |
| MLOps architecture review | Link checker failed on paths containing parentheses; a corrected parser then verified 15 links. | The check itself needed correction. The trace executes the corrected check before a later document line-number patch. This is evidence for examining evaluator semantics, not evidence that LYO advice caused a better document. |
| Same review | Opcore exited 1 with `PYTHON_TYPES_UNSUPPORTED_TARGET`. | No configured Python type-checker authority was available. Treat this as an unavailable evaluation, not a demonstrated regression in the document. |
| Data engineering work | Full pytest run: 1 failed, 682 passed, 13 skipped. A later run of three selected files passed 18 tests. | Different test scopes. The subset pass does not establish recovery of the earlier live-data current-month assertion. Its cause remains unresolved. |

Each observation has the session, ledger/event ID, command, tool-call ID,
original transcript path, line/block, transcript and line hashes, and stdout
fingerprint in `snapshot.json`. The exact original output remains in the local
host transcript. Business data, code dumps and complete transcripts are not
copied into these artifacts. No historical checks were rerun against today's
code or live databases.

## Capture coverage and the missing connection

At this snapshot, the central corpus held 150,330 imported event rows,
116,542 distinct event IDs and 226 session IDs across 90 source ledgers.
Beneath `~/repositories/work/`, it held 119,759 rows, 88,739 distinct event
IDs and 146 session IDs across 62 source ledgers. Imported rows repeat some
event IDs across ledgers; neither rows nor sessions are independent completed
tasks. This convenience sample cannot estimate a learning success rate.

The installed `0.4.3-adaptive.4` produced 57 real MLOps events: 28 before/after
pairs with matching session, tool-call ID and exact input, plus one Stop.
This demonstrates capture and central import. It does not establish valid
action timing, lesson application, acceptance or benefit.

All 21 Bash completions in that upgraded session lacked an exit code in the
retained hook response. Three original transcript results were recovered for
that session, plus two results from the earlier coding session. Each matched
the hash of the exact stdout string stored by its hook. The exit status comes
from the transcript envelope; the stdout hash alone does not attest status.
This is an attributed local reconstruction, not independently authenticated
or prospectively registered evidence.

[Status extraction](../../src/adapters/runtime.ts:64) walks structured objects;
the matched real hook responses were stdout strings. The
[ordinary session bridge](../../src/lyo/bridge/session-bridge.ts:47) requires
an exit code before it can retain a verifier observation. More raw event
collection does not repair that missing status. Registered finding checks
have a separate evaluator path and are not proven broken by this observation.

The shared delivery ledger contained three findings, 83 session delivery
traces and 64 session outcome traces, but **zero finding opportunities,
measurements or semantic reviews**. The central task table contained **zero
registered attempts beneath `~/repositories/work/`**. Existing temporary
pilot attempts are separate experiments. All six ordinary lesson entries
still had zero helpful/harmful counts. These counts describe the central
corpus and shared delivery store, not every possible custom store override.

## Reverse chain: D to D-3

- **D — better later work:** unproven; these observations have no matched
  comparison and did not register an intervention before the action.
- **D-1 — revise delivery/validity:** no credit or suppression is justified by
  this sample. No finding-delivery-to-opportunity chain exists for these cases.
- **D-2 — semantic assessment:** two useful failure distinctions are now
  evidenced: evaluator failure versus product failure, and subset success
  versus recovery of the original check. These can inform a future trial.
- **D-3 — observations:** five outcomes recovered and linked to original
  events; live capture/import confirmed; a missing structured-status path
  identified. Original unknown measurements are preserved.

## Next real task

The next trial needs the user's next repository/ticket and acceptance criteria.
That clarification was requested while collecting this audit. No unrelated
repository was modified to create an apparent success.

Before the first relevant action, use the existing finding registration path
to bind an actually delivered finding, its unchanged action, an explicit
prediction, the applicable context, verifier dependencies and source files.
For the verifier-audit recommendation, register an **improvement** claim.
Check semantic coverage, execution environment and the exact test scope;
retain unavailable checks as unknown. Have the ordinary host capture the
declared action, then review applicability and adherence against the retained
evidence. Acceptance and regressions need their own task-level checks.

One followed recommendation and a passing task can establish an observed
application. A benefit claim additionally needs a prospectively registered
comparison across independent tasks using the existing
[task comparison workflow](../../docs/task-feedback-cycle.md). Do not turn
these retrospective cases into deterministic support for broad advice.

## Reproduce the audit

```sh
rtk proxy node evidence/real-task-observations-2026-09-10/collect.mjs
```

The collector opens both databases read-only, asserts all five expected
statuses and output fragments, and requires an unambiguous, untruncated
matching hook fingerprint. It writes only this experiment's snapshot. A new
run refreshes aggregate counts and timestamps; preserve the committed
snapshot when comparing different collection times. No production code or
hook configuration was changed.

Validation: the collector passed all five status/content/fingerprint checks;
`node --check` passed; `opcore check --changed --json` passed with no
diagnostics. Opcore reports ESM JavaScript as unsupported coverage, so the
executed collector assertions are the direct check for this script. Full
application tests were not rerun for this evidence-only change.

Opcore log SHA-256: `5c411a5d3ade18c9eb99fea998342558cff337530271dd3832be49501480be81`.
