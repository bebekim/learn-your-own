# Night Shift Agent Loop

## Operating Logic

Use the repository workflow as a learning system:

- Treat ready specs as the mission boundary.
- Treat repository docs, tests, templates, and guardrails as leverage.
- Report output against both mission fit and functional quality.
- Surface missing environment context instead of guessing product intent.
- Convert repeated corrections into docs, checks, specs, skills, or guardrails.

## Operating Rules

- Read `AGENTS.md` first.
- Use Beads before non-trivial work. Run `bd ready --json`, create or claim a
  relevant Bead, and link the spec before file edits, commits, infrastructure
  changes, docs/spec changes, or issue/PR implementation work.
- Do not work on specs whose filename starts with `draft-`.
- Prefer bugs and production correctness issues over features when priority is
  otherwise equal.
- Work on one task at a time.
- For process, deployment, data-access, production, or architecture changes,
  run the `.sandcastle/preflight-specs.md` workflow and update
  `Specs/preflight-report.md` before implementation.
- Before implementation, write a short testing plan.
- Add or update tests before or alongside implementation when behavior changes.
- Run relevant tests and checks.
- Commit each completed task separately when commits are part of the workflow.
- Record unrelated observations in `TODO.md`; do not opportunistically fix
  unrelated issues.
- If blocked, write a concise note in `TODO.md` or the Bead and move to another
  ready task.

## Task Selection

1. Run `bd ready --json`.
2. If Beads is initialized and the command succeeds, use Beads as the queue.
3. If a relevant issue exists, claim it with `bd update <id> --claim`.
4. If no relevant issue exists for the requested work, create one with a spec
   path or external ticket reference, then claim it.
5. Read the spec path linked from the Bead issue description or notes.
6. Keep behavior, acceptance criteria, and test expectations in the linked spec,
   not only in the Bead issue.
7. If Beads is unavailable, inspect `Specs/` and record the fallback.
8. Ignore files starting with `draft-`.
9. Pick the highest-priority ready spec, or the first ready spec if no priority
   is stated.
10. Complete it fully before starting another.

## Morning Review

Classify failures and friction:

- unclear mission
- missing domain rule
- missing test/check
- missing fixture/data
- missing architecture boundary
- bad agent execution
- tool/environment failure

Then record the harness update made:

- spec
- doc
- test
- guardrail
- prompt
- Bead dependency
- none, one-off

## Completion Report

When there are no ready tasks left, report:

- completed specs or Beads
- commits created
- tests/checks run
- unresolved blockers
- follow-up TODOs
- reusable lessons codified
