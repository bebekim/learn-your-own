# Platform Support

Current runtime:

- macOS with Bash-compatible shell
- Linux with Bash-compatible shell
- Windows through WSL or a compatible Unix-like shell

Not currently supported:

- native Windows PowerShell
- native Windows CMD

Stable cross-platform contract:

- skill names and boundaries
- `.agent-learning/task-manifest.yaml` shape
- Dolt ledger schema
- recorded evidence semantics

Replaceable adapter:

- shell scripts under `scripts/`
- path handling
- install commands
- future CLI implementation language

Do not encode POSIX-only behavior into the manifest or ledger schema. If native
Windows support becomes necessary, add a portable CLI adapter while preserving
the observer contract.
