# Harness Doctor

You are checking whether this repository is ready for reliable preflight and
unattended implementation.

Read:

1. `AGENTS.md`
2. `AGENT_LOOP.md`
3. repository metadata such as package files, README, env examples, and CI files
4. `.sandcastle/sandbox.json`

Do not implement product features.

## Checks

Verify whether these exist and are useful:

- `AGENTS.md`
- `AGENT_LOOP.md`
- `.sandcastle/implement-night-shift.md`
- `.sandcastle/preflight-specs.md`
- `.sandcastle/sandbox.json`
- `Specs/README.md`
- `docs/README.md`
- `docs/testing.md`
- `docs/architecture.md`
- `docs/domain.md`
- `docs/style-guide.md`
- `docs/common-pitfalls.md`
- `TODO.md`
- `CHANGELOG.md`
- exact test, lint, typecheck, and build commands
- local setup instructions
- ready specs and draft specs are distinguishable

## Output

Write or update:

```text
docs/harness-doctor.md
```

The report must include:

- overall readiness score from 0 to 5
- missing files
- stale or placeholder files
- missing commands
- missing environment/setup notes
- spec readiness concerns
- recommended next edits
- suggested mechanical checks to add

When complete, output:

```text
<promise>DOCTOR_COMPLETE</promise>
```
