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

Capture commands use `--db-from-event-cwd --spool-dir-from-event-cwd`.
Codex and Claude capture SessionStart, UserPromptSubmit, PreToolUse, PostToolUse,
Stop, SessionEnd; Claude also captures PostToolUseFailure.
ECA captures chatStart, preRequest, preToolCall, postToolCall, postRequest, chatEnd.
Set ECA's postToolCall hook `runOnError: true` so failed checks are retained.

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
`tests/package.test.ts` exercises npm-style symlinks and the compiled learning loop
with isolated ledgers; it never populates the user's lesson library.
