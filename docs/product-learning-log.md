# Product Learning Log

This document records what Lyo learns from being used on real telemetry. It is
not a specification and does not define promised behavior. Specs say what the
product should do; this log records what the product has revealed so far, where
the evidence is strong, and where the product is still misleading.

## 2026-06-11: Cherry-Picked Agentic Software Lessons

The useful lesson from the agentic-software framing is not that all traditional
software disappears. The useful lesson is that Lyo should model software work as
a controlled adaptive trace, not only as source-code production.

Traditional software can be described as:

```text
S = (R, P, E, V)

R = runtime resources
P = persistent program structure
E = execution environment
V = verifier / evaluation harness
```

The important property is that most decision structure in `P` is persistent and
must be designed, reviewed, changed, and verified by humans or by human-directed
agents.

Agentic software is better described as:

```text
A = (L, T, Mem, Policy)

L      = language model / reasoning engine
T      = executable tools
Mem    = memory and retrieved context
Policy = planning, routing, and action-selection mechanism
```

The useful state loop for Lyo is:

```text
o_t       = observe(s_t)
b_t       = infer(b_{t-1}, o_t, Mem_t)
a_t       = Policy(b_t, goal, T)
effect_t  = execute(a_t)
s_{t+1}   = transition(s_t, effect_t)
v_t       = verify(s_{t+1}, goal)
Mem_{t+1} = learn(Mem_t, trace_t, v_t)
```

Plain English:

```text
observe the system
update belief/context
choose an action
produce an effect
verify the changed state
revise memory from the evidence
```

This is the software-engineering model Lyo should care about. It turns the
question from:

```text
Did the agent generate code?
```

into:

```text
Did the agentic loop transform state into verified progress, and did the
evidence improve future loops?
```

### Lessons Adopted

Adopt:

```text
traditional software = persistent decision structure under verification
agentic software = runtime policy plus tools, memory, and verification
learning = evidence-backed change to future loop behavior
```

Adopt the perception-memory-action framing:

```text
perception -> telemetry normalization
memory     -> explanation beliefs and scoped lessons
action     -> commands, edits, tests, tool calls
environment -> repo, shell, services, databases
```

Adopt the contrast:

```text
AI-assisted coding:
  intent -> human/LLM coding loop -> static code -> execution -> result

Agentic engineering:
  intent -> agent loop -> tool actions/effects -> verification -> result

Lyo learning:
  intent -> loop -> effects -> verification -> belief update
  -> future context/intervention -> later evidence
```

### Lessons Not Adopted Raw

Do not depend on the paper's strongest asymptotic claims as product doctrine:

```text
all interaction topologies scale as 2^(n^2)
human cognitive capacity is literally O(1)
model capacity cleanly replaces human judgment
```

Those are useful rhetorical pointers, but they are too broad for Lyo's evidence
model. Lyo should use weaker, more defensible claims:

```text
interaction surfaces grow faster than review bandwidth
human attention and context are bounded
agentic work still needs telemetry, verification, and governance
```

### Product Implication

Lyo should not become a static memory notebook. It should become the observability
and learning layer for agentic software engineering:

```text
trace what happened
summarize effects
infer provisional explanations
deliver scoped context/artifacts
measure whether future behavior improved
```

## 2026-06-11: Work Corpus Association Learning Dogfood

### Question

We wanted to know whether the Polya-style association learner could find useful
learning signals from existing work telemetry under:

```text
/Users/marcus.kim/repositories/work
```

The specific product question was:

```text
Can Lyo discover recurring source -> verifier associations from historical
telemetry, rather than only evaluating a manually supplied conjecture?
```

### What Was Run

Two different read-only checks were run.

First, the normal corpus audit:

```sh
node src/cli.ts audit --dir /Users/marcus.kim/repositories/work
```

That answers telemetry-health questions:

```text
Can Lyo read the ledgers?
How much raw telemetry becomes normalized actions?
How often do edit runs have later verifier evidence?
Which commands remain unknown?
```

Second, a one-off read-only hypothesis extraction pass was run over the ledgers
that Lyo could compile. That pass looked for this pattern:

```text
local edits to a source scope
-> later passing verifier command
-> candidate source -> verifier hypothesis
```

That answers a learning question:

```text
Can repeated telemetry produce plausible association hypotheses?
```

### Corpus Health

Lyo found six `.agent-learning/learning.sqlite` files under the work tree, but
only three were readable by the current Node SQLite path:

```text
readable:
  /Users/marcus.kim/repositories/work/.agent-learning/learning.sqlite
  /Users/marcus.kim/repositories/work/nao/.agent-learning/learning.sqlite
  /Users/marcus.kim/repositories/work/nectr-data-lake-rep-621/.agent-learning/learning.sqlite

skipped:
  /Users/marcus.kim/repositories/work/nectr-data-lake-rep-655/.agent-learning/learning.sqlite
  /Users/marcus.kim/repositories/work/nectr-data-lake/.agent-learning/learning.sqlite
  /Users/marcus.kim/repositories/work/nectr_data_eng/.agent-learning/learning.sqlite
```

The skipped databases are valid SQLite files. The local `sqlite3` CLI could open
them with immutable URI mode, but the current Lyo audit path could not. That is
a product issue: historical ledger reading needs a more robust read-only open
strategy.

The readable corpus produced:

```text
ledgers scanned: 3
runs scanned: 186
raw hook events: 4,159
normalized actions: 2,249
normalized action rate: 54.08%
unknown actions: 110
unknown action rate: 4.89%
runs with edits: 13
verified edit runs: 6
edit verification rate: 46.15%
stopped after edit without verification: 7 runs
official unsafe-write runs from audit: 1
```

This means the corpus is useful but sparse for learning. Most runs are not
clear edit-verifier loops. Of the edit runs, slightly fewer than half had later
fresh verification.

### Strongest Learned Hypothesis

The strongest data-derived association was:

```text
jobs/utilibill/** -> uv run pytest tests/test_rep655_market_meter_data_report.py -q
```

Evidence observed:

```text
credibility: credible
supports: 4
distinct runs: 4
distinct ledgers: 1
Polya pattern: successive_varied_consequence
```

Plain English:

```text
When files under jobs/utilibill/** changed, Lyo repeatedly observed a later
passing pytest verifier:

uv run pytest tests/test_rep655_market_meter_data_report.py -q
```

This is not a manually seeded conjecture. It was derived from historical
telemetry by looking for repeated source-scope edits followed by fresh passing
verifier evidence.

### What The Hypothesis Means

The correct interpretation is narrow:

```text
Credible:
  jobs/utilibill/** has a recurring local verifier:
  uv run pytest tests/test_rep655_market_meter_data_report.py -q

Not proven:
  this verifier alone is sufficient for shipping
  this verifier should be auto-run without policy checks
  external/cloud/deploy behavior is safe
  all jobs/utilibill changes are covered by this one test
```

This distinction matters. The association learner has found a plausible local
verifier relationship, not a full release policy.

### Defeater And Risk Context

The one-off hypothesis extractor attached a broader risk warning to several
support events:

```text
support event(s) occurred in runs with unsafe/external/deploy actions
```

This warning is intentionally conservative and broader than the official audit
field `unsafeWriteRuns`. It says that local verifier evidence was observed near
cloud, deploy, external, or other high-risk actions.

That does not defeat the verifier association. It does weaken any stronger
claim such as:

```text
the local pytest pass proves the whole workflow is shippable
```

Product lesson:

```text
Lyo must separate local verifier credibility from policy/risk credibility.
```

A local test can be a strong verifier for a code path while still being
insufficient evidence for external writes, deploys, or Databricks state.

### Noise Observed

The hypothesis extractor also found associations like:

```text
tests/** -> uv run pytest tests/test_rep655_market_meter_data_report.py -q
private/tmp/** -> uv run pytest tests/test_rep655_market_meter_data_report.py
```

These are weaker learning signals.

`tests/** -> pytest` is often obvious and may not generalize. If a test file was
edited and the same test command passed, that says less about production source
coverage than:

```text
jobs/utilibill/** -> pytest
```

`private/tmp/** -> pytest` is usually a scratch-work or copied-file signal. It
may be useful provenance, but it should not be promoted as a durable project
association without stronger evidence.

Product lesson:

```text
The learner needs scope quality, not just support counts.
```

The system should prefer:

```text
source-code scope -> verifier
```

over:

```text
test scope -> same test
temp path -> verifier
```

unless the weaker scopes have an explicit reason to matter.

### What Was Actually Learned

The run shows that the current learning direction is viable:

```text
association = conjecture
evidence = observation
update = provisional credibility change
```

The product can already move from raw telemetry to a candidate hypothesis:

```text
Observed repeated local pattern:
  jobs/utilibill edits
  followed by passing REP-655 pytest verifier

Provisional credibility change:
  raise credibility of the jobs/utilibill -> REP-655 pytest verifier
  association to credible
```

This is materially different from a ternary `+1 / 0 / -1` association rule. The
useful output is not the score. The useful output is the structured explanation:

```text
hypothesis
observed consequence
freshness
support count
distinct run count
possible defeaters
scope quality
provenance refs
```

### Product Gaps Revealed

The dogfood run exposed several concrete product gaps.

1. Historical ledger opening is brittle.

   Some valid SQLite ledgers under the work tree could not be opened by the
   current Node SQLite path. Lyo needs an immutable read-only open mode, a safe
   temp-copy fallback, or both.

2. Hypothesis discovery needed a first-class CLI.

   The audit command reported telemetry health, but did not emit association
   hypotheses. That gap is now addressed by:

   ```sh
   lyo learn associations --dir /Users/marcus.kim/repositories/work --dry-run
   ```

   Use `--compact` for promotion-oriented output that omits the full hypothesis,
   evidence, and explanation-belief arrays:

   ```sh
   lyo learn associations --dir /Users/marcus.kim/repositories/work --dry-run --compact
   ```

3. Scope ranking is too naive.

   Support counts alone make `tests/** -> pytest` look similar to
   `jobs/utilibill/** -> pytest`. The product should rank durable source scopes
   above test-only and temp-only scopes.

4. Risk and verifier evidence are entangled.

   A local passing verifier can support a source association while external
   actions in the same run remain policy-sensitive. Lyo needs separate
   credibility channels for:

   ```text
   local verifier usefulness
   shipping sufficiency
   external-write safety
   deployment safety
   ```

5. Failed-verifier learning is absent in this corpus.

   The audit saw no runs with failed verification, which means the current work
   corpus cannot teach much about failure recovery. That may be an instrumentation
   issue, not a real absence of failures.

6. The learning record is not persisted.

   Hypotheses and evidence events are still dry-run output. There is no
   append-only table yet for carrying these conjectures forward.

### Product Direction After This Run

The next product slice was not another scoring rubric. It made the observed
learning path first-class:

```text
lyo learn associations --dir <root> --dry-run
```

The output now contains:

```text
AssociationHypothesis records
EvidenceEvent records
support and weakening evidence
defeaters
scope-quality warnings
provenance refs
recommended next experiment
```

The compact output now adds:

```text
promotableCandidateCount
blockedHypothesisCount
topPromotionCandidates
topBlockedHypotheses
promotionBlockers
```

It remains read-only until append-only persistence is designed and tested.

The core product learning is:

```text
Lyo should learn by accumulating provisional credibility around explicit
conjectures, not by assigning raw ternary credit.
```

The effect algebra remains the sensor layer. It tells us what happened and
when. The learning layer must decide whether the observation actually bears on a
conjecture, whether the evidence is fresh, whether rival explanations exist,
and whether the scope is good enough to reuse.

## 2026-06-11: Polya Patterns Are Labels, Not Production Rules

### Question

We revisited Polya's plausible inference patterns and the Pearl-style critique:

```text
A predicts B
B happened
therefore A became more credible
```

This sounds useful, but it is unsafe as a machine rule. The direction of the
credibility update can flip if a rival explanation or defeater is present.

Example:

```text
fire -> smoke
smoke observed
```

Smoke seems to support fire until another explanation appears:

```text
bad muffler -> smoke
```

Now smoke may support the muffler explanation and weaken the fire explanation.

### Product Implication

Lyo should not use Polya patterns as production rules.

Instead:

```text
Polya pattern = evidence-pattern label
association = hypothesis generation
explanation graph = belief update mechanism
artifact delivery = intervention
future telemetry = feedback
```

The learner should only strengthen a hypothesis when evidence is represented
with:

```text
scope
chronology
freshness
rival explanations
defeaters
novelty / independence
outcome
```

This keeps Lyo from treating co-occurrence as learning.

### Implementation Consequence

`lyo learn associations --dry-run` now needs to be interpreted as two layers:

```text
associationHypotheses:
  conjectures generated from repeated trace structure

explanationBeliefs:
  derived belief reports that apply explicit explanation-graph factors to those
  conjectures
```

The association counters remain useful evidence summaries, but they are not the
learning rule. The explanation-graph report is the first place where Lyo asks:

```text
Given this evidence and its rivals/defeaters/scope, how much should belief in
this hypothesis change?
```

### Remaining Gap

The current factor tables are deterministic and explicit, but still hand-set.
That is acceptable for the first transparent implementation. The next product
step is to make the graph emitter inspectable and compare these factor-derived
beliefs against future intervention outcomes.

## 2026-06-11: Association Promotion Output Becomes Reviewable

### Question

Once association hypotheses exist as first-class CLI output, the next adoption
question is:

```text
Which hypotheses are ready to test as future behavior changes, and which ones
are blocked?
```

Raw hypothesis and evidence arrays are useful for inspection, but they make the
operator do too much work. The promotion decision needs to be visible in the
report itself.

### What Changed

`lyo learn associations` now distinguishes:

```text
promotionCandidate:
  true when a hypothesis has credible evidence and no current blockers

promotionBlockers:
  explicit reasons the hypothesis should not yet be promoted
```

Current blockers include:

```text
association_credibility:<state>
support_count_below_2
distinct_run_count_below_2
distinct_ledger_count_below_2
weaken_events_present
defeat_events_present
scope_warning:<warning>
evidence_policy_warning:<warning>
```

The compact output is intentionally review-oriented:

```sh
lyo learn associations --dir <root> --dry-run --compact
```

It reports counts plus the top promotion-ready and blocked hypotheses without
emitting every evidence event.

### Product Lesson

Promotion is not the same as credibility.

A source-to-verifier association can be locally useful while still blocked from
promotion by scope quality, insufficient distinct evidence, weakening evidence,
or policy-sensitive actions near the support window. This keeps Lyo's learning
loop conservative:

```text
conjecture
-> explanation-aware belief
-> explicit promotion gate
-> future intervention
-> later outcome evidence
```

### Remaining Gap

Promotion candidates are still reports, not delivered artifacts. The next
durable step is an append-only persistence path for hypotheses, evidence events,
and promotion decisions, followed by a separate delivery mechanism that can be
measured against future telemetry.
