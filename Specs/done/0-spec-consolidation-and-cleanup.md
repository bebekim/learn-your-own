# Spec consolidation and cleanup

Priority: first — lands before every other spec in this queue
State: ready

## Problem

A full inventory of the repo's 39 specification/design documents (2026-08-04)
found a healthy aligned core but six real contradictions, four naming
collisions, and several stale or orphaned documents. Left alone, the spec
layer will keep diverging from the code and from itself.

The aligned core (do not touch): `NormalizedAction` / effect monoid / temporal
predicates vocabulary (`docs/telemetry-effect-semantics-for-lyo.md` root);
"association is hypothesis generation; learning is inference + intervention +
feedback"; append-only evidence with derived beliefs; deterministic verifier
never LLM; aggregate-only writer feedback; counters grounded in external
validation, never model self-assessment.

### Contradictions to resolve

1. **Promotion/trust gate — four incompatible criteria.** Shipped
   `src/lyo/lesson-store.ts` + `Specs/3-lesson-delta-design.md`: Wilson
   interval, n ≥ 8. `docs/superpowers/specs/2026-07-27-principled-map.md`:
   sequential likelihood ratio `E > 1/α`, and it explicitly claims to *replace*
   the Wilson floor. `docs/cybernetic-association-learner.md`: threshold
   counts (support≥3, score≥2). `docs/future/agent-learning-control-plane-prd.md`:
   ≥2 compatible preference pairs. No document says which gate is authoritative
   for which store.
2. **Two lesson stores, two quarantine rules.** Kernel SQLite store:
   Wilson-upper < 0.45 @ n≥8. File-based library: `harmful ≥ 2 ∧ helpful == 0`
   (`isDemoted`, aligned by Specs/4.3). Both are documented as intended; they
   disagree numerically on the same concept.
3. **`sampled_score` schema gap.** `Specs/3-lesson-delta-design.md` DDL stores
   the Thompson *draw*; `Specs/3.1-counterfactual-credit-synthesis.md` §3.4
   convicts this — ratio-lift is unidentified without the selection
   *probability* (plus null arm, posterior snapshot id, randomness record).
   Acknowledged as prerequisite; DDL never updated. Backward-incompatible
   later; cheap now.
4. **Two unconnected learning substrates.** `Specs/2-learning-as-explanation-graph.org`
   speaks evidence/hypothesis/belief/factor; the lesson-delta line speaks
   lesson/counters/lift. `Specs/2.1-agent-ir-language.org` claims plan-vs-trace
   diffs feed the explanation graph, but no document maps `lesson_delta` rows
   to `evidence_events`. Either write the mapping or explicitly declare the
   two as separate tracks.
5. **Scalar rewards vs preference-first doctrine.** `docs/behavior-as-code.md`'s
   `credit_delta` and `docs/future/workspace-activation-spec.md`'s
   `weight = support + pos − neg` are exactly the "fake reward number"
   `docs/future/preference-derived-budget-pressure-spec.md` forbids.
   Workspace-activation acknowledges the tension but specifies the formula
   anyway.
6. **Hardcoded injection caps vs no-magic-numbers doctrine.**
   `docs/superpowers/specs/2026-08-04-lyo-workflow-mechanics.md` caps delivery
   at "3 per role"; `Specs/3-lesson-delta-design.md` §11.5 sets a "gas limit"
   of ≤3 pre-armed + top-2 reactive; the live embodiment is
   `DEFAULT_LESSON_LIMIT = 3` (`src/lyo/lesson-library.ts:42`) with top-k
   slices in both selection paths. `principled-map.md` forbids constants
   that are neither error rates, data-derived rates, nor labeled scope
   decisions. `Specs/4.4` replaces the caps with a measured stopping rule
   (expected prevented loss > context cost); the older documents need the
   same pointer.

### Naming/metaphor collisions to disambiguate

- `tape`: reducer state machine (`docs/turing-tape-model-for-lyo.md`) vs
  telemetry compiler metaphor (`docs/trace-effect-tape-spec.md`).
- `packet`: cross-zone circulation signal (`docs/future/learning-circulation-spec.md`)
  vs corpus-slice export (`docs/local-corpus-effect-algebra-spec.md`).
- `episode`: compiler work unit vs eval baseline run record.
- `protocol` / `lesson` / `learned_rule` / `artifact`: four names, four
  slightly different lifecycle state machines, overlapping concepts.

### Stale or orphaned documents

- Folder consolidation (done 2026-08-04): the two spec roots were merged and
  flattened — `spec/` moved into `Specs/`; `Specs/` is now the single flat
  spec root, with night-shift queue items and long-lived design specs side by
  side, and archived plans in `Specs/done/`.
- `issues/prd.md` is written against 0.2.1; its status section contradicts
  shipped 0.3.0+ reality (lesson store, eval fixtures, gates).
- README.md documents blind pipeline, learning loop, corpus sync, `lyo eval`
  with no CHANGELOG entries past 0.3.0; README:406 links the moved
  `issues/candidate-at-bat-prd.md` (now under `issues/done/`).
- `Specs/1-problem-library.org` is an empty stub (one `*` line).
- 0.2.x's "dry-run only" posture is dead (commit `c92958e`) but never
  formally retracted.
- `Specs/done/3.2-lesson-delta-implementation-plan.md` targets the external
  JS `zeroshot-lyo` repo, yet Specs/4.1 treats its requirements as binding on
  this repo's TypeScript port — the re-homing is undocumented.

### Language directive: consolidate toward TypeScript

Going forward, TypeScript is the single implementation language for this
repository. JavaScript artifacts are legacy and should be migrated, not
extended:

- New source, tests, and tooling are written in TypeScript (`.ts`), matching
  `src/` (ESM TypeScript on `node:sqlite`, zero native deps).
- Existing `.js` test files under `tests/` and `.cjs` tooling under `dogfood/`
  are migrated opportunistically: when a file is touched for another reason,
  convert it; no big-bang rewrite.
- The external `zeroshot-lyo` (JS/better-sqlite3) lineage is superseded by
  the in-repo TS port; do not treat the JS draft as the reference
  implementation.

## Desired Behavior

1. **Gate decision recorded.** A short decision doc (or section added to
   `docs/superpowers/specs/2026-07-27-principled-map.md`) names the
   authoritative promotion/quarantine rule per store, and every losing
   variant is marked superseded in its document with a pointer to the winner.
2. **Propensity schema patched.** `lesson_application` (or a decision-log
   table) gains the selection probability / propensity fields per the credit
   synthesis §3.4, with a migration; the design doc DDL is updated to match.
3. **Substrate mapping written.** One page (in `Specs/` or
   `docs/learning-as-explanation-graph.md`) either maps lesson-delta
   vocabulary onto explanation-graph vocabulary or declares them separate
   tracks with stated boundaries.
4. **Vocabulary disambiguation.** Each collision above gets one sentence at
   its definition site renaming or cross-referencing, so a reader hitting
   `tape`/`packet`/`episode`/`protocol` knows which sense is meant.
5. **Staleness sweep.** `issues/prd.md` status section refreshed or the file
   moved to `issues/done/` with a successor pointer; README link fixed;
   CHANGELOG catches up to documented features; `Specs/1-problem-library.org`
   filled or deleted; the dry-run-only retraction and the JS→TS re-homing of
   the implementation plan recorded where a reader would look for them.
6. **TypeScript directive recorded.** The language directive above is added
   to the contributor-facing docs (README or AGENTS.md) so future work items
   inherit it.

## Non-Goals

- No changes to learning algorithms, gate math, or shipped behavior — this
  item cleans the *documentation* layer, plus the one schema migration for
  propensities (item 2) which is additive logging, not a behavior change.
- No merging or rewriting of the aligned core doctrine documents.
- No wholesale JS→TS rewrite; migration is opportunistic per the directive.

## Likely Files

- `Specs/3-lesson-delta-design.md` (DDL + gate pointer)
- `docs/superpowers/specs/2026-07-27-principled-map.md` (gate decision)
- `docs/learning-as-explanation-graph.md` (substrate mapping)
- `docs/behavior-as-code.md`, `docs/future/workspace-activation-spec.md`
  (scalar-credit tension notes)
- `docs/turing-tape-model-for-lyo.md`, `docs/trace-effect-tape-spec.md`,
  `docs/future/learning-circulation-spec.md`,
  `docs/local-corpus-effect-algebra-spec.md` (naming disambiguation)
- `issues/prd.md`, `README.md`, `CHANGELOG.md`, `Specs/1-problem-library.org`
  (staleness sweep)
- `src/lyo/lesson-store.ts` + migrations (propensity fields)
- `AGENTS.md` or README (TypeScript directive)

## Environment

None beyond the repo's existing `npm test` / `npm run typecheck`.

## Dependencies

None — this is the first item in the queue and precedes Specs/4.1–4.3. Where a
later spec touches a document this item rewrites or marks superseded (e.g.
Specs/4.3 and the file-library quarantine rule), this item's decisions are the
authority those specs rebase onto.

## Edge Cases

- Marking a document superseded must leave it readable in place with a
  pointer, not delete it — the repo's convention is `done/` placement or an
  in-document status header.
- Legacy counters from the pre-propensity schema stay valid as Beta evidence;
  the migration adds columns, it does not recompute history.
- The gate decision may legitimately conclude "different gates for different
  stores" — that is an acceptable outcome *if written down with rationale*;
  an undocumented divergence is not.

## Test Expectations

- Schema migration applies cleanly over an existing 0.3.0-era lesson store
  (test with a fixture DB or the existing migration test pattern).
- Propensity fields populated on new `lesson_application` rows.
- Full suite green: `npm test`; `npm run typecheck`.

## Acceptance Criteria

- [ ] Gate decision documented; losing variants marked superseded in place
- [ ] Propensity/decision-log schema migrated; design doc DDL updated
- [ ] Substrate mapping or separate-tracks declaration written
- [ ] Four naming collisions disambiguated at their definition sites
- [ ] Staleness sweep done (prd.md, README, CHANGELOG, 1-problem-library, retractions)
- [ ] TypeScript directive added to contributor-facing docs
- [ ] Full suite passes, typecheck clean

## Known Risks

- Touching 10+ documents invites scope creep into doctrine rewriting — the
  non-goals exist to prevent that; edits should be pointers and status
  headers, not re-litigation.
- The propensity migration is the only code change; if it grows (e.g.
  backfilling propensities for old rows), split it into its own spec.
