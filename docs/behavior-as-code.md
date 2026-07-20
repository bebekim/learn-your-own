# Behavior As Code

This document explains Lyo's core move through an old Lisp idea:
homoiconicity, the property behind the saying "code is data, data is code."

The claim is not that Lyo is homoiconic in the parser sense. The claim is
that Lyo recreates the same loop one level up, at the level of agent
behavior:

```text
Lisp:  code -> (read) -> data -> (macro transform) -> code -> eval

Lyo:   behavior -> (hooks/normalize) -> data -> (inference: associations,
       explanation graph, belief update) -> protocol artifact -> delivery
       -> changed future behavior -> (outcome) evidence -> data again
```

## The Lisp Idea, Briefly

In most languages, source code is text. To manipulate a program
programmatically you need a separate parser, an AST library, and a code
generator. Code and data live in two different worlds.

In Lisp, the reader parses source text into ordinary lists before anything
runs:

```lisp
(+ 1 2)          ; code: call + with 1 and 2
(quote (+ 1 2))  ; data: a list of three elements
```

Because a program's body is just a list, ordinary list operations can
inspect and rewrite it. Macros are functions from code to code that run at
compile time, written in the same language, using the same data tools.
`macroexpand` previews a transformation without running it; `eval` runs a
constructed list as code. The wall between "the program" and "the stuff the
program works on" disappears.

## The Lyo Mapping, End To End

Running example: an agent edits a file, then stops without running the
tests.

### 1. Behavior becomes data (quote)

A Claude or Codex hook fires and the raw event lands in the spool as plain
JSON, a `HookSpoolPacket` (`src/hooks/events.ts`):

```json
{
  "version": 1,
  "kind": "hook-event",
  "runtime": "claude",
  "recordedAt": "2026-07-20T09:14:03Z",
  "hookEvent": { "tool.after": "Bash npm test ..." },
  "session": { "...": "..." },
  "promptBoundary": { "...": "..." }
}
```

The behavior happened, but instead of vanishing it is frozen as an inert
data structure. `.agent-learning/hook-spool/incoming/*.json` is Lyo's quote
operator.

### 2. The reader: events become structure (read)

`lyo normalize hooks` drains the spool into the ledger, then the compiler
frontend (`src/compiler/frontend.ts`) parses it the way Lisp's reader
parses text into lists.

Raw event -> `TelemetryToken` (`src/compiler/syntax.ts`), a symbol in a
small vocabulary:

```ts
{ kind: 'EDIT',   // PROMPT | INSPECT | EDIT | TEST | BUILD | GIT | EXTERNAL | STOP
  provenance: { eventId, sessionId, runId, cwd, ordinal, ... },
  paths: ['src/compiler/parser.ts'] }
```

Token -> `NormalizedAction`, the AST node:

```ts
{
  eventKind: 'tool_use',
  operation: 'mutate_local',
  intent: 'implement',
  resources: { read: [], written: [{ type: 'local_file', ref: 'src/compiler/parser.ts' }] },
  risk: 'low',
  status: 'succeeded',
  facets: ['write', 'local'],
  confidence: 'high'
}
```

Actions -> `RunEpisode`, behavior grouped into meaningful phases:

```ts
{ phase: 'implementation', ... }
{ phase: 'unverified_claim_candidate', ... }  // edited, then stopped, no TEST token
```

A messy, runtime-specific hook blob is now a normalized, inspectable
structure. "The agent edited parser.ts and stopped" is something plain code
can query, count, and transform.

### 3. Data is examined; a lesson is written (macro construction)

`lyo learn style` runs semantic predicates over episode data, plain
functions over plain data such as `hasStoppedAfterEditWithoutVerification`
(`src/compiler/semantics.ts`). When a pattern repeats across runs, the
learner emits a `StyleLearningCandidate` (`src/compiler/style-learning.ts`):

```ts
{
  kind: 'verifier',
  title: 'Run targeted tests before ending a run after edits',
  rationale: 'Runs that stopped after edits without verification...',
  confidence: 'medium',
  support: 7,
  evidenceRunIds: ['turn-11', 'turn-19', '...']
}
```

The lesson is data built out of other data, the same way a macro body is a
list assembled from other lists.

### 4. Data becomes behavior (eval)

The candidate is promoted into the `protocols` table (`src/schema.ts`):

```sql
protocols:  status: 'candidate' -> 'active'
            scope_kind: 'repository'
            scope_value: 'agent-learning-workflow'
            action: 'Run targeted tests before claiming completion'
```

When a future run starts, the active protocol is delivered into the agent's
context and Lyo writes a `deliveries` row. This is `eval`: a stored data
structure now runs, changing what the agent does.

### 5. Results flow back as data (the loop closes)

Later, Lyo records an `outcomes` row for that delivery:

```sql
outcomes: followed: 1, defect_repeated: 0, verified: 1, credit_delta: +1
```

Did the agent run tests this time? Did the defect repeat? That evidence is
data again, and it updates belief in the protocol: keep it, demote it, or
re-scope it. Improved behavior is re-quoted, re-read, and feeds the next
round of learning.

## The Two Flips, Side By Side

| Lisp | Lyo |
| --- | --- |
| `(quote (+ 1 2))` freezes code as data | hook spool freezes behavior as JSON |
| reader: text -> list | frontend: hook event -> token -> `NormalizedAction` |
| macro: build new code from data | style learner builds `StyleLearningCandidate` from run data |
| `macroexpand`: preview, do not run | `--dry-run` on `lyo learn style` / `lyo learn explanation` |
| `eval`: data runs as code | `protocols` row delivered into a future run's context |
| (Lisp stops here) | `outcomes` rows close the loop: did the change help? |

## Where The Analogy Breaks, On Purpose

Lisp's `eval` never asks whether the macro was a good idea. Lyo does.
Delivery and outcome records turn "data became code" into "data became
code, and we measured whether that helped."

That difference is the whole point. Homoiconicity lets a language treat
programs as material for programs. Lyo's bet is that the same move, applied
to the agent's own operation, is what turns remembering into learning:

```text
association is hypothesis generation
learning is inference over explanations plus intervention and feedback
```

The "your own" in Learn Your Own is the self-reference: the system the data
describes is the same system the data reprograms.

## See Also

- [Agent IR Spec](../spec/02-agent-ir-language.org)
- [Learning As Inference Over An Explanation Graph](learning-as-explanation-graph.md)
- [Style Learning](style-learning.md)
- [Cybernetic Association Learner](cybernetic-association-learner.md)
