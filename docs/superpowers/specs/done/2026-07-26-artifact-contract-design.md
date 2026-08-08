# Artifact Contract Design

Date: 2026-07-26
Status: Approved (pending user spec review)
Branch: feature/separation-code-test

## Context

The project converged on a spec-first, isolated, artifact-driven execution model:
a runtime runs stateless transformer agents (code writer, test writer, verifier)
over immutable artifacts, and LYO sits above the runtime learning from traces.
The agreed minimal next step is **one artifact contract** — the stable shapes for
the artifacts that flow through the pipeline. No runner, no LYO consumer yet.

Critical invariant the contract must make checkable:

- code agent cannot see tests
- test agent cannot see code
- both see spec
- runtime sees all
- LYO sees trace after the run
- future runs receive promoted artifacts, not hidden memory

## Decisions

- **Scope: contract only.** Versioned schemas + validation for seven artifacts.
  No stage runner, no verifier execution, no LYO trace consumer.
- **Provenance: hashes by reference.** Every artifact carries `version` and an
  `inputs`/`files` array of `{path, sha256}` refs. No content-addressed store is
  built; the runtime can verify hashes later.
- **lyo-update included, experimental.** Versioned `lyo.lyo-update.v0` to mark
  the shape as provisional until a real LYO consumer exists.
- **Implementation: new `src/contract/` module, zod schemas as source of truth.**
  Types derived via `z.infer` (no interface/validator drift). `zod` becomes
  lyo-kernel's first runtime dependency (MIT, zero-dep itself). Rejected
  alternatives: JSON Schema files as source of truth (extra language + validator
  dependency), hand-rolled validators (drift risk), extending
  `src/compiler/prompt-artifacts.ts` in place (wrong layer — the prompt compiler
  is a consumer of the contract, not its owner).

## Architecture

`src/contract/` — pure module, no file I/O. Zod schemas are the single source of
truth; each artifact exposes `xSchema` and a `validateX(value: unknown)` wrapper
returning `{ ok: true, value } | { ok: false, errors: [{path, message}] }`.
Exported from `src/index.ts` alongside the other public surfaces.

Consumers (prompt compiler today; runner and LYO later) never own shapes.

Files:

- `src/contract/refs.ts` — `ArtifactRef` schema, `hashFile(path)`,
  `hashValue(value)` helpers over `node:crypto`.
- `src/contract/validate.ts` — shared `validateVersioned` wrapper producing the
  stable `{ok, errors}` result shape.
- `src/contract/spec.ts` — spec artifact.
- `src/contract/plan.ts` — plan artifact + `checkBlindness`.
- `src/contract/code.ts` — code manifest.
- `src/contract/test.ts` — test manifest.
- `src/contract/verifier-report.ts` — verifier report.
- `src/contract/trace.ts` — run trace.
- `src/contract/lyo-update.ts` — LYO update (experimental).
- `src/contract/index.ts` — re-exports.

## Artifact shapes

Shared primitives:

- `ArtifactRef = { path: string, sha256: string }` — sha256 validated as
  64 lowercase hex chars.
- Every artifact has a `version` string literal as its discriminant. Wrong or
  missing `version` is a first-class error, not a silent pass.

### 1. `spec.json` — `lyo.spec.v1`

- `specId: string`
- `signatures: string[]` — function/interface signatures
- `invariants: string[]`
- `constraints: string[]`
- `examples: [{ input: string, output: string, note?: string }]`
- `edgeCaseHints?: string[]` — domain-level only. "No implementation hints" is
  a documented convention; it cannot be machine-enforced.

### 2. `plan.json` — `lyo.plan.v1`

- `planId: string`
- `specRef: ArtifactRef`
- `stages: Stage[]`, where `Stage` reuses the authority vocabulary from
  `src/compiler/prompt-artifacts.ts` (including its hyphenated role names):
  - `stageId: string`
  - `role: 'code-writer' | 'test-writer' | 'verifier'`
  - `authority: { read: string[], write: string[], forbiddenRead: string[], forbiddenWrite: string[] }`
  - `inputs: ArtifactRef[]`
  - `outputs: string[]` — paths the stage will produce
- `feedbackPolicy: { codeWriterSees: 'aggregate_only', maxRounds?: number }` —
  `maxRounds` is the code writer's iteration budget against the frozen suite;
  absent means single-pass. On each retry the writer sees only its own previous
  code and the pass/fail counts.
- `stateless: true` (literal)

The blindness invariant is **data in the plan**, statically checkable (below).

### 3. `code-artifact/manifest.json` — `lyo.code.v1`

- `specRef: ArtifactRef`
- `files: ArtifactRef[]`
- `language: string`
- `entrypoint?: string`

Code files live next to the manifest; the manifest is the contract.

### 4. `test-artifact/manifest.json` — `lyo.test.v1`

Same as code manifest, plus:

- `framework: string`
- `frozen: true` (literal) — the test suite is generated once and frozen.

### 5. `verifier-report.json` — `lyo.verifier-report.v1`

- `codeRef: ArtifactRef`
- `testRef: ArtifactRef`
- `specRef: ArtifactRef`
- `counts: { total: number, passed: number, failed: number }`
- `outcome: 'pass' | 'fail' | 'error'`
- `perTest?: [{ name: string, status: 'pass' | 'fail' | 'error', message?: string }]`

The report holds everything (runtime sees all). The aggregate-only restriction
on the code writer's feedback is expressed by `plan.feedbackPolicy`, not by
withholding fields from the report.

### 6. `trace.json` — `lyo.trace.v1`

- `runId: string`
- `planRef: ArtifactRef`
- `stages: [{ stageId, round?, inputs: ArtifactRef[], outputs: ArtifactRef[], model?, promptSha256?, startedAt, finishedAt }]`
  (`round` is set for stages re-run under the feedback loop)
- `feedback?: { rounds: number, stopReason: 'pass' | 'max_rounds' | 'stuck' | 'no_change' }`
  (present when the plan sets `maxRounds > 1`)
- `startedAt: string`, `finishedAt: string`

This is LYO's post-run window: traces, refs, metadata — never hidden memory.

### 7. `lyo-update.json` — `lyo.lyo-update.v0` (experimental)

- `basedOnTraces: ArtifactRef[]`
- `promotions: [{ artifactRef: ArtifactRef, scope: string, rationale: string }]`
- `beliefUpdates?: [{ key: string, value: unknown, rationale: string }]`

Versioned v0: the shape may change freely until a real LYO consumer exists.

## checkBlindness

`checkBlindness(plan) → { ok: boolean, violations: string[] }` — pure function
over a parsed plan:

- the `code-writer` stage's `forbiddenRead` covers every `test-writer` output path;
- the `test-writer` stage's `forbiddenRead` covers every `code-writer` output path;
- both stages' `authority.read` include the spec path;
- `feedbackPolicy.codeWriterSees` is `'aggregate_only'` (enforced by the schema
  literal, re-stated as a violation if the plan was constructed loosely).

## Data flow

The module is inert: nothing reads or writes files. Producers (task author →
spec; runtime → plan/manifests/report/trace; LYO → lyo-update) build plain
objects, validate, then write. Consumers `safeParse` unknown JSON and refuse to
proceed on failure. `refs.ts` hash helpers are the only I/O-adjacent code and
are not part of the schemas.

## Error handling

- Validators never throw on bad data; failure returns
  `{ ok: false, errors: [{ path, message }] }` — a thin, stable formatter over
  zod issues so the error shape survives a future validator swap.
- Wrong/missing `version` produces a dedicated message naming expected vs got.
- Throwing is reserved for programmer errors (schema bugs), surfacing in tests
  at module load, not at runtime.

## Testing

`tests/contract.test.js` in the existing `node --test` style:

- one valid fixture per artifact, round-tripped through `safeParse`;
- negative cases per artifact: missing version, wrong version, malformed
  sha256, empty required array, wrong literal (`frozen`, `stateless`,
  `codeWriterSees`);
- `checkBlindness`: compliant plan passes; plan missing a forbidden path fails
  with a named violation; spec-not-shared fails.

Fixtures live in `tests/fixtures/contract/` and double as the canonical
examples of each artifact.

## Explicitly out of scope

- Stage runner / permission enforcement at execution time
- Verifier execution (running tests against code)
- Content-addressed storage
- LYO trace consumer emitting lyo-update.json
- Machine enforcement of "no implementation hints in spec" (convention only)
