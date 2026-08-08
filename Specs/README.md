# Specs

Night-shift work items for this repository. Selection rule: non-draft **and**
`State: ready`. States: `draft | needs-clarification | blocked | ready | done`.

Layout: flat — night-shift work items and long-lived design specs live side
by side at the top level; completed/archived items move to `done/`. The
former top-level `spec/` directory was merged here on 2026-08-04.

Numbering is Tractatus-style decimal: **00 is the meta/consolidation layer**
(first priority — it governs the cleanup of all other specs); `0` is reserved
and must stay empty. Integers 1–N are content layers (1 problem & doctrine, 2
explanation graph, 3 lesson-delta, 4 night-shift queue); decimals elaborate
within a layer (e.g. 3.1 revises §5.3 of 3; 3.2 is the executed
implementation plan of 3).

**TypeScript directive.** All new and revised spec prose, schemas, and code
examples in this directory are written in TypeScript. Legacy JavaScript
artifacts in `done/` are retained for trace but are not authoritative.

Current files (top-level, active):

| File | Layer | Status |
|------|-------|--------|
| `00-spec-consolidation.md` | 00 meta | authoritative consolidation |

| File | Layer | Status |
|------|-------|--------|
| `1-problem-library.org` | 1 | **stale** — empty stub, see 00 §00.4.1 |
| `1.1-learning-layer-literature.md` | 1.1 | ready |
| `2-learning-as-explanation-graph.org` | 2 | ready |
| `2.1-agent-ir-language.org` | 2.1 | sketch |
| `3-lesson-delta-design.md` | 3 | ready |
| `3.1-counterfactual-credit-synthesis.md` | 3.1 | ready |
| `4.1-checkblindness-and-contract-small-fixes.md` | 4.1 | ready |
| `4.2-credit-evidence-discipline.md` | 4.2 | ready |
| `4.3-at-bat-risk-inputs-cost-and-quarantine.md` | 4.3 | ready |
| `4.4-lesson-injection-cadence.md` | 4.4 | draft |

Archive: `done/` — superseded or executed items.参见 00 §00.4 for staleness policy.
