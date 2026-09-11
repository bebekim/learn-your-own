# Spec reconciliation

State: done — documentation reconciliation only (2026-09-10)

Historical audit scope: compare the then-latest implemented branch, `dd5f160`, with the PRD and specs.
The audit lives on `feat/spec-reconciliation`. At audit time, `main` was
`5759cc8`; local hooks used `0.4.3-adaptive.3`. These are distinct delivery states.

## Completed

- [x] Replace the stale spec index with an implementation/evidence/gap map.
- [x] Update the existing PRD, development status and learning-loop acceptance.
- [x] Distinguish candidate generation, delivery, observed recovery and validated benefit.
- [x] Incorporate the session-bridge draft with its efficiency-based credit proposal withdrawn.
- [x] Mark implemented measurement/storage components and retain open contract fixes.
- [x] Remove the withdrawn context-collapse proof, unsupported novelty claims,
      obsolete migration prerequisites, duplicate cleanup plan and external-fork execution plan.
- [x] Preserve negative experiments, cost evidence and the longer-term code/Go ambition.

## Authority and terminology

The [PRD](../issues/prd.md) states desired behavior;
[Spec 8](8-learning-evidence-loop.md) states current acceptance.
Code and tests establish implemented behavior; retained experiment receipts establish
only the measured result under their recorded conditions. An implementation gap
must stay visible even when the design has been revised.

A **candidate** is proposed guidance. A **finding** is an evidence-linked observation.
A **delivery** proves guidance was emitted. An **observed recovery** proves a recorded
check changed result. A **validated useful intervention** requires improvement on
comparable later tasks, with acceptance, regressions and learning cost accounted for.
These are not interchangeable counts.

## Gates are scoped to their implementations

| Path | Existing behavior | Evidence limit |
|---|---|---|
| SQLite lesson store | Thompson selection, ratio-lift credit with sparse-data fallback, Wilson status rules | Legacy counters/status are not proof of causal improvement |
| File lesson library | Scoped recurrence/absence counters; quarantine at harmful ≥ 2 and helpful = 0 | Observational credit can still be misleading |
| Association/explanation components | Separate inference and threshold prototypes | No integrated graph-to-intervention proof |
| Native feedback and registered trials | Decision/feedback revisions, frozen task comparisons, conservative report gate | Experimental; no automatic production promotion/rollback |
| Scoped session findings | Explicit scope, evidence references, delivery-only receipts | Future usefulness remains unvalidated |

See [Spec 3](3-lesson-delta-design.md), [Spec 4.2](4.2-credit-evidence-discipline.md)
and [Spec 8](8-learning-evidence-loop.md). There is no single shared promotion
threshold across these stores. Unifying credit semantics is remaining development,
not something this documentation change implements.

## Removed from the active plan

The former 574-line consolidation plan and its duplicate in `done/` required
cleanup before all work, referenced missing files and obsolete source locations,
and mixed research, schema work, JavaScript migration and orchestration directives.
That plan is superseded by this record; its previous text remains in Git history.

The following claims are withdrawn: session efficiency establishes lesson credit;
absence of a failure proves an intervention helped; logged propensities alone
guarantee causal identification; repeated summarization mathematically guarantees
collapse; a specific explanation-graph architecture is required by cybernetics.

Detailed graph/IR designs and literature remain research/deferred design. They are
not prerequisites for the bounded feedback experiment. Execution permissions and
workspace custody remain host/Shepherd responsibilities; see the
[boundary](../docs/lyo-shepherd-boundary.md).

The 2026-09-10 audit preserved the existing user edits and paper files in the main worktree.
No runtime change, model experiment, merge to main or npm publication is included.

Verification: all 165 relative file links in the 25 changed documents resolve;
`git diff --check` passes. Main-worktree staged/unstaged diffs and all 26 existing
untracked file hashes match the pre-work manifest. No runtime suite was rerun for
this documentation-only change; implementation checks above are retained evidence.

## 2026-09-11 documentation reconciliation

The current implementation baseline is main `f39ed6c`, source package
`0.4.3-adaptive.8`. The earlier branch/install inventory and gate table above are
historical. The [current gate map](2026-07-27-principled-map.md) distinguishes
legacy stores from ordinary trial policy, which now supports scoped promotion,
later pause and correction. [Spec 8](8-learning-evidence-loop.md) remains the
acceptance authority; useful coding transfer has not been established.

README and the [documentation index](../docs/README.md) now lead to a source-checkout
demo, application brief, installation guide and evidence. Research and old task
handoffs are separated from current operation. The registry's `latest` tag was
verified as `0.2.0`; publishing the current package is separate rollout work.
The author's local cleanup and efficiency drafts are preserved in `done/` with
explicit supersession notices. The five dated design moves into `Specs/` are
retained. Downloaded local papers are outside this documentation publication.

Verification for this documentation increment: inventory and link checks cover
107 tracked Markdown/Org/reStructuredText documents, including the two new entry
pages and preserved efficiency draft. Current product, CLI, installation and gate
claims were checked against source; historical/research status is labeled rather
than presented as a new validation result. Local file links and README navigation
anchors resolve. This is not a new literature or mathematical-proof review.

A clean source archive installed the locked dependencies with `npm ci` and ran
the README's parser feedback demo successfully: original contradicted, revision
supported, incremental benefit unknown. On Node 24.15.0, `npm test` passed 672
tests with one skipped; `npm run typecheck` passed. Runtime code, package version
and installed hooks are unchanged by this documentation increment.
