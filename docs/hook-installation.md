# Install Lyo and connect agent hooks

For a first evaluation, run the [isolated demo](../README.md#run-the-demo).
It does not change your agent configuration or use a model API.
This guide connects ordinary sessions to the source/local release
`0.4.3-adaptive.8` (11 September 2026).

## Build the current package

Use one Node.js 24+ installation for npm and the hooks. From the checkout:

```sh
npm ci
npm test
npm run typecheck
npm run pack:local
npm install -g ./dist/lyo-kernel-0.4.3-adaptive.8.tgz
command -v node
command -v lyo
command -v lyo-session-hook
```

Record those executable paths for the configuration below. GUI applications may
have a different PATH. The package provides `lyo`, the `awok`/`wok` aliases, and
`lyo-session-hook`.

npm's `latest` tag was `0.2.0` when checked on 11 September 2026. A plain registry
install therefore does not provide the workflow described here. Building this
checkout avoids that release mismatch; registry publication is separate work.

## Know which SQLite store you are using

| Store | Default location | Contents |
|---|---|---|
| Repository telemetry | `<project>/.agent-learning/learning.sqlite` | Local sessions and hook events; incoming events first spool under `.agent-learning/hook-spool/` |
| Personal central corpus | `~/.lyo/corpus.sqlite` | Imported `corpus_events`, normalized actions/effects and task-workflow evidence |
| Lesson/finding store | `~/.zeroshot/lyo-lessons.db` | Lesson library; finding deliveries, registrations, checks, reviews and policy receipts in `learning_trace` |

The telemetry corpus and lesson store have different roles and schemas. Do not
point `--store` at the telemetry corpus. A hook looks for an existing store in
`ZEROSHOT_LYO_STORE_PATH`, then the project's `.zeroshot/lyo-lessons.db`, then the
home-directory store. Keep the same lesson store throughout a trial.

To create an empty personal lesson store and list its trial definitions:

```sh
mkdir -p ~/.zeroshot
lyo finding trials --store ~/.zeroshot/lyo-lessons.db
```

An empty trial list is expected on a new installation. The reasoning mandate
refreshes even without lessons; useful advice is not fabricated to fill a banner.

## Codex and Claude Code

Merge the following event entries into your host's existing configuration;
preserve unrelated hooks. Replace all three executable placeholders with the
absolute paths discovered above.

- Codex: `~/.codex/hooks.json`.
- Claude Code: `~/.claude/settings.json`.
- Replace `HOST-hook` below with `codex-hook` or `claude-hook` respectively.

```json
{
  "hooks": {
    "SessionStart": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 10},
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo-session-hook", "timeout": 5}
    ]}],
    "UserPromptSubmit": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 10},
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo-session-hook", "timeout": 5}
    ]}],
    "PreToolUse": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 10}
    ]}],
    "PostToolUse": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 10}
    ]}],
    "Stop": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 30}
    ]}],
    "SessionEnd": [{"hooks": [
      {"type": "command", "command": "/absolute/path/to/node /absolute/path/to/lyo HOST-hook --db-from-event-cwd --spool-dir-from-event-cwd", "timeout": 30}
    ]}]
  }
}
```

For Claude, also add `PostToolUseFailure` using the same capture handler as
`PostToolUse`. Codex reports failed commands through its supported tool-result
contract; do not assume every host exposes Claude's event set.

Leave SessionStart without a source matcher: `source: "compact"` restores context
after compaction. UserPromptSubmit refreshes the next turn. The session hook emits
the standing proxy-versus-witness mandate, rechecks eligible lessons and keeps
trial no-advice assignments unexposed. The capture handler records events and runs
registered trial/evidence work; the session hook supplies ordinary guidance.

New hook definitions may need host reload/trust review. For Codex, inspect `/hooks`
and follow its review flow. Upgrading the package at unchanged executable paths
requires no configuration change: the next hook invocation loads the new package.
Verify fresh receipts rather than treating a restart as evidence that capture works.
See the [Codex hook contract](https://learn.chatgpt.com/docs/hooks) and
[Claude hook contract](https://code.claude.com/docs/en/hooks).

## Optional central collection

Create `~/.lyo/config.json` with the absolute parent directory you want to collect
and your desired central corpus path. Replace these illustrative paths:

```json
{
  "rootDir": "/home/you/projects",
  "corpusPath": "/home/you/.lyo/corpus.sqlite"
}
```

With that config, capture commands connect workspaces on SessionStart and
UserPromptSubmit, then sync again at Stop/SessionEnd. Directories outside the
configured root are not automatically connected. Local capture remains available
if central sync fails; the error is reported on stderr.

```sh
lyo connect --path /absolute/path/to/project
lyo sync connected --discover
lyo corpus report --db ~/.lyo/corpus.sqlite
```

From a repository, create and connect a worktree together:

```sh
lyo worktree add ../my-fix --branch fix/my-fix
```

This requires Git's normal worktree prerequisites. Failed connection reports a
retry command and preserves the worktree. Existing repositories keep their own
ledgers; imported rows retain source identity. `LYO_CONFIG_FILE` overrides the
config path, which is useful for isolated tests.

Opening a directory in an editor does not itself guarantee collection. Agent
hooks and explicit `lyo connect` provide the connection boundaries. A shell
`chpwd` callback or a scheduler can invoke connection/sync commands, but `npm install`
does not install a directory watcher or a macOS LaunchAgent. The author's dated
rollout records describe such optional local wiring, not a universal installer.

## Other adapters

| Host | Capture | Delivery | Current limit |
|---|---|---|---|
| ECA / Emacs | `lyo eca-hook` on chatStart, preRequest, preToolCall, postToolCall, postRequest, chatEnd | Built into chatStart/preRequest as JSON `additionalContext` | Does not join the Codex/Claude adaptive trial contract |
| IBM Bob Shell / IDE | `lyo bob-hook` on SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop | Separate `lyo-session-hook` on SessionStart/UserPromptSubmit | No reliable automatic task-end/verifier-status contract in the checked Shell adapter |
| Kimi Code CLI | `lyo wrap kimi` wires its supported config and launches Kimi | Uses the wrapper's hook configuration | Kept distinct from native Claude adaptive experiments |
| Gemini / Antigravity / Deep Agents Code | `gemini-hook`, `agy-hook`, `dcode-hook` | Host-specific coverage | Capture adapters are not evidence of equivalent trial support |

ECA postToolCall must set `runOnError: true` to retain failed checks. Restart its
workspace server after changing configuration. ECA chatEnd means chat deletion;
a finished turn or server shutdown is not an ended resumable chat. MLX models
are observed through the host that invokes them, not through a direct Lyo/model link.
[ECA contract](https://eca.dev/config/hooks/)

Bob uses `~/.bob/settings/settings.json`. Capture commands use
`--db-from-event-cwd --spool-dir-from-event-cwd`; discard their JSON stdout with
`>/dev/null` in Bob's plain-text context channel, and keep the separate lesson
handler's stdout. When cwd is absent, the hook process's directory is used.
Checked Shell 2.0.2 Stop events end turns, not necessarily the task. A genuine task
completion can use `lyo session-end --session-id ID --db <local-ledger>`, followed
by explicit bridge inspection. Text saying “Exit code: 0” is not sufficient status
evidence. [Bob Shell](https://bob.ibm.com/docs/shell/configuration/lifecycle-hooks) ·
[Bob IDE](https://bob.ibm.com/docs/ide/configuration/lifecycle-hooks)

## Verify capture, then start a reviewed trial

1. Start an ordinary session and run a harmless command through the host.
2. Check its actual session ID in the local ledger and incoming spool. Require
   fresh events from the installed package; pending import is not missing capture.
3. Inspect the lesson store's delivery records separately. Emission is not adherence.
4. Register a real reusable [finding trial](prospective-finding-trials.md) before
   its target action. Installation alone does not choose a sound trigger/evaluator.
5. Use `lyo finding trials`, `finding trial-report` and `finding inspect` with the
   same `--store` to inspect assignments, evidence, unknowns and policy changes.

The [registered evidence guide](scoped-session-findings.md) explains semantic
review, paired action capture, automatic assessment and recovery. Do not replay
synthetic host events into the personal store to manufacture a live trial.
`tests/package.test.ts` and the README demo use isolated stores for that purpose.

Spool catch-up and explicit assessment of already completed sessions are available:

```sh
lyo normalize hooks --db .agent-learning/learning.sqlite --spool-dir .agent-learning/hook-spool
lyo bridge --db .agent-learning/learning.sqlite --all --store ~/.zeroshot/lyo-lessons.db
```

Missing historical numeric verifier status remains unknown. Collection, bridge
observations and prompt refresh never by themselves establish useful learning.
