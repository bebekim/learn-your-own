# Refactor the learning evidence boundary

Status: ordinary finding assessment, lifecycle, selection and live-boundary
orchestration have inward dependency boundaries. The broader legacy LYO refactor
remains incremental.
Branch: `refactor/evidence-domain`. Scope: an incremental refactor of the ordinary
finding loop, with existing CLI contracts and stored receipts preserved.
The [domain glossary](../CONTEXT.md) defines the language. The product's useful
learning acceptance remains [Spec 8](../Specs/8-learning-evidence-loop.md).

## Problem

The current runtime already distinguishes emission, adherence, prediction support
and comparative outcomes. The architectural weakness is ownership of those rules.
Before the first slice, automatic capture obtained a full inspection report,
extracted its `reviewTemplate`, and fed that presentation object back into learning
writes. The feedback writer and wording revision also read the inspection projection
to obtain domain state. That coupled report/template changes to consequential
evidence transitions; the first slice removed this dependency.

The wider system also uses the word outcome for a check result, prediction support,
task acceptance and comparative benefit. These are different claims with different
witness requirements. SQL envelopes and booleans must not silently substitute for
those distinctions. A field named `verified` would not establish its own truth.

## First interface

```ts
assessFindingEvidence(store, evidenceRef): Feedback | null
```

In the existing code and journal, these assessments retain the `Feedback` type
and `session-finding-feedback@2` envelope for compatibility. The domain operation
makes their meaning explicit without a schema migration.

The caller supplies the identity of retained evidence. This operation resolves
its current integrity and semantics, finds the current assessment for that
opportunity, and records the checked conclusion or returns null if no recording
is needed. It accepts no caller-selected applicability, adherence or outcome.
The existing manual-feedback boundary still validates every submitted judgment.

Inspection renders a proposal from the same checked result; the automatic write
path does not consume an operator template. Existing receipt IDs, evidence hashes,
predecessor rules, rationale, transaction boundaries and correction history remain
compatible. Measurement commits before assessment, so retrying an assessment does
not rerun an evaluator on later source state.

Combining measurement and assessment would couple acquisition to a conclusion that
can be revised without new measurement. The public retained-reference operation
is unchanged. Its application implementation now owns a narrow evidence projection
and I/O port; the SQLite adapter supplies them. No generic repository framework or
new public receipt representation is needed.

## Dependency strategy

Source dependencies point inward: interface and infrastructure depend on
application contracts; application depends on domain. The domain never imports
SQLite, hooks, CLI code or application orchestration. Application use cases need
ports they own for I/O; concrete adapters implement those ports and are wired at
the outer composition boundary. Runtime calls can reach an adapter through a port
without importing its implementation into the application.

The implemented boundaries are:

| Layer | Current code |
|---|---|
| Domain | `domain/finding-assessment.ts` interprets declared witnesses; `domain/finding-lifecycle.ts` decides support, contradiction, scope-review needs and revision reassessment; `domain/finding-trial-policy.ts` computes comparative policy from checked observations. All are under `src/lyo/` and have no imports or I/O. |
| Application | `application/finding-assessment.ts` owns assessment/revision operations and pending-review decisions; `application/finding-workflow.ts` owns capture/measurement ordering; `application/finding-selection.ts` owns banner eligibility and scoped support counts. Their ports describe required I/O without importing concrete adapters. |
| Interface | CLI/hook parsing, operator templates and formatting retain existing entry points. `selection/session-findings.ts` delegates writes and selection to application operations; `selection/session-finding-workflow.ts` composes capture adapters and delegates ordering and review status. |
| Infrastructure | `storage/finding-evidence.ts` reads retained receipts and validates integrity/binding. `storage/finding-state.ts` assembles checked state and implements the assessment port. Active capture and verifier execution retain compatibility modules under `selection/`. |

The evidence reader calls the domain assessment rule after checking retained
receipt integrity and binding. Existing SQLite, retained files and bounded verifier
processes remain the real test adapters. Port types are not evidence that a claim
is true: the concrete adapter still rechecks the retained witnesses.

## Domain boundaries and next slices

| Boundary | Owns | Must not infer |
|---|---|---|
| Host/evaluator adapters | What a host or check actually reported, with provenance and failure modes | Delivery from assignment; correctness from process completion |
| Evidence validation | Binding, identity, order, integrity and the current attributed semantic review | Semantic correctness merely from a valid hash |
| Assessment | Applicability, adherence and prediction support for the declared claim | Benefit from one passing application |
| Trial policy | Comparison within the frozen scope; promotion, pause and correction | General applicability from a local result; causal harm from a monitoring failure |
| Application workflow | Capture/measurement/assessment order, retries and transactions | A new observation from replaying old events against today's files |
| Persistence | Retained observations and traceable decisions | Extra evidential weight from duplicate rows |
| Presentation | Operator reports, review prompts and host context formatting | Authority to originate a stronger assessment |

The first slice removed inspection-template dependence from assessment writes.
The second extracted lifecycle rules and removed the runtime cycle between finding
state, evidence and capture. The third moved assessment, selection and boundary
ordering behind application-owned ports, extracted observation and trial-policy
rules, and removed the remaining LYO import cycles. Finding state still assembles
SQLite records and rechecks assessment bindings before calling the domain.
Next, give advice exposure one owner across banners, review queues, assignment and
compaction refresh. Preserve control-arm withholding in every route.

The separate legacy lesson-credit and native task paths need their own explicit
contracts before their terminology can be unified. TypeScript migration follows
those boundaries, with complete typecheck coverage; renaming every historical
fixture is not part of this work.

## Verification

- Exercise assessment through its operation with real retained evidence: unknown
  semantics → accepted semantics → disputed semantics, preserving the measurement,
  correction ancestry, one support count and unknown incremental benefit.
- Reuse current live Codex/Claude, no-advice, invalid evidence, correction,
  revision, ordinary-trial and package boundary tests. New observation claims
  require distinguishing counterexamples, not only happy-path confirmations.
- Keep manual inspection templates and automatic receipt identities compatible.
- Architecture assertions should check dependencies or observable boundaries;
  a filename's existence cannot witness correct domain ownership.
- No existing behavioral tests become redundant in this slice. Do not delete them
  merely because source files were reorganized.

Known limits retained: an emitted-context receipt does not acknowledge host receipt
or model attention; semantic review remains attributed judgment; withdrawing
measurement evidence can cause repeated automatic unknown assessments under the
existing policy. Changing that correction behavior needs its own explicit test
and scope, rather than an incidental refactor.

## First-slice result

Automatic hooks now call `assessFindingEvidence` with a retained evidence reference.
Manual feedback and wording revision read finding state directly. Operator
inspection renders the shared assessment input, and no longer supplies an
intermediate object needed by those writes. The storage/evidence module cycle
remained after this first slice.

TDD: 48 existing boundary tests passed before changes. The new assessment test
failed for the missing operation, then passed after implementation and refactor.
The focused suite passed 51 tests; the full suite passed 673 with one skipped
(674 total), and typecheck passed on Node 24.15.0. This verifies the refactor's
contracts; it does not establish evaluator quality or beneficial learning.

Opcore's changed-code check also completed with exit 0 after graph refresh.
Its activation report still marks Python/Rust tooling as degraded; that is not
claimed as coverage for those stacks. CLI formats and installed hooks were not
changed or rolled out by this slice.

## Second-slice result

`findingLifecycle` now owns lifecycle decisions over plain domain values. Its
caller still rechecks assessment identity, binding, current evidence hash and
judgments against retained receipts before passing them in. The domain type is
not proof that an assessment is true. A revision loses its usable premise when
the checked counterexample supporting that revision is removed; a later successful
application cannot repair that missing premise.

Retained opportunity, action, model, semantics and measurement readers now share
`src/lyo/storage/finding-evidence.ts`. They import no current finding state, capture
writer or verifier runner. The old modules keep their public reader exports for
compatibility. Receipt schemas, identity hashes, ordering, correction ancestry
and no-advice behavior are preserved. Reading evidence reinterprets retained
observations against current corrections without rerunning checks.

The architecture guard initially failed on the real capture → state → evidence →
capture cycle. It now checks both ordinary finding and trial modules transitively,
including re-exports and literal imports. Domain dependencies are checked even
when type-only. Runtime traversal preserves value imports while removing explicit
type-only imports, matching the Node runtime's distinction. This is an import
boundary check, not a proof that every rule is in the correct layer.

TDD: the domain counterexample test failed for the missing operation, then passed.
All 72 focused tests passed, and the expanded dependency checks and typecheck
passed. An independent static review found no functional regression; it identified
two guard gaps (trial roots and value-import preservation), both corrected before
final verification. The architecture tests and domain test are included in strict
typechecking; historical test coverage remains incremental.

The full suite passed 677 tests with one skipped (678 total) on Node 24.15.0.
Opcore then flagged the expanded architecture test exceeding its 300-line policy.
The finding dependency checks moved into `tests/finding-architecture.test.ts`;
all 20 architecture checks and typecheck passed after that test-only move.
After graph refresh, Opcore's final changed-code check passed with exit 0.
The previously reported degraded Python/Rust toolchains remain outside this
verification claim. This slice is committed on the feature branch; it has not
been merged, published or installed into live hooks.

## Third-slice result

Assessment and revision now use an application-owned port implemented by SQLite.
The domain interprets applicability, adherence and prediction witnesses; application
operations preserve validation, retry and transaction ordering. An existing revision
can be retried after its supporting evidence is withdrawn, but feedback must still
match the current evidence before an identical receipt can be returned. Automatic
correction records an unknown assessment without replacing the retained measurement.

The boundary workflow retains all matching action snapshots before measuring any
of them. A failed new measurement still consumes that boundary's one-evaluation
allowance; already retained measurements can continue through assessment. Selection
owns trial-managed withholding, validity and context eligibility, and counts distinct
support only for the delivered version and context. Pending-review decisions retain
their evidence-error and semantic-review precedence.

Two unrelated import cycles were removed without changing behavior: the judge's
contracts, prompt and parser moved to `application/judgment.ts`; reflector contracts
and validation feedback formatting moved to `application/reflection.ts`. Trial code
now obtains repository identity from `src/lyo/repository.ts` without loading the
session-hook entry point. Existing public exports remain compatible.

The architecture guard traverses all LYO TypeScript roots and their transitive
local imports, checking both native runtime imports and source imports including
types. Domain dependencies remain within domain; application dependencies remain
within application/domain, with Zod permitted for pure validation. The guard also
protects the retained evidence reader from workflow and evaluator dependencies.
It does not cover computed dynamic imports or prove semantic ownership by itself.

TDD counterexamples cover missing witnesses, corrected-evidence retries, capture
ordering after evaluation failure, scoped support and trial-managed withholding,
and trial-policy decision precedence. Existing integration tests retain real SQLite
and verifier execution. Independent static review found no behavior regression; its
remaining banner-withholding ownership concern was moved into application and
tested red then green.

The focused suite passed 90 tests and the full suite passed 689 with one skipped
(690 total) on Node 24.15.0. After the final withholding move, all 26 affected
selection, architecture, feedback and ordinary-trial tests passed, as did typecheck.
Opcore subsequently identified duplicated model JSON extraction and import-boundary
test setup. Those now have shared helpers, with parser-specific validation and error
messages preserved; all 53 affected tests and typecheck passed after extraction.
The final full suite again passed 689 tests with one skipped (690 total).
After refreshing the graph, Opcore's final changed-code gate passed with exit 0
and no error diagnostics. Its degraded Python/Rust tools and unsupported historical
JavaScript stacks remain outside this coverage claim.
These checks establish refactor compatibility, not beneficial learning or semantic
evaluator accuracy. No receipt migration, policy-threshold change or live-hook
rollout is included.

Remaining architecture work is explicit: advice exposure still spans banners,
review queues and trial/refresh routes; trial reconciliation and the legacy judge,
native control and lesson-credit paths still combine orchestration with concrete
adapters. Removing cycles does not make those whole subsystems clean architecture.
