# Product Learning Log

This document records what Lyo learns from being used on real telemetry. It is
not a specification and does not define promised behavior. Specs say what the
product should do; this log records what the product has revealed so far, where
the evidence is strong, and where the product is still misleading.

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

2. Hypothesis discovery is still a script, not a first-class CLI.

   The audit command reports telemetry health, but it does not yet emit
   association hypotheses. The product needs:

   ```sh
   lyo learn associations --dir /Users/marcus.kim/repositories/work --dry-run
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

The next product slice should not be another scoring rubric. It should make the
observed learning path first-class:

```text
lyo learn associations --dir <root> --dry-run
```

The output should contain:

```text
AssociationHypothesis records
EvidenceEvent records
support and weakening evidence
defeaters
scope-quality warnings
provenance refs
recommended next experiment
```

It should remain read-only until append-only persistence is designed and tested.

The core product learning is:

```text
Lyo should learn by accumulating provisional credibility around explicit
conjectures, not by assigning raw ternary credit.
```

The effect algebra remains the sensor layer. It tells us what happened and
when. The learning layer must decide whether the observation actually bears on a
conjecture, whether the evidence is fresh, whether rival explanations exist,
and whether the scope is good enough to reuse.
