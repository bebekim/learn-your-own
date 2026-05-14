# Beads Workflow

Use Beads as the operational queue and dependency graph.

## Rules

- Use `bd ready --json` before non-trivial work.
- Claim one issue before starting it.
- Link each Bead to a spec path or external issue when possible.
- Use dependencies for blockers and ordering.
- Use `discovered-from` for follow-up work found while implementing.
- Close a Bead only after implementation and checks pass.

## Common Commands

```sh
bd ready --json
bd show <id> --json
bd update <id> --claim --json
bd create "Title" -t task -p 1 --description "Context" --json
bd dep add <child-id> <parent-id>
bd close <id> --reason "Done" --json
```
