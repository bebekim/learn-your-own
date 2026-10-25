# Spec 11: What LYO borrows from Harness²

Status: **draft**. A design decision. Nothing here is implemented. Reviewed
2026-10-25 against main `4b1c7f7`.

[Harness²](https://github.com/google-research/harness2) stores what it learns as
library entries. Each entry is an adopted harness (system prompt, skills, scripts and
other components) plus an `EXPERIENCE.md` lesson. Libraries are per domain and are
replayed in stream order. [Spec 10](10-harness2-entry-trial.md) tests whether those
entries help. This spec decides which of the four features worth considering LYO
should adopt for its own findings.

## Summary

| Harness² feature | LYO today | Decision |
|---|---|---|
| Reflection labels each edit `helped` / `hurt` / `confounded` | Typed feedback, enforced in code | **Do not adopt.** LYO is already stricter. |
| Lesson format: cue / lesson / evidence / confidence | activity / intervention / observation + evidenceRef, plus validity state | **Do not adopt confidence.** The other fields already map. |
| Lessons as runnable files (skills, scripts) | Intervention is text, at most 220 characters | **Adopt** as increment B. |
| Per-domain library, replayed in order | Three hard-coded activities, no retag path | **Adopt open, revisable scopes** as increment A. Do not adopt ordered replay. |

## Not adopted

### Reflection labels

Harness² asks its improver model to label each edit and to answer `NO_ENTRY` when
evidence is thin. The code does not parse those labels. `Library.add` stores an entry
whenever `cue`, `lesson` and `evidence` are non-empty
(`harness2/core/library.py`). The label is a claim the model writes, not a check the
system makes.

LYO records feedback as typed fields (`src/lyo/application/finding-assessment.ts`):

- `applicability`: `applicable`, `inapplicable` or `unknown`
- `adherence`: `followed`, `not-followed` or `unknown`
- `outcome`, where `unknown` is a valid value

`recordFindingFeedback` refuses any outcome other than `unknown` unless the finding
was applicable and followed. It also refuses a review whose judgments differ from the
registered evidence for that delivery and version. Revision needs a checked
contradiction on the current version. Nothing here needs borrowing.

### Confidence

Harness²'s `confidence` is the improver's own rating of its lesson. LYO's equivalent
is the finding's validity state, which starts as `unvalidated` and changes only
through registered feedback and trials (Spec 8). Adding a self-rated field would put
a proxy next to a measurement, and readers would likely treat the two as comparable.

### Ordered replay

Harness² replays a domain's entries in stream order, so a later run sees earlier
lessons. LYO selects findings by context and delivers each with its own version,
which keeps the effect of each finding attributable. Ordered replay would mix the
effects of several lessons in every run. It is not adopted unless a trial shows that
order matters.

## Increment A: open, revisable activity scopes

### Problem

`activity` is a closed enum of `transfer-review`, `experiment-design` and
`learning-budget`. It is declared separately in three places:

- `src/lyo/storage/finding-state.ts` (finding schema)
- `src/lyo/application/finding-selection.ts` (selection type)
- `src/lyo/decisions/action-scope.ts` (action-scope calibration file)

A finding that belongs to a new activity has to be squeezed into one of the three.
Once recorded, it cannot be moved. `finding revise` changes only the intervention
text. The finding `finding:mlxcel-pr-1746:proxy-witness` is the current example: it
is tagged `transfer-review`, it does not fit that activity, and the only remedy is to
mark it `inapplicable` on a delivery where it misfires.

### Design

1. **Activity registry.** Activities become ledger records with an `id` (slug), a
   one-line description and an author. The three existing activities are seeded as
   records, so existing findings stay valid without a migration. One schema replaces
   the three enum declarations.
2. **Rescope record.** A new append-only record moves a finding to another registered
   activity: `{ id, findingId, previousVersion, fromActivity, toActivity, author,
   rationale }`. It creates a new finding version. Prior feedback stays attached to
   the old version and does not count toward the new scope, because evidence gathered
   under one activity is not evidence for another.
3. **Action scoping.** A calibration file may name any registered activity. An
   activity with no calibration is never inferred from actions. Its findings are
   delivered only where the activity is declared explicitly.
4. **CLI.** `lyo activity add`, `lyo activity list` and
   `lyo finding rescope --finding-id <id> --to <activity> --rationale <text>`.

### Acceptance

- The finding and action-scope schemas accept any registered activity and reject
  unregistered ones.
- A rescope creates a new version. Feedback on the old version is kept, shown, and
  excluded from the new version's validity.
- `npm test` and `npm run typecheck` pass. The architecture tests pass without
  loosening any rule.

## Increment B: runnable attachments

### Problem

An intervention can say "check X", but it cannot ship the script that checks X. Many
Harness² lessons are mainly files (a skill, a helper script, a prompt fragment), and
the lab cannot deliver files either (Spec 10, Phase 1).

### Design

1. **Attachment.** A finding may carry `attachments: [{ path, sha256, kind }]`, where
   `kind` is `skill`, `script` or `prompt`. File contents are kept in a
   content-addressed store next to the ledger. Changing an attachment creates a new
   finding version, as changing the intervention does.
2. **Lab delivery.** The lab plan's `advice` gets `files: [{ path, sha256 }]`, as
   specified in Spec 10. Files are written into each advice-arm worktree before the
   executor starts. A hash mismatch fails the run.
3. **Hook delivery.** At first, ordinary session hooks deliver only a notice that the
   attachment exists, with its path and hash. They do not install or run anything.
   Installing files into a live session is a separate decision, because it runs code
   the user has not reviewed in that session.
4. **Excluded kinds.** Plugins and guardrail hooks are not attachable. They run inside
   the tool loop, and LYO has no sandbox for them.

### Acceptance

- An attachment's hash is checked on every read, and a mismatch fails closed.
- A lab screen with file advice is recomputable from retained results.
- Hook delivery never writes or executes attachment files.

## Order

Increment A comes first. It is small, it removes a hard-coded limit, and it fixes the
mlxcel finding directly. Increment B is larger and is needed by Spec 10 Phase 1, so
it should be designed together with that phase.

## Limits

- This spec decides storage and delivery. Neither increment shows that any finding
  helps. That still needs Spec 8 trials or a Spec 9 screen.
- An open activity list makes scopes easier to create than to calibrate. A scope
  without an action-scope calibration is delivered only where it is declared, so a
  growing list does not widen automatic delivery.
