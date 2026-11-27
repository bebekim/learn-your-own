# Spec 17: Verifier outcome capture

Status: **proposed** (2026-11-28). Related: [Spec 13](13-action-evaluator.md) (action context),
[Spec 5.2](5.2-cost-attribution-turn-id.md), CHANGELOG `0.4.3-adaptive.10` (session bridge repair).

## Problem

The corpus cannot say whether a verifier passed, because it does not record one.

Checked on 2026-11-28:

- `work-corpus-20260627.sqlite`: 1,164 verify actions are `succeeded`, 9 are `attempted`, and
  **0 are failed**. All 1,173 verify `command_json` values have `"exitCode": null`.
- `lyo-corpus-20260613.sqlite`: 1,382 verify actions `succeeded`, 9 `attempted`, **0 failed**.
- 944 of the work-corpus verify commands are `pytest` runs. The command is identifiable; its result is not.

A base rate of pass/fail per gate cannot be computed from this. Any prediction built on it would
learn that every gate passes.

### Known cause

CHANGELOG `0.4.3-adaptive.10` records the same defect: the session bridge required a numeric
`exit_code` in the stored tool result, which no host sends and capture redacts. It recorded 0 of
76,955 shell results. The fix derives status from the hook event instead:

- Claude `PostToolUse` → pass
- Claude `PostToolUseFailure` → fail
- anything else → unknown
- a backgrounded command (`run_in_background`) → unknown, not pass

The corpus rows do not show that fix. They carry no `unknown` verify outcomes and no failures, so
either they were built before `adaptive.10`, or the corpus importer still maps every recorded
command to `succeeded`. This spec does not assume which; Phase 1 settles it.

## Goals

1. Every verify action has an outcome that is `pass`, `fail`, or `unknown`, with its source.
2. `succeeded` is never assigned without a recorded pass signal.
3. The corpus can report pass/fail counts per gate command and per file set.
4. Historical rows are re-derived, not silently kept, so old and new outcomes are distinguishable.

## Non-goals

- Storing command output text (Spec 13 already excludes it).
- Predicting outcomes. This spec only makes past outcomes true.

## Design

### Outcome fields on each verify action

| Field | Values | Meaning |
|---|---|---|
| `outcome` | `pass` / `fail` / `unknown` | Result of the verifier |
| `outcome_source` | `hook_event` / `exit_code` / `none` | How it was determined |
| `gate` | `pytest` / `ruff` / `mypy` / `build` / `other` | Derived from argv |
| `captured_version` | integer | Derivation version, e.g. `adaptive.10` = 2 |

`status` stays as the recorder's field, but consumers read `outcome`.

### Derivation order

1. Hook event: `PostToolUse` → pass; `PostToolUseFailure` → fail; background launch → unknown.
2. Exit code, only when the host reports one or the redacted digest carries `Exit code N`.
3. Otherwise `unknown`, with `outcome_source: none`.

### Command rules

Only a command whose exit status belongs to the verifier can be scored. Reject, as `unknown`:
pipes (`pytest | tail` exits 0 when tests fail, since `pipefail` is off), `||`, `;`, `&`,
command substitution, and multi-line scripts. This follows the existing extraction rule in
`adaptive.10`.

### Re-derivation

A new importer pass re-derives verify outcomes for existing corpora and writes them with
`captured_version`. It does not overwrite the original `status`. Receipts are versioned
(`session-outcome:v2:` as in `adaptive.10`); the old ones remain as they are.

## Phases

**Phase 1 — audit (no schema change).** For each corpus, count verify actions by host event type.
Confirm whether `PostToolUseFailure` events exist in the source ledgers at all. If they do not,
the hook is not being captured, and that is the fix. Report which importer version produced each
corpus.

**Phase 2 — derive.** Implement the derivation order and command rules. Re-derive the work and
lyo corpora. Acceptance: a sample of at least 50 `pytest` verifies is checked by hand against the
real run, and the derived outcome matches in at least 45. The sample and the disagreements are
recorded in the evidence folder.

**Phase 3 — base rates.** Report pass/fail per `gate` and per top-level directory. This is the
first input the gate-prediction panel can use, and it reports `unknown` as its own bar, never as
a pass.

## Acceptance (for the whole spec)

- A corpus re-derived by this spec shows a non-zero fail count, or the audit shows that no failure
  events exist and the hook must be fixed first.
- `unknown` is reported as a share of verifies in every summary.
- No summary counts `succeeded` as a pass.

## Open questions

1. Does Codex expose a result status comparable to `PostToolUseFailure`? The `shape` observation
   in the changelog suggests the location is still being discovered.
2. Should `unknown` verifies be excluded from base rates or reported beside them? This spec says
   beside them.
