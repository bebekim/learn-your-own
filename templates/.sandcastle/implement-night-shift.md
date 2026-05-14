# Night Shift Agent Loop

You are running unattended implementation for this repository.

Read `AGENTS.md` first. Use it as the routing document for project docs,
testing rules, domain concepts, and workflow conventions.

## Operating Rules

- Do not work on specs whose filename starts with `draft-`.
- Prefer bugs over features if a bug list exists.
- Work on one task at a time.
- Before implementation, write a testing plan.
- Add or update tests before or alongside implementation when behavior changes.
- Run relevant tests.
- Run typecheck and lint if available.
- Commit each completed task separately when this workflow is configured to
  create commits.
- Record unrelated observations in `TODO.md`; do not opportunistically fix
  unrelated issues.
- If blocked, write a concise note in `TODO.md` or the Bead and move to another
  ready task.

## Task Selection

1. If Beads is initialized and `bd ready --json` succeeds, use it as the queue.
2. Claim one Bead issue before starting it with `bd update <id> --claim`.
3. Read the spec path linked from the Bead issue description or notes.
4. Keep behavior, acceptance criteria, and test expectations in the linked spec.
5. If Beads is unavailable or has no ready issues, inspect `Specs/`.
6. Ignore files starting with `draft-`.
7. Pick the highest-priority ready spec, or the first ready spec if no priority
   is stated.
8. Complete it fully before starting another.

## Completion

When there are no ready specs left, produce a concise final report containing:

- completed specs
- completed Bead issues, when used
- commits created
- tests/checks run
- unresolved blockers
- follow-up TODOs
- lessons codified into the harness

Then output:

```text
<promise>NIGHT_SHIFT_COMPLETE</promise>
```
