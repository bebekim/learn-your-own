# IBM Bob hook installation — 2026-09-08

Rebuilt and locally installed `lyo-kernel@0.4.0` with `bob-hook`. All 170 package
files matched the tested build. Archive SHA-256:
`2c625e95c608864397e80c758a8cd7fae0b87f93d4eec877f9a2ef11a423d38c`.
This is a local build, not a new npm registry publication.

Seven handlers in `~/.bob/settings/settings.json` connect Bob Shell 2.0.2 and
IBM Bob IDE 2.1.0 to the existing absolute Node 24 and installed Lyo executables.
They capture five events and emit lesson context on SessionStart/UserPromptSubmit.
Other Bob settings were compared with the backup and preserved.

Verification: 559 tests passed, one existing skip, typecheck passed. Compiled
package tests cover both documented and installed payload formats, npm executable
symlinks, working-directory fallback, redaction, continued tasks, spool draining,
and absence of invented exit evidence or premature outcome credit.

An actual Bob Shell ACP session in an isolated temporary workspace invoked the
globally configured capture and lesson handlers. Its native SessionStart and
UserPromptSubmit events were ingested as platform `bob`; the isolated lesson
store contains a delivery receipt. A workspace input hook deliberately stopped
the probe before model execution. Tool and Stop events were tested through
compiled fixtures; the IDE integration was checked against its installed hook
implementation and shared settings, not through an IDE model conversation.

The installed Shell and IDE both call Stop after turns and can continue the same
task. They expose no SessionEnd hook. Bob shell text also does not reliably
separate numeric command status from arbitrary output. Consequently, this hookup
collects activity and delivers lessons but cannot automatically close Bob tasks
and award verifier-based outcome credit. Delivery is not proof of causal benefit.
See [the workflow and manual completion commands](../../docs/hook-installation.md).

Start a fresh Bob task (or resume one) to receive session lessons. Hooks are read
from the shared global configuration; existing trust controls still apply.

Machine-readable results and backup location: [verification.json](verification.json).
Contracts: [IBM Shell hooks](https://bob.ibm.com/docs/shell/configuration/lifecycle-hooks),
[IBM IDE hooks](https://bob.ibm.com/docs/ide/configuration/lifecycle-hooks), and the
installed bundles. Runtime behavior above takes precedence over documentation
that describes Stop as an ended session.
