# LYO Improvement Roadmap

Date: 2026-07-27
Status: active
Scope: scaffolding improvement only — no θ updates, no world models, no causal estimators.

## Framing

The loop's recording and delivery are ahead of its accounting. Nothing yet is
systematically charged for being wrong, stale, expensive, or noisy. The
improvement axis is not more machinery; it is a system that keeps score on
itself as rigorously as it scores the models.

## Areas (ordered by leverage)

### 1. Outcome-aware selection policy (IN PROGRESS)

`selectLessons` scores by `evidenceRuns` — a lesson that fails to transfer
four times ranks higher the more it fails. Selection must become a policy over
outcome posteriors: per-lesson helpful/harmful counters, Beta-Bernoulli
posterior, Thompson sampling (seeded, injectable RNG). Selection is the "try"
layer; credibility gates remain the "trust" layer.

### 2. Demotion (IN PROGRESS, same change)

The library is append-only; lessons age (model versions, harness changes).
A lesson whose outcomes turn harmful must sink in selection and eventually
quarantine. v1 rule: `harmful >= 2 && helpful == 0` → demoted (excluded from
selection). `recordLessonOutcome` is the write path for both counters.

### 3. Deterministic pre-classification

Judge variance is real (run 5 judged twice: 4 hallucinations vs 3+1 spec-gap).
Many classes are mechanically decidable (`-0` under Object.is, ESM/CJS
mismatch, truncation). Deterministic first pass; LLM judge for the residue.

### 4. Spec-proposals queue

Judge-emitted `spec_edit` suggestions currently die in lesson markdown. The
spec is human-owned, so proposals must be first-class artifacts with status
(pending/accepted/rejected), closing the loop without touching ownership.

### 5. Cost accounting in traces

Trace stages record models and prompt hashes but not tokens/cost. Executors'
API responses carry usage; capture it. "What did the -0 lesson cost to learn?"
should be answerable.

### 6. Transfer evidence discipline

`compare` verdicts are single noisy run-pairs; transfer claims need the same
credibility discipline as promotions (N runs per cell before credit is
recorded). Otherwise the weighting layer consumes precise garbage.

### 7. Parser rules as artifacts

Four block-format variants, each hand-patched. Grounding rules (block formats,
TAP quirks) should be versioned, evidence-backed artifacts — the smallest safe
instance of learning updating execution semantics.
