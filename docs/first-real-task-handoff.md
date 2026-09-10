# First prospective LYO trial: current entry point

The manual handoff below is historical. For `0.4.3-adaptive.7`, use
[prospective finding trials](prospective-finding-trials.md): register a reviewed,
reusable trigger/evaluator once, then ordinary Codex/Claude hooks enroll matching
future work, capture outcomes, and revise scoped delivery. Do not paste the old
per-ticket instructions or enroll work that has already happened.

The rollout inspection found no registered ordinary trial in the central lesson
store and no sound match between the three catalog findings and the current
MLOps deployment task. Installation alone does not start a trial. The next
learning step is a real, reviewed finding/diagnostic/outcome contract; its absence
is not an observation window that can be completed by waiting.

Existing hook commands use stable executable paths and load the installed
package on each invocation. Check fresh host receipts for the installed version;
restart or resume a session only if it is not producing fresh capture. No new
hook event configuration is required for this rollout.

## Historical manual handoff (superseded)

Prepared 10 September 2026; updated for the main-branch rollout. This is a restart
handoff, not a completed trial.

## Start here

Open a **new Codex session** in:

```text
/Users/marcus.kim/repositories/individual/agent-learning-workflow
```

Paste this as the first message:

```text
Read docs/first-real-task-handoff.md and continue the first prospective LYO
trial. Use the existing implementation and TDD for any necessary fix.
First verify real host capture and a finding delivery for this new session.
The proposed real task is LYO's missing ordinary command-status evidence;
confirm the task from any newer user instruction before choosing it.
Before the relevant action, register a sound evaluator, the exact delivered
advice, its context and prediction, and the exact planned host action.
Complete collection and semantic review; show which evidence changes future
delivery and which conclusions remain unknown. Do not simulate host events,
backdate a registration, or claim a passing task proves the advice helped.
```

The current local rollout targets `lyo-kernel@0.4.3-adaptive.6`, including checks
for suspended/revised advice at registration and action start. Check the installed
version and fresh receipts. Hook commands retain the same executable paths, so
the next invocation loads the upgraded package; a restart is not itself proof of
working hooks. Use a new session if the current one has no fresh capture.

## Why start a new session?

The old thread is `01a0802d-0fb4-7fb1-b6f9-d0cbedd5c7d2`. On inspection:

- Its latest imported hook events were `0.4.3-adaptive.1`, dated
  `2026-09-09T13:58:37.551Z`.
- Scanning this repository and its worktree ledgers found no newer records
  for that thread. The root spool's latest file was dated
  `2026-09-09T14:10:08.315Z`.
- The shared delivery store had no session delivery for that thread.
- A different real MLOps session had captured `adaptive.4` events, including
  events after an upgrade within that same session. An installed-package
  upgrade therefore does not universally require restarting.

The old thread's current capture is unverified; the cause is not yet diagnosed.
Planning can continue there. Use a fresh session for this trial and investigate
hook loading/trust if that session also has no fresh events. Do not describe
restarting as a fix for missing exit status or for the incomplete learning loop.

## Authoritative starting point

| Item | Location/state |
| --- | --- |
| Working branch | `main`, with the task/finding feedback work squash-merged from `exp/real-task-evidence` |
| Historical evidence | Evidence commit `e04067c`, based on implementation `1e250c4` |
| Installed Node | `/Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/node` |
| Installed CLI | `/Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/lyo` |
| Installed session hook | `/Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/lyo-session-hook` |
| Finding deliveries, registrations and reviews | `/Users/marcus.kim/.zeroshot/lyo-lessons.db` — `learning_trace` |
| Central telemetry and task receipts | `/Users/marcus.kim/.lyo/corpus.sqlite` — imported `corpus_events`, task tables, `learning_traces` |
| Local capture | Host event cwd's `.agent-learning/learning.sqlite` and `.agent-learning/hook-spool/` |
| Prior real observations | [Audit](../evidence/real-task-observations-2026-09-10/assessment.md), [snapshot](../evidence/real-task-observations-2026-09-10/snapshot.json), [central trace IDs](../evidence/real-task-observations-2026-09-10/recording.json) |

Global Codex and Claude hooks invoke the installed absolute paths above.
The long conversation's supplied startup instruction invokes the root source
hook, which now includes the merged implementation. Running either hook manually with `--cwd` is only a
preview: that CLI mode supplies no session ID and creates no delivery receipt.
Require a real host SessionStart/UserPromptSubmit delivery before registration.
Never fabricate a session ID or replay a synthetic host event into the live store.

The root has user-owned staged renames and local drafts/papers. Preserve them;
the pre-merge originals and binary patches are retained in
`/private/tmp/lyo-main-merge-20260910`. For source changes, create a new
`fix/ordinary-command-evidence` worktree from `main` after checking that the name
is unused. The user authorized the current squash merge and local reinstall;
no registry publication or remote push is part of that rollout. Normal sessions
can open the root project; feature implementation still follows the worktree rule.

## First-session preflight

1. Identify the real new host session ID and its actual event cwd. Run a harmless
   shell command through the host, for example
   `rtk proxy node -e 'process.stdout.write("lyo-live-probe\n")'`.
2. Inspect the local ledger **and incoming spool** for that new session. Require
   current-package pre/post events with the same nonempty tool-call ID, exact
   tool name/input and workspace. Pending spool import is not missing capture.
   The probe proves capture only; it is not a learning observation. Check the
   event version against the actually installed version if it has changed.
3. Find the new session's genuine delivery in the shared finding store. It must
   contain the selected finding and version, not just the two generic legacy
   lessons. In this LYO worktree the installed findings match the Git common
   directory. In another repository they need genuinely applicable activity;
   do not add activity tags just to force irrelevant advice into a task.
4. Use the delivery's actual ID and store for subsequent registration. Inspect
   existing pending work before creating another opportunity:

```sh
rtk proxy /Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/node /Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/lyo finding pending --all --store /Users/marcus.kim/.zeroshot/lyo-lessons.db
rtk proxy /Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/node /Users/marcus.kim/.nvm/versions/node/v24.15.0/bin/lyo finding inspect --finding-id finding:catalog-20260910:experiment-design --store /Users/marcus.kim/.zeroshot/lyo-lessons.db
```

If capture or delivery is missing, diagnose that boundary before performing an
action intended to test advice. Useful read-only investigation can continue.
Do not claim a trial has started from package version or banner text alone.

## Proposed real task and acceptance boundaries

No external ticket was supplied when preparing this handoff. The proposed first
task is the real LYO gap exposed by the audit: ordinary Codex Bash completions
retained stdout fingerprints but omitted exit status. Five results could be
recovered retrospectively from matching transcript outputs. That recovery did
not establish an automatic, prospectively bound result path.

Investigate the authoritative host response before choosing a fix. The current
[status extractor](../src/adapters/runtime.ts:64) accepts structured status;
it cannot recover information absent from a stdout string. Do not "fix" this
by guessing success from text such as `passed`, accepting printed JSON as host
authority, or selecting the latest unrelated transcript result.

Acceptance for any capture fix:

- Preserve genuine host-provided command status, bound to the same runtime,
  session, workspace and tool action; keep absent or ambiguous status unknown.
- Preserve output fingerprinting/redaction. Do not retain complete business
  output just to recover one status field.
- Prove real passing and failing command capture through the supported host
  path. Use a focused red/green test for a confirmed defect, then typecheck and
  the repository's required validation. Fixture tests prove implementation
  behavior; real hook receipts prove deployment behavior.
- Keep task acceptance and lesson usefulness separate from command status.
  A smaller passing suite must not erase an earlier failing broader check.

If the host provides no authoritative status, record that limitation and use
the existing registered evaluator receipts for the trial. Do not require an
invented exit code to make a test green. This diagnosis may establish a host
integration limitation rather than a correctable LYO extraction bug.

## Record before the relevant action

Use [the existing finding workflow](scoped-session-findings.md), without adding
a new experiment framework. Inspect actual retained templates before writing
JSON inputs. No opportunity has been registered by this handoff.

`finding:catalog-20260910:experiment-design` says:

> Before comparing interventions, audit verifier coverage, fix ambient guidance,
> and measure execution separately from approval waiting.

Its compound recommendation is an **improvement** claim. Use it only when this
task includes an actual intervention comparison. Otherwise select another
genuinely applicable finding or record that no suitable lesson was delivered;
do not redefine this advice as a deterministic guarantee about command status.

Register the exact delivered action, explicit conditions/prediction/falsifier,
evaluator identity, immutable evaluator dependencies, source files, and exact
planned `capture` input. Review the evaluator's meaning before acting. Check
that adherence starts false and can become true through the declared action;
a marker file alone is not evidence that a substantive audit took place.

Keep checks local and bounded: each automatic check has a one-second timeout
and must exit zero with exactly `{"satisfied":true}`, `false`, or `null`.
Use the existing task-level receipts for longer acceptance/regression checks.
Register before the relevant action, even if unrelated investigation happened
earlier in the session. Follow the actual host input shape, including optional
fields. Missing pre-action capture cannot be reconstructed after the fact.

After the action, inspect retained boundaries and measurement, submit attributed
semantic review, and inspect the automatic assessment on the next live hook.
Then verify what the subsequent real prompt receives. Keep the exact evidence
IDs and both expected and observed delivery decisions in the experiment record.

## What counts as completion

The first operational trial should show real delivery, prospective declaration,
paired action capture, a trustworthy measurement, semantic review, assessment
and the subsequent delivery decision. Every unavailable link stays explicit.

**An improvement claim still has unknown incremental benefit in the current
finding API.** One successful application cannot justify automatic promotion,
and there is no implemented general semantic scope-revision policy. Current
deterministic contradictions can suspend a version; inapplicability requests a
scope review. These are distinct capabilities. Do not manufacture a deterministic
claim just to demonstrate suppression.

Use the existing [task comparison workflow](task-feedback-cycle.md) for a
prospectively registered comparison across independent tasks before claiming
positive benefit. The first trial can expose additional missing connections;
document and address those incrementally rather than declaring the whole loop
complete because one check passed. All five prior observations remain
retrospective, with zero learning credit.

## If interrupted again

Retain the actual opportunity ID, delivery ID, store, cwd, planned action and
current pending status in this document or a linked experiment record. Resume
with `finding pending --all` and `finding inspect`; do not duplicate a completed
measurement or change an already registered evaluator. Completed measurements
can be reviewed from another repository. Missing action capture still needs its
own workspace and cannot be replaced by today's source state.
