# 5 — Scoring Layer: At-Bat Score, Practice Score, and Signal Discipline

**State:** draft (direction spec — pins rules, defines rework; not a pipeline item yet)
**Layer:** 5 (scoring)
**Dependencies:** 4.5 (prompt kind evidence), 4.6 (measurement), 4.7 (backfill),
3.1 (counterfactual credit), `docs/candidate-at-bat-telemetry-spec.md`.

## Pinned rules

These rules govern all signal-producing and classifying code from this point on.

### Rule 1 — The rent test

A signal, kind, or taxonomy distinction exists only if it pays rent in prediction:
knowing it must change the expected outcome of an intervention. A distinction that
does not move expected outcomes is decoration — the Yahoo directory problem — and
gets deleted regardless of how intuitive it feels.

### Rule 2 — No new hand patterns

Moratorium on hand-authored classification knowledge: no new regexes, no new
hand-picked kinds, no new hand-picked thresholds. New signals must be either derived
from data (clustering, outcome structure, behavioral traces) or proposed with an
explicit measurement plan. Crystallized knowledge is technical debt by default.

### Rule 3 — Signals are on trial

Every signal is hired with a prior, promoted or fired by measurement. Concretely:
each evidence method's likelihood ratio starts as a documented guess and is refit
from accumulated outcomes (flips, retries, verifier results). A method whose measured
LR approaches 1 (no predictive value) is removed.

## The two scores

### At-bat score (performance)

Did the intervention produce a positive state transition? Measurable from the ledger
today, no text classification required:

```
prompt → turn → PostToolUse exit codes → verifier results → red→green transitions
```

### Practice score (learning velocity)

Does intervention quality improve over time? Measurable as trends over session
windows:

- at-bat score trend
- repeated-mistake rate (same failing command class recurring)
- recovery velocity (turns from red to green, trending)

Practice never scores runs; the practice score exists to verify the cage work is
converting into better at-bats.

## Rework queue (audit of 4.5–4.7)

The prompt-kind line shipped Google machinery with some Yahoo residue. Rework items,
in order:

- **R1 — Flip definition.** A flip currently counts any prompt whose stored kind
  differs from its heuristic vote while later evidence exists. That admits 6 false
  positives in the current ledger (positional `direction_setting` dominance counted
  as flips). Correct definition: the stored kind equals a kind evidenced by a
  non-positional, non-heuristic method AND differs from the heuristic vote.
- **R2 — Pseudo-accuracy is structural.** With fixed LRs (4 > 3), contextual wins
  every disagreement, so "agreement with belief" restates the LR ordering (contextual
  showed 96% — by construction). Replace with inter-method concordance (heuristic ×
  contextual agreement, independent of the belief) plus outcome-linked validation.
- **R3 — Retry threshold.** Jaccard 0.5 is hand-picked. Keep as a documented prior;
  calibrate against session outcomes or replace with a distribution-derived cutoff.
- **R4 — Regex classifiers on trial.** `classifyPromptKind` and
  `classifyResponseContext` are priors, not truths. Calibration (below) measures
  their real LRs; results decide whether they stay.

## Calibration (the instrument for Rule 3)

Estimate each method's real accuracy from the ledger: compare method votes against
outcome labels (turn succeeded = verifier pass / no retry / session goal progress).
Measured accuracy → measured LR → refit `PROMPT_KIND_LOG_LR`. Constants are versioned
when they change so belief history remains interpretable.

## Sequencing

1. R1 + R2 (measurement corrections — small, unblocks trustworthy numbers)
2. At-bat score wiring (prompt → turn → outcome join)
3. Calibration refit (R3, R4 decided by data)
4. Practice score trends

## What this layer is NOT

- No embeddings yet. The flat-margin residue (129 prompts, 16% at last measurement)
  is the empirically-sized case; revisit when calibration shows current signals
  bottoming out.
- No new taxonomy. Kinds stay as-is until clustering over accumulated data earns a
  revision.
