# Local package and agent hooks

Build and install the same artifact you tested:

```sh
rtk npm test
rtk npm run typecheck
rtk npm run pack:local
rtk npm install -g ./dist/lyo-kernel-0.4.3-adaptive.4.tgz
```

Use one Node 24+ installation for both npm and the hooks. GUI applications may
have a different PATH: configure absolute paths to that Node executable and its
installed `bin/lyo` / `bin/lyo-session-hook`. Source checkout paths are unnecessary.
The package retains `lyo`, `awok`, `wok`, and `lyo-session-hook` executables.

## Automatic central collection

`~/.lyo/config.json` selects the directory tree and the central corpus:

```json
{
  "rootDir": "/Users/marcus.kim/repositories/work",
  "corpusPath": "/Users/marcus.kim/.lyo/corpus.sqlite"
}
```

With this config, the installed Codex, Claude, ECA, and Bob capture commands
connect workspaces on SessionStart/UserPromptSubmit and sync again on Stop or
SessionEnd. ECA's translated chat events use the same path. Hooks retain local
capture if the central database is unavailable and report the sync error on
stderr. Directories outside the configured root are untouched.

Create and connect an ordinary worktree in one command (no pipeline spec needed):

```sh
rtk lyo worktree add ../billing-fix --branch fix/billing
```

The existing `--spec` pipeline workflow remains available. Connection failure
reports the worktree that Git created and the retry command; it does not remove
your worktree. Reconnect an existing checkout or ordinary directory with:

```sh
rtk lyo connect --path ~/repositories/work/nectr-data-lake-billing-checks
rtk lyo sync connected --discover
rtk lyo corpus report --db ~/.lyo/corpus.sqlite
```

The local setup sources `~/.lyo/workspaces.zsh` from `.zshrc`. Its `chpwd` hook
connects directories under the configured work tree, including the initial
directory of a new terminal. A cd into a Git subdirectory connects the Git root.
Existing terminals can load it with `source ~/.lyo/workspaces.zsh`.
Agent session startup covers agent use from editors; simply browsing a folder in
Finder or Emacs does not itself fire an agent hook.

The user LaunchAgent `com.lyo.workspace-sync` runs `lyo sync connected --discover`
every 60 seconds and at login. It drains pending hook packets, discovers existing
workspace ledgers, and retries connections without requiring a final session
event. Logs live in `~/.lyo/workspace-sync.log` and `workspace-sync.err.log`.
Inspect it with `launchctl print gui/$(id -u)/com.lyo.workspace-sync`.

Central imports compare event identities and contents, refresh changed runs, and
commit each ledger atomically. Hash IDs and resumed runs cannot strand later
events behind a cursor. Existing worktree and repository databases stay separate;
central rows retain their source path. The corpus contains telemetry and derived
actions/effects; the session learning bridge still uses repository ledgers and
the lesson store described below. Collection alone does not grant learning credit.
`LYO_CONFIG_FILE` overrides the config path for isolated verification.

| Host | Capture command | Delivery | Completion |
| --- | --- | --- | --- |
| Codex | `lyo codex-hook` | `lyo-session-hook` on SessionStart and UserPromptSubmit | SessionEnd |
| Claude Code | `lyo claude-hook` | `lyo-session-hook` on SessionStart and UserPromptSubmit | SessionEnd |
| ECA / Emacs | `lyo eca-hook` | Built into chatStart and preRequest, as JSON additionalContext | chatEnd |
| IBM Bob Shell / IDE | `lyo bob-hook` | `lyo-session-hook` on SessionStart and UserPromptSubmit | Explicit task completion; no SessionEnd hook |

Capture commands use `--db-from-event-cwd --spool-dir-from-event-cwd`.
Codex and Claude capture SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
Stop, SessionEnd; Claude also captures PostToolUseFailure.
ECA captures chatStart, preRequest, preToolCall, postToolCall, postRequest, chatEnd.
Set ECA's postToolCall hook `runOnError: true` so failed checks are retained.

Bob uses global `~/.bob/settings/settings.json`, shared by Shell and IDE. Add
command handlers for SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop.
Use `lyo bob-hook --db-from-event-cwd --spool-dir-from-event-cwd >/dev/null` for
capture (with absolute Node and executable paths). Discarding the CLI's JSON keeps
it out of Bob's plain-text context channel. Add a separate `lyo-session-hook`
handler on SessionStart and UserPromptSubmit; its stdout supplies the lessons.
Both commands accept the documented Bob payload and installed Shell 2.0.2 payload;
when cwd is absent, the hook process's working directory supplies it.

Bob Shell 2.0.2 calls Stop after each successful turn, with the same task ID on
later prompts. Stop drains capture but must not permanently close that task.
Bob also lacks reliably separated numeric exit status in its shell hook output;
text that happens to say `Exit code: 0` is not verifier evidence. This connection
captures activity and delivers lessons, but does not automatically award outcome
credit. When a task is truly finished, existing `lyo session-end --session-id ID`
and `lyo bridge --session ID` can close and assess its ledger (use the workspace's
`--db .agent-learning/learning.sqlite`). Without numeric verifier evidence the
bridge abstains. A future Bob completion/status API can remove this manual step.

Events spool beneath the workspace's `.agent-learning/`; Stop/postRequest drains
them into `learning.sqlite`. Completion also drains and runs the learning bridge.
ECA session IDs combine its workspace cache key with the chat ID. Ending a turn
or shutting down ECA does not imply that a resumable chat has ended: ECA chatEnd
fires when a chat is deleted. Numeric foreground shell exit status is retained;
background and timeout messages do not manufacture verifier evidence.

Lessons use the existing workspace/global `.zeroshot/lyo-lessons.db` store (or
`ZEROSHOT_LYO_STORE_PATH`). A delivery trace proves context was emitted; a bridge
trace proves observations were assessed. Neither proves a lesson caused success.

After changing hooks, start a fresh agent session. Codex requires review of changed
hook definitions through `/hooks`; check that each Lyo hook is enabled and trusted.
Restart the ECA workspace server to reload its config; model/provider settings are
independent of this connection.

Contracts checked against [Codex hooks](https://learn.chatgpt.com/docs/hooks) and
[ECA hooks](https://eca.dev/config/hooks/), including ECA 0.158.0 source.
Bob contracts: [Shell hooks](https://bob.ibm.com/docs/shell/configuration/lifecycle-hooks)
and [IDE hooks](https://bob.ibm.com/docs/ide/configuration/lifecycle-hooks), checked
against the installed Shell 2.0.2 bundle; its Stop behavior is more limited than
the documentation's description of an ended session.
`tests/package.test.ts` exercises npm-style symlinks and the compiled learning loop
with isolated ledgers; it never populates the user's lesson library.

## Finding feedback in ordinary sessions

The `0.4.3-adaptive.4` CLI captures declared finding actions synchronously at
Codex/Claude PreToolUse and PostToolUse boundaries, before spool replay. It measures
and assesses them using the registered evaluator and attributed semantic review.
The paired session hook surfaces pending reviews and reads current validity, so
CLI and delivery must use the same package and delivery store. No SessionEnd is
needed. See [input contracts and recovery](scoped-session-findings.md).

Exact tool-call binding follows [Codex hooks](https://learn.chatgpt.com/docs/hooks)
and [Claude hooks](https://code.claude.com/docs/en/hooks), checked 2026-09-10.
Review prompts prove delivery only. The user/agent still declares a relevant
opportunity and reviews what its evaluator means; no background model invents
semantic judgments.
