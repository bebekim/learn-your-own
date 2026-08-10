# Lyo–Shepherd Boundary

Lyo and Shepherd share execution vocabulary but own different layers.

- **A — Lyo:** learning from agent work.
- **B — Shepherd:** controlled agent execution.
- **Joint:** shared concepts, not interchangeable implementations.

## A | Joint | B

| A — Lyo | Joint concept | B — Shepherd |
| --- | --- | --- |
| Learning ledger | Run/session record | Run ledger and execution record |
| Hook adapters | Agent telemetry | Runtime/provider/task hooks |
| Normalized actions | Trace/effect data | Immutable effect stream |
| Path activations | File-change evidence | Retained changeset |
| Command classification | Command execution evidence | Command envelopes and capture |
| Verifier results | Quality gates | Task gates and settlement checks |
| Outcomes and credit | Run result | Run/output settlement state |
| Workspace and zones | Scoped work context | Workspace, scope, repository bindings |
| Experiment episodes | Branches/variants | Forked scopes and parallel runs |
| Reports | Inspection/export | Trace, run, changeset, trajectory views |
| Lesson delivery | Task guidance | Guidance and prompt context |

## A only

- Lesson store and lifecycle: candidate, active, demoted.
- Preference pairs, reflection, association hypotheses, and credit assignment.
- Lesson selection, trust calibration, and harmful-lesson demotion.
- Corpus mining, offline replay, and learning-oriented experiments.

## B only

- Provider execution and runtime orchestration.
- Typed read/write grants and native sandbox enforcement.
- Retained-output custody, changesets, apply/release/discard settlement.
- Git-native workspace provenance and reversible execution state.

## Data flow

```text
B executes safely
  → trace, verifier result, and settlement outcome
  → A learns and selects guidance
  → guidance enters the next B task
```

## Integration boundary

Shepherd remains authoritative for execution facts: permissions, tool/file
effects, changesets, and settlement. Lyo consumes those facts through an
adapter and remains authoritative for learning facts: lessons, selection,
credit, trust, and future guidance.

The first integration should be a trace adapter, not a second execution
runtime. Its minimum input is:

- run and task lifecycle;
- prompts and provider calls;
- tool, command, and file effects;
- verifier results;
- selected, applied, released, or discarded outcomes.

Lyo can remain a TypeScript learning kernel. Shepherd-specific ingestion may
live in a small Python adapter until a real boundary requires a separate
package.
