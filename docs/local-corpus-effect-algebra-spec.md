# Local Corpus Sync Effect Algebra Spec

## Purpose

This spec defines the next package-side work for Lyo after the first local
corpus sync slice. The goal is to understand the work mathematically before
adding more commands or cloud-facing packet support.

The core claim:

```text
Learning propagation is not just copying rows.
It is lifting local effect traces into a shared, tagged effect space.
```

Lyo already has a trace/effect algebra for a single run. Local corpus sync
should preserve that algebra across many repo-local ledgers so future learning
can be queried, compared, and rebroadcast without losing provenance.

## Current Package Status

Implemented package slices:

```text
lyo sync once
  discovers repo-local ledgers
  imports source runs and hook events
  materializes corpus_actions from normalized telemetry
  materializes corpus_effects from foldTrace

lyo corpus report
  reports per-ledger and total run/event/action/effect counts
```

Still pending:

```text
incremental cursor filtering
packet export/verify/import
local resolver
daemon wrapper
artifact promotion and delivery feedback
```

## Current Foundation

The current compiler semantics define:

```text
Action
  normalized telemetry action with operation, resources, risk, status,
  provenance, command metadata, and facets

EffectSummary
  reads: ResourceRef[]
  writes: ResourceRef[]
  executedCommands: string[]
  evidenceRefs: string[]
```

with operations:

```text
emptyEffect()
  identity element

concatEffects(left, right)
  combines effects by resource union, command union, and evidence append

actionToEffect(action)
  maps one normalized action into its effect summary

foldTrace(trace)
  folds a run trace into one effect summary
```

This gives Lyo a monoid:

```text
(EffectSummary, concatEffects, emptyEffect)
```

where:

```text
concatEffects(emptyEffect, e) = e
concatEffects(e, emptyEffect) = e
concatEffects(a, concatEffects(b, c)) = concatEffects(concatEffects(a, b), c)
```

The algebra intentionally keeps compatibility labels such as `inspect`, `edit`,
and `test` as derived predicates over effects, not as the foundation.

## Problem

Repo-local learning is currently siloed:

```text
repo-a/.agent-learning/learning.sqlite
repo-b/.agent-learning/learning.sqlite
repo-c/.agent-learning/learning.sqlite
```

Each ledger can explain what happened in one workspace, but Lyo cannot yet
answer:

```text
Which verifier patterns generalize across repositories?
Which failure classes repeat across teams or task families?
Which local lessons should be broadcast into future runs?
Which artifacts helped after they were delivered?
Which telemetry is duplicated, stale, or out of scope?
```

The first local sync implementation creates a central corpus and imports
`runs` and `hook_events`. The next work should turn that corpus into a tagged
effect space.

## Mathematical Model

Let:

```text
L_i
  one repo-local ledger

T_i
  ordered trace of normalized actions compiled from L_i

E_i = foldTrace(T_i)
  effect summary for one run or episode

P_i
  provenance tag for L_i:
  source ledger, repo root, branch, agent runtime, task family, run id,
  event/action ids, import batch
```

Local corpus sync should produce:

```text
TaggedEffect = P_i x E_i
```

The corpus is not a flat bag of events. It is a set of tagged effects:

```text
Corpus = { (P_i, E_i) }
```

The sync function is:

```text
sync: LedgerDelta -> CorpusDelta
```

It must be:

```text
idempotent
  syncing the same ledger delta twice does not duplicate corpus facts

monotone
  adding new source facts only adds or updates derived corpus facts; it does
  not silently remove prior facts

provenance-preserving
  every imported or derived fact can be traced back to source ledger rows

scope-preserving
  local resources are tagged with repo/workspace context before cross-repo
  comparison
```

In operational terms:

```text
sync(C, delta) = C union tag(normalize(delta))
```

where `union` is keyed by stable source identity:

```text
(source_ledger_id, source_table, source_row_id)
```

or, for compiled actions:

```text
(source_ledger_id, run_id, action_id/evidence_ref)
```

## Why Tags Matter

The same apparent resource can mean different things in different repos:

```text
local_file:src/index.ts
```

Without provenance, cross-repo union would collapse unrelated resources. Corpus
resources need a scope prefix:

```text
repo:<repo-id>:local_file:src/index.ts
```

or equivalent structured columns:

```text
source_ledger_id
repo_root
resource_type
resource_ref
```

This lets Lyo distinguish:

```text
same resource inside one repo
similar resource shape across repos
same verifier family across repos
same failure pattern across repos
```

Those are different mathematical relations and should not be collapsed.

## Derived Relations

Once traces are lifted into the corpus, Lyo can derive cross-ledger relations.

### Independence

For actions within a single run, existing `areIndependent` and `areConflicting`
still apply.

Across ledgers, two actions are independent by default unless they touch an
external resource or a shared configured resource:

```text
repo-a local writes independent of repo-b local reads
external deploys not automatically independent
shared cloud resources require explicit resource identity
```

### Repeated Pattern

Two tagged effects may be similar without being the same:

```text
same verifier command family
same language/framework
same failure class
same edit-verify-debug-pass shape
same stopped-after-edit-without-verification predicate
```

This is a relation over derived features:

```text
similar(e1, e2 | scope)
```

not equality over raw commands or file paths.

### Promotion Candidate

A candidate lesson, critic, verifier, procedure, context pack, or policy is a
hypothesis over tagged effects:

```text
H: artifact helps future runs in scope S
```

The corpus should store candidates with:

```text
supporting effects
scope
confidence
rivals
defeaters
freshness
delivery history
outcome history
```

This connects the effect algebra to the existing explanation-graph direction:

```text
association proposes H
effect evidence supports or weakens H
explanation graph evaluates H against rivals and defeaters
delivery tests H as an intervention
```

## Sync Pool Semantics

Use `sync pool` or `sync inbox`.

The sync pool is a durable staging area for discovered ledger deltas before
they are merged, tagged, indexed, and compiled.

It exists to handle:

```text
discovery
cursoring
batch status
retry
idempotence
tagging
normalization
indexing
```

It does not primarily exist to distrust local data. The security posture can
be added for cloud and enterprise ingestion, but the package-side purpose is
learning propagation.

## Package Work Remaining

### 1. Incremental Sync

Current sync is idempotent but still scans all source rows.

Next behavior:

```text
first sync
  imports all source rows

second sync
  imports zero rows

third sync after new local events
  imports only new rows
```

Use `sync_cursors` to query after the last observed row key or event time.

### 2. Corpus Actions

Implemented baseline compiled action import:

```text
source hook_events
  -> compile normalized actions
  -> corpus_actions
```

Each corpus action should include:

```text
source_ledger_id
run_id/session_id/turn_id
action_id or evidence_ref
operation
intent
risk
status
resources_read_json
resources_written_json
command_json
facets_json
provenance_json
created_at
import_batch_id
```

This is the first point where the effect algebra becomes queryable across
repos.

### 3. Corpus Effects

Implemented baseline materialized effect summaries for runs:

```text
corpus_effects
  source_ledger_id
  scope_kind: run | episode | session
  scope_id
  reads_json
  writes_json
  executed_commands_json
  evidence_refs_json
  predicates_json
```

Predicates should include existing temporal/effect checks:

```text
hasVerifiedCompletion
hasDebugging
hasApprovalFriction
hasUnsafeWrite
hasStoppedAfterEditWithoutVerification
```

### 4. Packet Contract

Packets belong in `lyo`, not `lyo-cloud`.

The package should define:

```text
lyo packet export
lyo packet verify
lyo packet import
```

Packet contents:

```text
schema version
source metadata
ledger/corpus slice
compiled actions
effect summaries
redaction metadata
checksum/signing hooks where needed
```

`lyo-cloud` should consume these packets rather than defining a second
telemetry format.

### 5. Local Resolver

Add:

```text
lyo resolve context --db ~/.lyo/corpus.sqlite --cwd <repo>
```

Mathematically, resolution is a scoped query:

```text
resolve(context) = top_k artifacts where scope_matches(context, artifact.scope)
```

with ranking from:

```text
belief
freshness
scope specificity
evidence strength
delivery outcome history
token budget
```

### 6. Daemon Mode

Add:

```text
lyo sync daemon --dir ~/repositories --corpus ~/.lyo/corpus.sqlite
```

The daemon is only an application worker around the same sync function:

```text
loop:
  discover ledgers
  import deltas
  update cursors
  record batch status
  sleep interval
```

The daemon must not become a second sync implementation.

## Acceptance Criteria

The next development phase should preserve these invariants:

```text
Idempotence
  re-running sync does not duplicate corpus facts

Provenance
  every corpus row points back to source ledger identity and row identity

Scope safety
  repo-local resources are not collapsed across repos

Algebra compatibility
  corpus effects are produced from the same actionToEffect/foldTrace semantics
  used for single-run reports

Packet ownership
  packet creation and verification live in the `lyo` package

Cloud dependency direction
  `lyo-cloud` depends on Lyo's packet/effect contracts, never the reverse
```

## Implementation Order

Build in this order from the current baseline:

```text
1. incremental cursor tests and implementation
2. packet export/verify/import for corpus slices
3. local resolver over corpus effects/artifacts
4. daemon wrapper around sync once
```

This keeps the package mathematically grounded: first preserve local traces,
then lift them into tagged effects, then export them, then resolve guidance
back into future work.
