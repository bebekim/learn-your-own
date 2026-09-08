# Local package and agent hooks

Build and install the same artifact you tested:

```sh
rtk npm test
rtk npm run typecheck
rtk npm run pack:local
rtk npm install -g ./dist/lyo-kernel-0.4.0.tgz
```

Use one Node 24+ installation for both npm and the hooks. GUI applications may
have a different PATH: configure absolute paths to that Node executable and its
installed `bin/lyo` / `bin/lyo-session-hook`. Source checkout paths are unnecessary.
The package retains `lyo`, `awok`, `wok`, and `lyo-session-hook` executables.

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
