# One complete native task feedback cycle

Date: 2026-09-09. Implementation: `feat/native-feedback-cycle`, local
`lyo-kernel@0.4.3-adaptive.1`. Actual coding host: Codex CLI 0.153.4,
configured model `gpt-6-astra`. Task source baseline: published tag `v0.4.2`,
commit `61e81b0`. All eight attempts were separate Codex processes in isolated
Git worktrees. They edited real LYO source and tests.

**The cycle is connected. Useful intervention benefit is not demonstrated.**
Four real training tasks produced independently verified feedback in
`~/.lyo/corpus.sqlite`. A policy frozen at revision 4 was then consumed by two
later tasks, with two matched baseline attempts. Both actions had reward 1 in
training, so the policy selected no guidance on the tie. The comparison is
inconclusive and remains experimental; no policy was promoted into ordinary work.

## What was measured

The [protocol](protocol.json) fixed task order, two later comparison cases,
uniform randomized assignment, a maximum of four training tasks, and a total
token ratio limit of 1 before the first host launch. Training stopped on action
coverage or the four-task cap, never on observed success or cost. The actual
draws were reminder, reminder, reminder, no guidance. Both later comparison
pairs were registered before any of their hosts started.

Each attempt started from the same published source commit. The external
[verifier](verify.mjs), hashed before work, initially failed acceptance and
passed regression checks. After each host exited, LYO independently ran those
same checks, checked source stability and verifier integrity, and read tokens
from that host session's complete JSONL trace. Agent statements of success did
not determine the reward. Source patches and the agents' TDD traces are retained.

| Task | Condition / action | Accepted without regression | Tokens | Elapsed ms |
| --- | --- | --- | ---: | ---: |
| Reject cost increases in the generic promotion gate | Training / reminder | Yes | 357,456 | 159,436 |
| Reject whitespace-only verifier commands | Training / reminder | Yes | 304,223 | 108,473 |
| Reject whitespace-only task identity fields | Training / reminder | Yes | 376,626 | 124,510 |
| Reject whitespace-only task array entries | Training / no guidance | Yes | 300,737 | 116,537 |
| Require meaningful model/harness identity | Baseline / no guidance | Yes | 390,297 | 127,701 |
| Require meaningful model/harness identity | Frozen policy / no guidance | Yes | 339,081 | 113,333 |
| Compare budgets independently of property order | Baseline / no guidance | Yes | 370,815 | 110,782 |
| Compare budgets independently of property order | Frozen policy / no guidance | Yes | 279,658 | 104,725 |

Every attempt stayed within its declared 500,000-token, 480-second, 10-host-turn
budget. Codex reports one host turn containing many tool calls; host turns are
not tool-call counts. Elapsed time currently starts at registration and includes
waiting before launch. The comparison hosts were launched together immediately
after registration. Dollar cost is unknown; input-token totals include cached
input once, as reported by Codex.

## The observable feedback connection

Training created feedback sequences 1–4 with receipts naming their decisions.
The frozen policy is
`34477883e11da6729de5558e0ec904152c4b874b88201c69a4f2adbd83b43979`.
Its later decisions record:

```json
{
  "revision": 4,
  "action": "no-guidance",
  "estimates": [
    {"action": "no-guidance", "count": 1, "mean": 1},
    {"action": "acceptance-reminder", "count": 3, "mean": 1}
  ]
}
```

The matched fixed baselines use revision 0 with zero observations. Later tasks
have different task/verifier fingerprints from training. Repository paths are
not policy lookup keys: the later hook reads the same family/model/budget/tools
state from the central ledger in a new worktree and host process.

The [attempt summary](attempt-summary.json) links every decision, revision,
feedback sequence and trace hash. Reopening an isolated copy of the retained
ledger through the installed CLI reproduced the exact report and policy.
Evaluation receipts did not change the frozen training revision.

## What the result means

The [report](report-after.json) contains two accepted outcomes in each comparison
group, no unknown outcomes and no measured regressions. Two pairs do not support
the existing conservative paired gate. Both groups also executed the same
action, so their observed cost difference cannot establish a guidance effect.

| Accounting | Tokens |
| --- | ---: |
| All training | 1,339,042 |
| Fixed baseline evaluation | 761,112 |
| Frozen-policy evaluation | 618,739 |
| Training plus frozen-policy evaluation | 1,957,781 |

The last total exceeds the declared baseline cost limit. The report already
returns `inconclusive` for unsupported improvement; its outer cost rejection is
applied only when the inner paired gate would otherwise accept. Neither path
permits promotion here. Lower observed evaluation tokens alone are not a payoff
from learning.

This establishes measurement, persistent feedback, later policy consumption,
and a conservative decision. It does not establish a helpful lesson, cause
discovery, cross-project generalization, or Go improvement. The policy still
chooses between two supplied actions, using exact-state means. The four legacy
lesson-library candidates receive no helpful/harmful credit from this pilot.

## Inspect and reproduce

[artifacts.tar.gz](artifacts.tar.gz) retains 77 files: a pilot-only SQLite ledger,
full attempt records, raw host traces, launch/exit records, registrations,
before-work verifier results, patches, protocol, verifier, reports and the exact
package used for the pilot. [manifest.json](manifest.json) lists their SHA-256
hashes. Archive SHA-256:
`64f712cca32eb091f6224c66b6215b790848ec91c3d003380cf61904b32d47a6`.
The archive contains this pilot's rows only, not the rest of the central corpus.

From this evidence directory, using an empty extraction directory:

```sh
rtk proxy mkdir -p /private/tmp/lyo-cycle-inspection
rtk proxy tar -xzf artifacts.tar.gz -C /private/tmp/lyo-cycle-inspection
rtk proxy node verify-cycle.mjs /private/tmp/lyo-cycle-inspection
rtk proxy lyo task report --db /private/tmp/lyo-cycle-inspection/pilot.sqlite \
  --policy-id 34477883e11da6729de5558e0ec904152c4b874b88201c69a4f2adbd83b43979 \
  --comparison-id pilot-20260909-transfer
```

The report ID is
`d0749ecdd20a95cde35429dc756c01cd87177b7bf951994c8111bf91af52d4cb`.
The verification command checks trace identity/hashes, real source changes,
initial failure and final independent verification, host token accounting,
frozen estimate reuse, task separation and the final comparison. Replaying the
report does not launch hosts or modify production evidence.

Pilot patches can be applied to fresh `v0.4.2` worktrees and checked with the
retained verifier. They are experiment outputs, not additional changes merged
into the task-cycle implementation.

## Implementation and validation

The [workflow guide](../../docs/task-feedback-cycle.md) shows the CLI and code
boundaries. The connection is `task run` → native prompt hook → `TaskFeedback`
→ independent measurement → existing `FeedbackController` → frozen revision
→ later native prompt → existing paired evaluation plus task cost gate.

The feature regression suite passed 607 tests with one local sandbox skip;
typecheck passed. Opcore changed-file validation passed with 12 warnings and
zero errors; unsupported stacks are not claimed as fully covered. All eight
real runs used the installed package. Existing Codex/Claude hook and trust
configuration hashes stayed unchanged during rollout; the prior installation
was backed up. Claude's new task route has contract coverage but was not run as
a complete real task cycle in this pilot.

The next useful experiment needs a targeted intervention and independent task
variation with room for improvement. Merely increasing telemetry or repeating
easy all-pass tasks will not establish that the intervention helps.
