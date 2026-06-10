# Deterministic Classification

Lyo classifies tool telemetry with deterministic rules where the evidence is
clear and leaves ambiguous commands as `unknown`. The classifier should not ask
an LLM to guess ordinary command semantics. LLM judgment can be useful later for
reviewing unknown clusters, but compiler output should remain reproducible.

## Why This Exists

Raw hook telemetry is noisy and tool-specific:

```text
PostToolUse Bash: sed -n '1,80p' file
PostToolUse apply_patch: patch text
PostToolUse Bash: npm test
```

The compiler layer normalizes that into effect-bearing actions:

```text
observe local_file:file
mutate_local local_file:file
verify local_repo:.
```

Compatibility tokens such as `INSPECT`, `EDIT`, and `TEST` are derived from
those actions. They are a lossy view, not the source of truth.

## Rule Discipline

Add a deterministic rule only when the command family has stable semantics.

Good candidates:

- `npm run typecheck` is verification.
- `node --check file` is verification.
- `sqlite3 db "select ..."` is read-only database inspection.
- `sqlite3 db "delete ..."` is local mutation.
- `tar -tzf package.tgz` is archive inspection.
- `xcodegen generate` is local project generation.

Poor candidates:

- `node scripts/custom.mjs` can do anything.
- `python -c "..."` can do anything.
- project-specific subcommands need local meaning unless their name is stable.

`unknown` is an acceptable compiler result. It is better for Lyo to admit that a
command was not understood than to promote a false procedure, critic, verifier,
context pack, or policy from weak evidence.

## Coverage Loop

Run a read-only corpus audit:

```sh
lyo audit --dir ~/repositories
```

Inspect these fields:

```text
normalizedActionRate
unknownActionRate
parkedUnknownActionRate
topUnknownCommands
topParkedUnknownCommands
topMisclassificationCandidates
```

Then repeat:

```text
run audit
-> inspect top unknowns
-> add deterministic rule for the most common clear case
-> rerun audit
-> measure normalized/unknown/misclassification rates
-> repeat until the remaining unknowns are rare or genuinely ambiguous
```

A good classifier change should:

- raise `normalizedActionRate`
- lower `unknownActionRate`
- remove the command family from `topUnknownCommands`
- avoid creating worse `topMisclassificationCandidates`
- include regression tests for both positive and negative cases

Some historical or local tool commands can be parked instead of classified.
Parking means Lyo still records them as unknown actions, but moves them out of
the actionable unknown list so current classifier work is not dominated by
legacy local tooling. Parked commands are reported under
`topParkedUnknownCommands`.

Current parked command families:

- `bd ...`, a local Beads issue-tracker CLI observed in older telemetry.

## Current Deterministic Families

| Command shape | Operation | Intent | Effects/facets |
| --- | --- | --- | --- |
| `npm run typecheck` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `npm run lint` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `npm run build` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `npm run pack:local` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `npm publish package.tgz` | `mutate_external` | `deploy` | writes `external_resource:package_registry`, facets `package`, `network`, `external` |
| `node --test` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `node --check file` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `xcodebuild test` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `xcodebuild build` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `swift test` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `swift build` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `dbt parse` | `verify` | `verify` | reads `local_repo:.`, facets `database`, `test` |
| `dbt test` | `verify` | `verify` | reads `local_repo:.`, facets `database`, `test` |
| `dbt build` | `build` | `build` | reads `local_repo:.`, facets `database`, `package` |
| `sqlite3 db "select ..."` | `observe` | `inspect` | reads database path, facet `database` |
| `sqlite3 db "delete ..."` | `mutate_local` | `implement` | writes database path, facets `database`, `write` |
| `xcodegen generate` | `mutate_local` | `implement` | writes `local_repo:.`, facet `write` |
| `xcrun simctl list ...` | `observe` | `inspect` | facet `read_only` |
| `docker compose up ...` | `mutate_local` | `implement` | writes `local_cache:docker`, facet `write` |
| `emacs --batch ... batch-byte-compile` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `emacs --batch ... "parse ok"` | `verify` | `verify` | reads `local_repo:.`, facet `test` |
| `emacs --batch ... message/princ/...` | `observe` | `inspect` | facet `read_only` |
| `git diff` | `version_control` | `version` | reads `local_repo:.`, facet `git` |
| `git commit` | `version_control` | `version` | repo-level version-control action |
| `tar -tzf package.tgz` | `observe` | `inspect` | reads package path, facet `read_only` |
| `tar -czf package.tgz ...` | `build` | `build` | reads `local_repo:.`, facet `package` |
| `lsof`, `ps`, `stat`, `jq` | `observe` | `inspect` | facet `read_only` |
| `lyo report` | `observe` | `inspect` | local CLI inspection |
| `lyo audit` | `observe` | `inspect` | local CLI inspection |
| `date ...` | `observe` | `inspect` | facet `read_only` |
| `npm view package` | `observe` | `inspect` | reads package registry, facets `package`, `network`, `external` |
| `railway up` | `mutate_external` | `deploy` | writes `external_resource:railway`, facets `deploy`, `cloud`, `external` |

## Test Expectations

Every new classifier family should have tests that prove:

- clear positive examples map to the expected operation and intent
- mutating variants are not classified as read-only
- generic scripts remain `unknown` when their behavior is not inferable
- derived compatibility tokens still match the action predicates

The current regression suite covers package verification/build commands,
classic shell inspection commands, database commands, project generation, and
negative cases such as generic `node scripts/custom.mjs`.
