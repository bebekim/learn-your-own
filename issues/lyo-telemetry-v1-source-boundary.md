# Lyo telemetry source boundary

## Problem

Lyo's learning code currently sits beside native hook adapters, telemetry
compilation, pipeline runners, and execution-specific contracts. That makes it
hard to replace native telemetry with Shepherd telemetry without leaking source
details into lesson judging, reflection, selection, or credit assignment.

The learning kernel needs one replayable input contract. Native Lyo hooks and
Shepherd traces should be interchangeable producers of that contract.

## Proposed Interface

Introduce a versioned, language-neutral artifact: `lyo.telemetry.v1.ndjson`.
Each line is one canonical telemetry event:

```ts
type TelemetryEvent = {
  eventId: string;
  runId: string;
  source: 'native' | 'shepherd' | string;
  kind: 'prompt' | 'model_call' | 'tool' | 'file' | 'command' | 'verify' | 'outcome';
  occurredAt: string;
  payload: unknown;
  evidenceRef?: string;
};
```

The learning pipeline consumes only the canonical artifact:

```text
native hooks ───────→ telemetry.v1 ─┐
                                    ├→ episodes/effects → learning
Shepherd trace ────→ telemetry.v1 ─┘
```

Source-specific adapters own translation and provenance preservation:

```text
src/telemetry/
  contract.ts
  native-source.ts
  shepherd-source.ts
  normalize.ts
  episodes.ts
```

The source is selected at ingestion time, not inside learning logic:

```sh
lyo learn --telemetry native.ndjson
lyo learn --telemetry shepherd-run.ndjson
```

## Dependency Strategy

This is a ports-and-adapters boundary with an in-process core and a file/stream
transport between Python Shepherd and TypeScript Lyo. The canonical NDJSON
artifact is the port. Native and Shepherd adapters are production adapters;
fixture readers are test adapters.

Do not make the Lyo kernel import Shepherd or make both projects write a shared
SQLite schema. SQLite remains an internal persistence choice after ingestion.

## Testing Strategy

New boundary tests should verify:

- native and Shepherd fixtures produce equivalent canonical events for equivalent
  behavior;
- source and evidence references survive translation;
- malformed or unknown event kinds fail clearly or remain forward-compatible;
- the learning pipeline produces identical results from either source artifact;
- replaying the same NDJSON artifact is deterministic.

Existing adapter, normalizer, compiler, and learning tests should migrate behind
the artifact boundary. Keep source-specific tests for translation; move learning
assertions to canonical-fixture tests.

## Implementation Recommendations

- Keep `src/learning` independent of hooks, Shepherd, providers, and filesystem
  capture details.
- Make `lyo.telemetry.v1` the stable contract and version future breaking
  changes explicitly.
- Preserve raw source references without requiring raw payloads to be stored in
  the learning database.
- Keep native telemetry as the default source.
- Add Shepherd ingestion as a reader/converter of Shepherd JSON/JSONL trajectory
  or trace exports.
- Make the adapter boundary the only place that knows whether an event came
  from native Lyo or Shepherd.

## Non-goals

- Rewriting Lyo in Python.
- Replacing Shepherd's execution, permissions, sandbox, or retained-output
  machinery.
- Merging Lyo and Shepherd SQLite schemas.
- Reorganizing all existing modules before the canonical contract is tested.
