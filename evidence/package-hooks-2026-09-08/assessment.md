# Installed package and hooks — 2026-09-08

Installed local `lyo-kernel@0.4.0` over 0.3.0 in the existing Node 24.15.0 prefix.
The tested archive SHA-1 was `23637f90960ed7199821a2deed77a4267cf4bcf4`.
Nothing was published to npm.

Fixed the moved session-hook bin, retained all four CLI aliases, made generated
hooks select compiled paths, and made the banner work through npm symlinks.
Codex SessionEnd now persists completion and drains the spool into the bridge.
ECA has a native payload adapter and JSON context delivery, retaining foreground
shell exit codes and distinguishing chats within a workspace cache.

Verification:

- Node 24: 559 tests, 558 passed, one existing skip; typecheck passed.
- Installed-command fixture invoked each configured lifecycle for Codex, Claude,
  and ECA: three deliveries, three completed sessions, three bridge traces, all
  events stamped 0.4.0. See `installed-commands.json`.
- Actual ECA 0.158.0 server: `/hooks` on an isolated chat, then chat deletion,
  produced a delivery and completion trace. See `eca-native-host.json`.
- Codex 0.153.4 hooks/list: eight Lyo handlers enabled and trusted; no errors or
  warnings. Trust was granted through the normal `/hooks` review interface.
- Unrelated settings compared equal to backups, including ECA providers/models.
  Opcore's exact original definition and group position were restored and retained.

Configured user hooks in `~/.codex/hooks.json`, `~/.claude/settings.json`,
`~/.config/eca/config.json`, and `~/.config/eca/config-headroom.json`. Removed the
redundant source-based project Claude banner and updated the manual Codex startup
instruction. All Lyo commands use absolute Node 24 and installed binary paths.
Backups are in `~/.local/state/lyo/install-backups/20260908-202547` and
`~/.local/state/lyo/install-backups/package-20260908-202526`.

Use fresh Codex/Claude sessions; restart the ECA workspace server to reload hooks.
The existing Emacs conversation process was not interrupted. ECA chatEnd is chat
deletion, not a turn ending or a server restart. mlxcel/Qwen model configuration
was preserved. These checks establish wiring, delivery, and recorded observations;
they do not establish learned benefit or successful model use of a lesson.
