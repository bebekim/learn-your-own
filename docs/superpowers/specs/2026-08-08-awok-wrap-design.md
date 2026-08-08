# awok wrap: Agent Session Wrapper

**Date:** 2026-08-08
**Status:** Design approved, pending implementation plan

## Purpose

Automate the wiring of lyo learning hooks into AI agent harnesses and launch the agent in a single command. Eliminates the manual config editing step that currently requires knowing hook event names, commands, flags, and absolute paths.

## Scope

**In scope:**
- `awok wrap kimi` — wire hooks into Kimi Code's config, launch kimi
- `awok unwrap kimi` — remove lyo hooks from Kimi Code's config

**Out of scope (deferred):**
- Other harnesses (Claude, Codex, Gemini, Antigravity, Dcode) — future iterations
- Local HTTP server / proxy — deferred until a pain point justifies it
- Auto-running `pipeline learn` after sessions — manual for now

## User experience

```
$ cd myproject
$ awok wrap kimi

  Verifying lyo workspace... ok
  Wiring 8 hooks into ~/.kimi-code/config.toml... ok
  Launching kimi...

  (kimi session runs normally — hooks are invisible)

$ (kimi exits)
```

Later:
```
$ awok unwrap kimi

  Removing lyo hooks from ~/.kimi-code/config.toml... ok
```

## Architecture

### Commands

| Command | Handler | Description |
|---------|---------|-------------|
| `awok wrap kimi` | `wrapKimi(args)` | Wire hooks + launch kimi |
| `awok unwrap kimi` | `unwrapKimi(args)` | Remove hooks from config |

### Files

| File | Change |
|------|--------|
| `src/cli/commands/wrap.ts` | New — `WRAP_COMMANDS` record + implementation |
| `src/cli/commands.ts` | Add `...WRAP_COMMANDS` to dispatch map |
| `src/cli/output.ts` | Add wrap/unwrap to usage help |
| `tests/wrap.test.js` | New — wiring, removal, idempotency, workspace guard, path computation |

No new dependencies. Uses `child_process.spawn` and `fs` (both Node.js built-ins).

### Hook configuration

8 hooks written to `~/.kimi-code/config.toml` between marker comments:

```toml
# lyo-wrap-begin
[[hooks]]
event = "SessionStart"
command = "node <LYO_ROOT>/src/lyo/selection/session-hook.ts"
timeout = 5

[[hooks]]
event = "SessionStart"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "UserPromptSubmit"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "PreToolUse"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "PostToolUse"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "PostToolUseFailure"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "Stop"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10

[[hooks]]
event = "SessionEnd"
command = "node <LYO_ROOT>/src/cli.ts claude-hook --db-from-event-cwd --spool-dir-from-event-cwd"
timeout = 10
# lyo-wrap-end
```

`<LYO_ROOT>` is the absolute path to the lyo source tree, computed via the same `projectRoot()` function used by `awok init` (walks up 4 dirnames from `src/cli/commands/`).

Two SessionStart hooks serve different purposes:
1. `session-hook.ts` — reads the lesson library and prints learned lessons as additional context for the agent
2. `claude-hook` — records the session start event into the SQLite ledger for ingestion

The remaining hooks (UserPromptSubmit through SessionEnd) all use `claude-hook` with `--db-from-event-cwd` and `--spool-dir-from-event-cwd` flags, which resolve the DB path and spool directory from the event's `cwd` at runtime. This makes the hooks project-agnostic — the same hook commands work for any lyo workspace.

### Config file editing

Marker-based text manipulation — no TOML parser dependency needed.

**Writing (`awok wrap kimi`):**
1. Read `~/.kimi-code/config.toml` as text (empty string if file doesn't exist)
2. Create `~/.kimi-code/` directory if it doesn't exist
3. Search for `# lyo-wrap-begin` through `# lyo-wrap-end` (inclusive)
4. If found → replace the section (updates stale paths on re-wrap)
5. If not found → append the section at the end of the file
6. Write back

**Removing (`awok unwrap kimi`):**
1. Read `~/.kimi-code/config.toml` as text
2. Remove everything from `# lyo-wrap-begin` to `# lyo-wrap-end` (inclusive), including surrounding whitespace
3. Write back
4. If markers not found → no-op, return success

Idempotent: running `awok wrap kimi` multiple times produces the same config state. Re-running updates paths if lyo has moved.

### Process launching

```ts
import { spawn } from 'node:child_process';

function launchKimi(): void {
  const child = spawn('kimi', [], {
    stdio: 'inherit',
    env: process.env,
  });

  // Catch missing binary — spawn emits 'error' if kimi isn't on PATH
  child.on('error', (err) => {
    throw new Error('kimi not found. Install Kimi Code CLI first.');
  });

  // Forward signals to the child process
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(128);
    }
    process.exit(code ?? 1);
  });
}
```

`stdio: 'inherit'` gives kimi full terminal control. Signals are forwarded so Ctrl-C routes to kimi, not the wrapper. The wrapper exits with kimi's exit code.

The `kimi` binary is located via `spawn` — if not on PATH, `spawn` emits an `error` event which is caught and reported as a clear error message.

### Workspace guard

Before wiring hooks, `awok wrap kimi` checks for `pipeline-config.json` in the current working directory. This file is created by `awok init` and indicates a properly initialized lyo workspace.

If the file is missing:
```
Error: No lyo workspace found in <cwd>.
Run 'awok init <folder>' first, then 'cd <folder>' and run 'awok wrap kimi'.
```

This catches the common mistake of running `awok wrap` in a directory that hasn't been initialized, which would cause hooks to fail-open silently (no DB to write to).

## Data flow

```
awok wrap kimi
  │
  ├─ Check pipeline-config.json exists in cwd
  ├─ Compute absolute paths to cli.ts and session-hook.ts
  ├─ Write 8 hooks to ~/.kimi-code/config.toml (marker-based)
  ├─ Spawn kimi as child process
  │
  └─ kimi session runs:
       SessionStart → session-hook.ts (deliver lessons)
                  → claude-hook (record session start)
       UserPromptSubmit → claude-hook (record prompt)
       PreToolUse → claude-hook (record tool start)
       PostToolUse → claude-hook (record tool success)
       PostToolUseFailure → claude-hook (record tool failure)
       Stop → claude-hook (record session stop, drain spool)
       SessionEnd → claude-hook (record session end, drain spool)
  │
  └─ kimi exits → awok wrap exits with same code
```

Hooks remain in config after exit. Future kimi sessions (even without `awok wrap`) will use them until `awok unwrap kimi` is run.

## Error handling

| Condition | Behavior |
|-----------|----------|
| No `pipeline-config.json` in cwd | Error: "No lyo workspace found. Run 'awok init' first." |
| `kimi` not on PATH | Error: "kimi not found. Install Kimi Code CLI first." |
| `~/.kimi-code/` directory doesn't exist | Create it, then write config.toml |
| `~/.kimi-code/config.toml` doesn't exist | Create it with just the lyo hooks section |
| Markers already present | Replace the section (idempotent, updates stale paths) |
| Markers not found on unwrap | No-op, return success |
| Child process killed by signal | Exit with code 128 |

All errors return `{ ok: false, error: { message } }` via the CLI runner's existing error handling pattern.

## Testing

| Test | What it verifies |
|------|-----------------|
| Hook writing | Write to temp file, verify markers present, 8 hooks with correct paths |
| Hook removal | Write then remove, verify file matches original content |
| Idempotency | Write twice, verify single section (no duplication) |
| Stale path update | Write with old path, re-wrap, verify path updated to current |
| Workspace guard | No pipeline-config.json → throws expected error |
| Path computation | Verify absolute paths resolve to `src/lyo/selection/session-hook.ts` and `src/cli.ts` |
| Config creation | Config dir/file doesn't exist → created with correct content |

Process launching is not tested directly (would require spawning a real `kimi` process). The wiring logic and config editing are fully tested.

## Future extensions

- **More harnesses:** `awok wrap claude`, `awok wrap codex`, etc. — each writes to its harness's config format and launches the appropriate binary. The hook set is the same; only the config file path and format differ.
- **Local server:** A background HTTP server that keeps the SQLite DB open and handles hook events via POST, eliminating per-hook process spawn overhead. Also enables auto-running `pipeline learn` after sessions and a learning dashboard.
- **Auto-learn:** After the agent exits, automatically run `pipeline learn` to process the session's traces into lessons.
- **Project-local config:** Write hooks to `<project>/.kimi-code/local.toml` instead of the global config, for better project isolation.
