# Cybernetic Association Learner

## Purpose

Lyo should not stop at measuring sessions. The learning layer should change
future behavior by turning repeated trace evidence into reusable control
artifacts.

The core learning rule is:

```text
local co-firing + outcome credit + repeated evidence = global learned behavior
```

This document defines the first implementation target for that learning loop.
It sits above the deterministic trace/effect compiler and below future hosted or
interview-product workflows.

The learner should be developed through an explicit experiment protocol rather
than treated as a finished algorithm:

- [Cybernetic Learning Experiment Protocol](cybernetic-learning-experiment-protocol.md)

## Design Shape

The learner is a state-space cybernetic system:

```text
x_t = Lyo memory state
      association graph, procedures, critics, verifier candidates,
      context packs, policies

u_t = delivered control artifacts
      context pack, procedure, critic, policy, verifier suggestion

y_t = observed telemetry/outcome
      effect trace, verifier result, stopped-without-verifier, unsafe write

x_{t+1} = update(x_t, u_t, y_t)
```

The first update mechanism should be append-only association credit, not mutable
model weights.

## Mathematical Core

The useful cybernetic structures for Lyo are:

1. **State-space framing**
   Memory state plus delivered artifacts produces an observed trace.

2. **Association credit**
   Local co-firing plus outcome produces `+1`, `0`, or `-1` evidence.

3. **Bayesian weight of evidence**
   Later versions can replace raw credit totals with likelihood-style scoring.

4. **Replicator dynamics**
   Artifacts that improve outcomes are delivered more often; artifacts that
   hurt outcomes shrink or are demoted.

5. **Viability bounds**
   Safety and friction constraints prevent runaway optimization.

The first version should not start with PID control, Kalman filtering,
Lotka-Volterra dynamics, or a black-box online classifier. Those are useful
analogies, but too heavy for the first learning substrate.

## Polya-Style Plausible Reasoning

The learner should treat early learning as plausible reasoning, not proof.

The discovery loop is:

```text
analogy
-> conjecture
-> predicted consequence
-> future test
-> counterexample search
-> strengthened, weakened, specialized, or generalized artifact
```

In Lyo terms:

```text
co-fired trace items
-> association conjecture
-> expected future benefit
-> artifact delivery into a later run
-> verifier/outcome evidence
-> +1 / 0 / -1 credit
-> promote, retain, specialize, generalize, or demote
```

A single successful run should not become permanent knowledge. It should create
a conjecture such as:

```text
H:
  tests/compiler-frontend.test.js is a useful verifier when compiler workflow
  style code changes.
```

The conjecture has predicted consequences:

```text
If H is useful, delivering that verifier in a future similar run should increase
fresh passing evidence, reduce unverified stops, or catch regressions earlier.
```

This makes learning testable. Lyo does not need to prove the conjecture at
birth. It needs to preserve the evidence trail and test the conjecture through
future feedback.

## Effect Algebra Role

The effect algebra is the sensor layer:

```text
Effect = {
  reads,
  writes,
  executedCommands,
  orderedEvidence
}
```

It lets Lyo identify what fired together:

```text
file read + file edited
file edited + verifier command
critic fired + verifier pass
context pack delivered + reduced wandering
policy applied + no unsafe write
procedure delivered + verified completion
```

Those co-fired items become association candidates.

## Local Update Rule

For each completed run:

```text
1. Compile telemetry into a NormalizedAction trace.
2. Fold the trace into an effect summary.
3. Extract association candidates from co-fired resources, commands,
   predicates, and delivered artifacts.
4. Determine outcome credit from verifier evidence and temporal predicates.
5. Append association_credit_events.
6. Recompute derived edge strength from append-only evidence.
```

The local rule is deliberately small. Its repeated application should produce a
global memory graph of what helps this user, agent, workspace, and task family
ship.

## Local-To-Global Scoring

The scoring problem is to turn small local facts into useful global behavior.
The pattern should mirror algorithms such as PageRank, Dijkstra, and constraint
propagation:

```text
local update + invariant + repeated application = global structure
```

For Lyo:

```text
local update:
  append credit for an association observed in one run

invariant:
  no artifact is promoted without positive append-only outcome evidence

repeated application:
  every completed run updates association evidence

global structure:
  a memory graph of procedures, critics, verifiers, context packs, and policies
  that improves future runs
```

The core local unit is an association edge:

```text
source --relation--> target within scope
```

Examples:

```text
src/compiler/workflow-style.ts --verified_by--> tests/compiler-frontend.test.js
local_edit --requires_after--> fresh_verifier
databricks workspace import --risk_class--> external_write
manual_orchestrated run --candidate_process--> explicit loop prompt
```

Each completed run emits credit events for edges it touched. The edge score is
not manually assigned once; it is the accumulated result of repeated local
updates.

## Credit Semantics

Credit is ternary:

```text
+1 = association helped
0  = association appeared but there is no clear outcome evidence
-1 = association was relevant but harmful, wasteful, or superseded
```

Examples:

```text
edit src/compiler/tokenizer.ts
run tests/compiler-frontend.test.js
test passes
=> +1 edge: src/compiler/tokenizer.ts -> tests/compiler-frontend.test.js
```

```text
local edit
stop without a later verifier
=> -1 edge: local_edit -> stop_without_verifier
```

```text
read README.md during unrelated compiler work
no later use or outcome signal
=> 0 edge: README.md -> compiler_task
```

Negative credit should require evidence. Ambiguous absence of evidence should
stay `0`, not `-1`.

## Credit Assignment Rules

Credit assignment starts with deterministic trace predicates. The first version
should avoid subjective LLM judgment.

### Positive Credit

Emit `+1` when an association was relevant and the expected consequence was
observed.

Initial positive rules:

```text
resource -> verifier command
  +1 when the resource was edited and the verifier passed after the final edit

procedure chain
  +1 when the chain includes edit -> verifier and ends in verified completion

critic -> corrective action
  +1 when the critic fires, a missing verifier or safety issue is corrected,
     and the later verifier or policy outcome is good

context pack -> run
  +1 when delivered context is read or touched and the run reaches verified
     completion with less wandering than the prior baseline

policy -> action class
  +1 when the policy reduces approval friction for local safe actions without
     increasing unsafe writes
```

### Neutral Credit

Emit `0` when the association appeared but the trace cannot show whether it
helped.

Initial neutral rules:

```text
resource read with no later edit/verifier relation
delivered artifact unused by the run
successful run where the edge was too distant from the verifier evidence
no outcome evidence available
```

Neutral credit preserves support without pretending the evidence helped.

### Negative Credit

Emit `-1` only when there is evidence that the association was relevant and
harmful, wasteful, or superseded.

Initial negative rules:

```text
local_edit -> stop_without_verifier
  -1 when a run edits local files and stops without a later verifier

resource -> verifier command
  -1 when the verifier is delivered or selected for that resource, runs after
     the edit, and fails without later recovery

context pack -> run
  -1 when delivered context causes broad irrelevant reading and no verifier
     progress, compared to a prior or later tighter context

policy -> action class
  -1 when the policy allows a destructive/external action without required
     approval or blocks safe local verification repeatedly

procedure chain
  -1 when the chain repeats but ends in unverified claim, regression, or
     avoidable churn
```

Negative credit is a counterexample signal. It should trigger specialization or
demotion before deletion.

## Edge Strength

Derived edge strength should be computed from append-only credit events.

Minimum v1 statistics:

```text
support = positive + neutral + negative
score = positive - negative
netRate = score / support
positiveRate = positive / support
negativeRate = negative / support
confidence = abs(score) / support
```

Use thresholds conservatively:

```text
candidate:
  support >= 1

promotable:
  support >= 3
  score >= 2
  positiveRate >= 0.6
  negativeRate <= 0.2

needs specialization:
  support >= 3
  positiveRate >= 0.4
  negativeRate >= 0.3

demotable:
  support >= 3
  score <= -2
  negativeRate >= 0.5
```

These thresholds are bootstrap defaults, not universal truths. They should be
stored with the learner version and made visible in reports.

Later versions can replace raw credit totals with Bayesian weight of evidence:

```text
posterior odds = prior odds * likelihood ratio
```

The append-only credit events remain valid evidence even if the scoring
projection changes.

## From Association To Process

Efficiency learning is process learning. Lyo should learn chains, not only
isolated edges.

A chain candidate is an ordered pattern over action/effect predicates:

```text
inspect -> edit -> verifier_fail -> inspect -> edit -> verifier_pass
```

Chain scoring should aggregate the credits of its constituent edges plus its
own outcome evidence:

```text
chainScore =
  edgeScoreAverage
  + verifiedCompletionBonus
  - unverifiedStopPenalty
  - unsafeWritePenalty
  - excessiveChurnPenalty
```

The first implementation can keep this simple:

```text
+1 chain credit when the chain ends in verified completion
 0 when the chain appears but no outcome evidence is available
-1 when the chain ends in regression, unverified claim, or avoidable churn
```

The process artifact should be scoped:

```text
task shape
language/ecosystem
workspace zone
risk class
known verifier family
```

This prevents a useful compiler workflow from being blindly applied to an iOS
simulator workflow or a Databricks deployment workflow.

## From Association To Module

Generalization learning is modularization. Lyo should compress repeated
associations into reusable modules.

Examples:

```text
verifier module:
  compiler source changes -> tests/compiler-frontend.test.js

context module:
  workflow-style changes -> workflow-style source + compiler tests + style docs

critic module:
  local edit without later verifier -> warn before done claim

policy module:
  local inspect/test/build -> low-friction approval policy
  external deploy/delete -> explicit approval policy
```

Generalization should follow a Polya-style rule:

```text
generalize when related specific edges have repeated positive credit
specialize when a broad edge gets counterexamples in a sub-scope
demote when repeated counterexamples dominate
```

Example:

```text
specific positive edges:
  workflow-style.ts -> compiler-frontend.test.js
  tokenizer.ts -> compiler-frontend.test.js
  semantics.ts -> compiler-frontend.test.js

generalized module:
  compiler-layer source change -> compiler-frontend.test.js
```

If the generalized module later fails for a sub-scope, Lyo should split it:

```text
compiler tokenizer/semantic source -> compiler-frontend.test.js
CLI command source -> cli.test.js
```

This is how local evidence becomes global structure without becoming a brittle
one-size-fits-all rule.

## Iterative Learning Loop

The learner should run in explicit iterations:

```text
observe:
  compile a run into actions, effects, predicates, and outcome

associate:
  extract co-fired resources, commands, predicates, and delivered artifacts

conjecture:
  create or update association edges and artifact candidates

predict:
  record what benefit the candidate expects in a future run

deliver:
  include promoted or experimental artifacts in a matching future run

evaluate:
  compare observed outcome to predicted benefit

credit:
  append +1 / 0 / -1 events

adapt:
  promote, retain, specialize, generalize, or demote artifacts
```

This is the cybernetic loop:

```text
observe -> compare -> act -> observe again
```

It is also the plausible reasoning loop:

```text
conjecture -> consequence -> test -> revise
```

## Global Behavior

Global behavior emerges when the association graph begins to control future
context and process selection.

The desired global behavior is:

```text
faster first useful context
tighter edit/verifier loops
fewer repeated prompts for routine next steps
fewer unverified completion claims
lower approval friction for safe local actions
better safety boundaries for risky external actions
more reusable modules across similar tasks
```

Global metrics should be measured over repeated attempts:

```text
verified completion rate
stopped-after-edit-without-verification rate
time to first verifier
mean edit-to-verifier delay
prompt count per verified outcome
tool/action count per verified outcome
unsafe write rate
approval friction rate
artifact reuse rate
artifact positive/negative credit ratio
```

The learner should report deltas, not just raw scores:

```text
before artifact delivery -> after artifact delivery
before generalized module -> after generalized module
attempt N -> attempt N+1
```

This keeps learning grounded in changed behavior rather than attractive
summaries.

## Canonical Data Model

The canonical record is append-only:

```text
association_edges
  association_id
  source_kind
  source_ref
  target_kind
  target_ref
  scope
  created_at

association_credit_events
  credit_event_id
  association_id
  run_id
  credit             -- -1, 0, or 1
  reason
  evidence_refs_json
  observed_at
```

Artifact learning adds append-only delivery and outcome records:

```text
learning_artifacts
  artifact_id
  artifact_kind      -- procedure, critic, verifier, context_pack, policy
  scope
  status             -- candidate, promoted, retained, demoted
  created_from_association_ids_json
  created_at

artifact_versions
  artifact_version_id
  artifact_id
  version
  content_json
  predicted_benefit
  created_at

artifact_delivery_events
  delivery_event_id
  artifact_version_id
  run_id
  delivery_mode      -- context, critic, verifier_suggestion, policy_hint
  evidence_refs_json
  delivered_at

artifact_outcome_events
  outcome_event_id
  delivery_event_id
  credit             -- -1, 0, or 1
  observed_outcome
  reason
  evidence_refs_json
  observed_at
```

Derived edge statistics can be materialized for speed:

```text
support = count(events)
score = sum(credit)
positiveRate = positive / support
negativeRate = negative / support
confidence = abs(score) / support
```

A mutable `model_weights` table can exist later as a cache, but it must not be
the source of truth.

## Artifact Promotion

Association credit should support concrete learning artifacts.

```text
procedure candidate:
  inspect -> edit -> verifier -> pass has repeated positive support

critic candidate:
  edit -> stop_without_verifier has repeated negative support

verifier candidate:
  resource -> command has repeated positive support

context pack:
  resource group repeatedly appears in successful traces

policy:
  action class repeatedly produces safe or unsafe outcomes
```

Artifacts move through explicit states:

```text
candidate -> promoted -> delivered -> evaluated -> retained | demoted
```

Promotion must require positive append-only evidence. Delivery and outcome must
also be recorded so the artifact can be evaluated later.

Promotion is not the end of learning. Promoted artifacts continue to receive
delivery outcome events. A promoted artifact that accumulates counterexamples
should be specialized or demoted.

The promotion invariant is:

```text
No artifact becomes operational knowledge unless later outcome evidence shows
that acting on it helped.
```

The demotion invariant is:

```text
No artifact is deleted because of a single failure. Counterexamples are first
used to specialize scope.
```

## Viability Bounds

The learner should not optimize a single metric blindly. It should keep
essential variables inside safe bounds:

```text
unsafe writes require approval
external deploys require approval
unverified claims stay below threshold
approval friction stays below threshold
token spend stays within budget
classifier unknowns remain visible
```

This prevents a learned policy from improving one metric while damaging safety,
trust, or interview fairness.

## First Implementation Slice

The first build should be read-oriented and append-only:

```text
1. Add schema for association_edges and association_credit_events.
2. Generate association candidates from one compiled run.
3. Label credit using existing temporal predicates:
   - verified completion
   - stopped after edit without verification
   - unsafe write
   - required verifier pass/fail when task context is available
4. Append credit events.
5. Report strongest positive and negative associations.
6. Do not yet auto-promote artifacts.
```

The second build should add conjecture and module formation without automatic
delivery:

```text
1. Create verifier, critic, context-pack, and procedure candidates from edge
   statistics.
2. Store candidate artifacts append-only.
3. Report predicted benefit and required confirming evidence.
4. Keep all candidates reviewable and inactive by default.
```

The third build should add controlled delivery and evaluation:

```text
1. Deliver promoted or explicitly experimental artifacts into matching future
   runs.
2. Record delivery events.
3. Compare predicted benefit to observed outcome.
4. Append artifact outcome credit.
5. Retain, specialize, generalize, or demote based on accumulated evidence.
```

The CLI shape can be:

```sh
lyo learn associations --db .agent-learning/learning.sqlite --run-id <id>
lyo learn associations --db .agent-learning/learning.sqlite --all-runs
lyo learn artifacts --db .agent-learning/learning.sqlite --dry-run
lyo learn artifacts --db .agent-learning/learning.sqlite --deliver --run-id <id>
```

Initial output should include:

```text
positive associations
negative associations
neutral associations
artifact candidates
missing signals
```

## Non-Goals

The first version should not:

- train a black-box model;
- mutate interview scoring rules;
- coach candidates during evaluate mode;
- promote artifacts automatically;
- replace deterministic classification;
- treat a single positive run as proof;
- treat raw source code as the primary learning artifact.

The transferable learning target is work structure: associations, procedures,
critics, verifiers, context, and policy.
