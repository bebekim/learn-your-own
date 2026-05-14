# Spec Preflight

You are running spec preflight for this repository.

Read:

1. `AGENTS.md`
2. `AGENT_LOOP.md`
3. `docs/beads.md` if available
4. `docs/review-lenses.md` if available
5. `docs/token-calibration.md` if available
6. Relevant files under `docs/`
7. All Markdown files in `Specs/`

## Goal

Find uncertainty before unattended implementation runs. Do not implement product
code. Do not opportunistically fix unrelated issues.

## Review Rules

- Review both `draft-*` and non-draft specs.
- Treat `draft-*` specs as not ready unless the content clearly says otherwise.
- Treat non-draft specs as risky if they still need clarification.
- Recommend at most three review lenses for each risky spec.
- Flag missing token blocks for non-trivial implementation specs.
- Treat outside-circle-of-competence specs as risky unless they name the
  stakeholder, missing ingredients, and stop condition.
- Identify dependencies between specs and mirror them as recommended Beads links.
- Identify missing docs, fixtures, environment variables, credentials, external
  services, migrations, or test commands.
- Identify contradictions between specs and existing project docs.
- If a spec is ready, say why.
- If a spec is not ready, list exact questions or edits needed.
- If a spec has no `## Test Plan`, mark it `needs-clarification`.

## Beads

If `.beads/` is initialized and `bd` is available:

- Check `bd ready --json`, `bd list --json`, and `bd blocked --json`.
- Mention mismatches between ready specs and Beads issues.
- Recommend exact `bd create`, `bd update`, and `bd dep add` commands for
  missing queue/dependency state.
- Prefer `--json` for agent-readable Beads output.
- Do not create or mutate Beads issues unless explicitly requested.

If Beads is unavailable, note that in the report and continue from `Specs/`.

## Output

Write or update `Specs/preflight-report.md` with:

- summary
- specs reviewed
- readiness table
- recommended review lenses
- token block and competence notes
- dependency graph
- Beads sync notes
- clarification questions
- recommended doc updates
- recommended filename changes
- specs safe for unattended work

Use these states:

- `draft`
- `needs-clarification`
- `blocked`
- `ready`
- `done`

When complete, output:

```text
<promise>SPEC_PREFLIGHT_COMPLETE</promise>
```
