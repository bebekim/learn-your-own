# Automatic work-directory collection — 2026-09-09

Installed `lyo-kernel@0.4.1` locally. All 171 installed package files match the
tested archive; this version has not been published to npm. SHA-256:
`891f4b3373f152d4b8fdfefa94616510fbee0408a84dd764807fffabafd352ef`.

`~/.lyo/config.json` limits automatic connection to
`/Users/marcus.kim/repositories/work` and targets `~/.lyo/corpus.sqlite`.
The existing Codex, Claude, ECA, and Bob capture commands now connect at session
startup/prompt boundaries and sync at turn/session completion. Terminal `chpwd`
uses the installed executable through `~/.lyo/workspaces.zsh`; existing zsh
configuration remains intact. Existing terminals must source that file once or
start a new shell. Finder/Emacs directory browsing alone is not a trigger.

`lyo worktree add ../billing-fix --branch fix/billing` creates a normal Git
worktree and connects its local ledger before returning. A spec is optional;
the previous spec-driven pipeline command remains available. Git arguments are
passed directly, and symlinks cannot bypass the configured workspace boundary.

The loaded user LaunchAgent `com.lyo.workspace-sync` runs
`lyo sync connected --discover` every 60 seconds and at login. Its initial
backlog import changed/imported 58,452 events across 60 local ledgers. Four
scheduled executions had completed with exit code 0 at reconciliation time.

Reconciliation checked all 76,362 current source event IDs across those 60
ledgers: **zero missing centrally**. Central storage also retains historical
records no longer in the current source databases, so its count is higher.
The native terminal hook advanced billing checks' central sync timestamp and
matched all 7,698 source events at the time of that check.

The importer now compares identities and contents instead of sorting hash IDs
as a cursor. It refreshes ongoing-run projections and commits each ledger
atomically. Source snapshots and earlier central history remain separate.
Unavailable central storage leaves local capture durable for the scheduled
retry; directory changes continue and display a pending-connection message.

Validation: 561 tests passed, one existing skip, typecheck passed. Tests cover
late lower-sorting IDs, changed results in the same run, transaction rollback,
all four agent adapters, interrupted-turn recovery, worktree creation, ordinary
directories, symlink boundaries, and compiled npm executables. The installed
worktree command was also run against an isolated Git fixture and central DB.

Backups and artifact details: [installation.json](installation.json).
Live source reconciliation: [reconciliation.json](reconciliation.json).
Native entry points: [terminal-hook.json](terminal-hook.json),
[installed-worktree.json](installed-worktree.json).
Workflow and commands: [hook installation](../../docs/hook-installation.md).

This completes central telemetry collection for the configured work tree.
The lesson bridge remains a separate consumer of repository session evidence;
central import by itself does not establish learning benefit or award credit.
