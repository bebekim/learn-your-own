# Spec 17, Phase 2 — Codex failure capture (2026-11-28)

Source: two `codex exec` sessions (codex-cli 0.171.0, lyo 0.4.3-adaptive.25) in a scratch git
repo containing one failing and one passing pytest test. Hooks from the installed
`~/.codex/hooks.json` (`lyo codex-hook --db-from-event-cwd --capture-command-status`). Read from
the scratch ledger; key names, statuses, exit codes and test counts only.

## How Codex status is captured

Codex's `PostToolUse` carries no exit code and no failure event; `tool_response` is a plain string
(`shape: string`). With `--capture-command-status`, `PreToolUse` rewrites a **standalone verifier**
command to run through `control/native-check.js`, which writes a bound receipt
(`.agent-learning/command-receipts/<id>.json`). `PostToolUse` reads the receipt back and adds
`exit_code` and `command_status_receipt: {basis: command-receipt@1}`
(`src/lyo/hooks/codex-command-status.js`). Commands that are not standalone verifiers are not
rewritten and get no status.

## Commands run

| # | Command | Real exit | Rewritten | Recorded `exit_code` | `status` | `classification` | Verdict |
|---|---|---|---|---|---|---|---|
| 1 | `uvx pytest -q test_fail.py` (sandbox blocked uv cache) | 2 | no | none | `unknown` | `unknown` | safe, but a lost failure |
| 2 | `uvx pytest -q test_fail.py 2>&1 \| tail -3` | 0 (pipe) | no | none | `unknown` | `unknown` | correct |
| 3 | `pytest -q test_fail.py` (1 failed, 1 passed) | 1 | yes | 1, `failure_kind=exit_nonzero` | `failed` | `test` | correct |
| 4 | `pytest -q test_fail.py -k test_pass` | 0 | yes | 0 | `succeeded` | `test` | correct |
| 5 | `pytest -q test_fail.py 2>&1 \| tail -3` | 0 (pipe) | no | none | `unknown` | `test` | correct |

Command 5 still carries `test_summary: {runner: pytest, passed: 1, failed: 1}`, so its real result
is recoverable from the summary even though the status is (correctly) not trusted.

## Findings

1. **Codex pass and fail are both observable now**, but only through the receipt path, and only
   for standalone verifier commands. This answers Spec 17 open question 1: the signal is the
   lyo-written receipt, not a Codex host field.
2. **Codex handles pipes correctly; Claude does not.** A piped verifier is `unknown` under Codex
   (not rewritten), but `succeeded` under Claude (see `phase2-claude-capture.md`, command 3). The
   status layer needs one rule for both hosts.
3. **`uvx` is not recognised as a verifier wrapper.** `stripWrappers` in
   `src/lyo/bridge/verifier-command.js` strips `uv run`, `poetry run`, `python -m` and `timeout`,
   but not `uvx`. So `uvx pytest` is classified `unknown` on both hosts and is never rewritten under
   Codex. This is also why every pytest row in the Claude capture was `classification=unknown`.
4. **A piped run's `test_summary` can score it.** `verifier-command.js` already says piped runs
   "must be judged from the runner's summary line". Command 5 has the summary but status
   `unknown`; deriving `outcome` from `test_summary.failed > 0` (with `outcome_source:
   test_summary`) would recover these without trusting the pipe's exit status.

## Consequence for the June corpora

Their Codex rows were recorded without `--capture-command-status` receipts, so they have no
exit code and re-derive to `unknown`, as Phase 1 found. Only verifies recorded after the flag
was installed can be scored.
