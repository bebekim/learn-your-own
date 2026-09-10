# One SQLite feedback loop — 2026-09-10

Subsequent deployment: [local main and installed-hook verification](rollout.md).

Scope decision: retain provenance, staged validation and state-dependent
rechecking. Keep SQLite. Defer competing builders, bundles, auctions, broadcast
coordination and distributed consensus until ordinary-work usefulness is shown.

## Implemented correction

On branch `feat/lesson-feedback-loop`, based on `d628587`, regression tests exposed
two gaps: an old banner could register another application after its finding was
suspended/revised, and a previously registered action could start after that
state change without retaining the change.

The shared registration boundary now requires current, unsuspended advice.
Codex and Claude capture retain the finding's version and validity at `PreToolUse`;
stale or suspended applications cannot earn support. Legitimate late outcomes
from actions begun before a revision remain evidence about their original version.
This does not block host tools or erase advice already present in the prompt.
No SQLite migration, additional service or dependency is required.

## Controlled demonstration

Run from the branch with Node 24+ and a fresh output directory:

```sh
rtk proxy node evidence/finding-feedback-loop-2026-09-10/run.ts /private/tmp/lyo-feedback-exercise-new
```

The script retains `lessons.sqlite`, source and verifier files, `report.json`,
and the complete `journal.json`. It refuses to overwrite an existing database.
The regression suite runs the same exercise in a disposable directory.
The retained run is at `/private/tmp/lyo-finding-feedback-loop-20260910`;
[report.json](report.json) and [journal.json](journal.json) are copied here for
inspection if that temporary directory is later removed.

The initial advice and counterexample come from the retained
[U+0085 audit](../specific-lesson-transfer-2026-09-10/unicode-audit.json).
That earlier trial is not relabelled or reopened. Its audit is copied into the
isolated exercise ledger with its path and content hash; the exercise finding
refers to that origin. No exercise record enters the production learning stores.

| Stage | Observed result |
| --- | --- |
| Deliver original advice | Use `trim().length` to reject blanks while preserving accepted values |
| Register and review | Freeze explicit input contract, parser, checker and planned implementation before execution; attribute semantic judgment to this agent |
| Execute original parser | U+0085 violates the contract; the intact evaluator reports `false` |
| Capture and automatic assessment | Scripted Codex-shaped paired events produce a checked contradiction |
| Next delivery | Old advice is suppressed; the content-review queue appears |
| Revision | Reopen SQLite and cite the retained contradiction; replacement wording begins with zero support |
| Fresh workspace | Deliver the revision under the explicit `transfer-review` activity tag; execute the corrected parser with Claude-shaped paired events |
| Later outcome | All frozen rejection/preservation inputs pass; exactly one supporting application belongs to the new version |
| Later delivery | Emit revised advice; retain the original contradiction and its wording |

The replacement explicitly applies to contracts rejecting **both** ECMAScript
and Unicode whitespace, using `/[^\s\p{White_Space}]/u`. The checker executes the
parser over enumerated blank inputs and accepted strings; it does not read a
prewritten outcome flag. Exact-source adherence is appropriate to this scripted
exercise and is not a general detector of agent compliance.

## What this proves, and what it does not

This demonstrates a local code correction and the complete operational chain:
delivery → prospective registration → retained execution → assessment → suspension
→ attributed revision → later delivery → passing contract check. Both versions,
their inputs and outcomes remain inspectable in SQLite.

The two workspaces are scripted reproductions, not independent real tickets.
Hook events, patches and the review are supplied by the exercise. The revision
was written by this agent; LYO neither discovered it nor independently judged it.
The check covers a finite explicit contract, not every string or every meaning of
“blank.” Activity matching remains explicit; this does not add semantic routing
or automatically broaden applicability.

`incrementalBenefit` remains `unknown`. A future independent ordinary task must
show that delivery changes a useful outcome compared with a prospectively
registered ordinary-workflow comparison. Existing task comparison machinery is
the starting point; there is no new ranking or promotion algorithm in this change.
The requested real-work usefulness milestone remains open until that evidence
exists. Neither waiting nor accumulating more banners will establish it.

## Validation

The stale-registration and action-start tests failed on the previous behavior
before the fixes. All 652 tests pass with no skips, as do typecheck and package
build. [validation.json](validation.json) also records the non-passing static
audit results: one complexity increase in the added evidence checks and a
name-based test map with unresolved coverage. The complete executable suite was
run; those audit findings were not suppressed or presented as green. No merge,
installed-hook upgrade or publication is implied by these branch-local checks.
