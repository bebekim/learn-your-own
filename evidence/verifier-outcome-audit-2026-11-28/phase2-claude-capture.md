# Spec 17, Phase 2 — Claude failure capture (2026-11-28)

Source: the live LYO ledger of a Claude Code session (`claude-hook --db-from-event-cwd`, lyo hooks
registered for `PostToolUse` and `PostToolUseFailure`). Read from a copy of the ledger; key names,
types, statuses and exit codes only.

## Commands run

| # | Command shape | Real exit | Recorded `status` | Verdict |
|---|---|---|---|---|
| 1 | `python3 -c ...; ...; lyo --version` (last command exits 1) | 1 | `failed` | correct |
| 2 | `uvx pytest -q test_fail.py` (one failing test, no pipe) | 1 | `failed` | correct |
| 3 | `d=...; uvx pytest -q test_fail.py 2>&1 \| tail -3` | 0 (pipe) | `succeeded` | **wrong: should be `unknown`** |
| 4 | `mkdir ... && printf ... && python3 -m pytest ...` (no pytest module) | 1 | not found in `command_activations` | **unresolved** |

## Findings

1. **Claude failures are captured, with an exit code.** The normalized `tool.failure` event carries
   a redacted `error` object with `exit_code=1`, `failure_kind=exit_nonzero`, and either
   `error_class` or, for pytest, a `test_summary` object. So for Claude, `fail` is observable now;
   Phase 1's "unobserved" applies only to the June corpora.
2. **Piped commands are recorded as `succeeded`.** Command 3's real test failure was masked by
   `| tail` (no `pipefail`), and `command_activations` stores `succeeded`. The pipe rule from
   `adaptive.10` applies in the session bridge's verifier extraction, not in the command status.
   Spec 17's command rules must apply at the status layer too, or base rates will count masked
   failures as passes.
3. **Gate type is not derived.** Every pytest row has `classification = unknown`, not `test`.
   Cause (found in the Codex capture): `uvx` is not a recognised verifier wrapper; plain `pytest`
   classifies as `test`.
4. **One failure is missing (command 4).** Two `tool.failure` events exist for three failing calls.
   Eight spool files were still in `hook-spool/incoming` when the ledger was copied, so this may be
   normalization lag, not loss. Recheck after the next Stop-hook drain.

## Codex

Done in [`phase2-codex-capture.md`](phase2-codex-capture.md): Codex pass and fail are captured
through lyo's command receipt for standalone verifiers, and piped verifiers stay `unknown`.
