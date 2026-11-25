# Spec 14: Hypothesis generator

Status: **implemented** (2026-11-25). Replay check: the generator, given only failures up to 30 September,
proposed the JSON situation among 6 hypotheses. Replayed over October–November its rate held (13.8 matches a
month against 10 predicted), but repository spread is **untested**: 22 of 28 matches came from since-deleted
worktrees whose repository cannot be identified, so only 3 repositories were countable against 6 predicted.
Against the 178 hand-labelled cases it shares, its uncalibrated provisional cut-off matched 23, all labelled
true, and missed 58 true ones: precise but conservative before calibration. Builds on [Spec 12](12-async-decision-trigger.md) and
[Spec 13](13-action-evaluator.md); revives the generation half of
[Spec 2](2-learning-as-explanation-graph.org): *association is hypothesis generation,
learning is inference over explanations.*

## Why

LYO's only trial-ready lesson (`finding:json-output-handling`) was found by hand: mining
the corpus for recurring failures, reading the repairs, writing the situation as a
question, labelling 218 cases and calibrating a decision model. Spec 12 and 13 automated
the *testing* half. This spec automates the *finding* half, so candidate lessons come from
the work itself rather than from a long session.

## The pipeline, from what was done by hand

| Manual step on 2026-11-25 | Automated as |
|---|---|
| Grouped failures with a hand-written regex | **Propose**: a generator model reads recent unexplained failures and their repairs, and writes hypotheses. Grouping is the model's job, not a pattern's. |
| Wrote the situation as a 1–5 question | Each hypothesis carries its own **situation question** and **advice**. |
| Checked whether it kept happening | **Shadow**: the background worker asks the question about new failures. Nothing is delivered. |
| Labelled cases from repairs | **Harvest**: matched failures, with their repair context, become cases in the hypothesis's case set. |
| Calibrated and registered a trial | Unchanged: Spec 12 recalibration, then `finding declare` and `trial-register` after review. |

## 1. Propose (abduction)

`lyo hypotheses propose` reads, locally:

- **Executed failures** from the last N days that no active hypothesis has claimed: the
  command, its closed labels and the tail of its output.
- **Their repairs**: what the agent did next in the same session, from Claude transcripts
  (the repair-witness evidence of Spec 12).

It sends one batch to a **generator** and asks for at most K hypotheses, each with:

```json
{ "situation": "a JSON-parsing step received input other than the JSON it assumed",
  "question": { "type": "score", "instructions": "...", "criteria": ["1: ...", "...", "5: ..."] },
  "advice": "<= 220 characters",
  "rivals": ["another explanation of the same failures"],
  "predicted": { "matchesPerMonth": 8, "repositories": 3 },
  "exampleIds": ["the failures it explains"] }
```

- **Exploration (ε = 0.1).** One proposal in ten must be a *rival*: a different explanation
  of failures an existing hypothesis already claims, or an explanation of the least-explained
  failures. This is the ε-greedy idea, applied to generating hypotheses rather than
  delivering them.
- **The generator is swappable**, like decision providers: a local model through mlxcel, or
  OpenRouter with ZDR. Repository content goes only to the configured generator, which is an
  explicit choice, as in Spec 12.
- Proposals are stored as `hypothesis@1` records with status `proposed`. Their text is model
  output, not instructions.

## 2. Shadow (prediction without delivery)

An accepted proposal becomes a **shadow trigger**. Every executed failure in scope is
queued, as in Spec 12, and the worker asks each shadowing hypothesis's question about it. It
records a `hypothesis-match@1` with the level. Nothing reaches the agent.

- **The prediction is checked, not assumed.** After the window (default 30 days) the
  hypothesis is `recurrent` if its matches meet `predicted` (rate and repository spread);
  otherwise `refuted-recurrence`.
- **Untested is not refuted.** A hypothesis whose window saw too few failures in scope to
  judge stays `untested`, and is reported separately.
- **The band is provisional.** An uncalibrated question can only rank. Shadowing records
  raw levels with a fixed provisional cut-off (expected level ≥ 4), and calibration happens
  later, at harvest.
- **Rivals compete.** When two hypotheses claim the same failure, both matches are
  recorded. Which explanation the repairs support is settled at harvest.

## 3. Harvest (cases from repairs)

For a `recurrent` hypothesis, `lyo hypotheses harvest --id` builds its case set:

- **Positives and negatives.** Its matched failures, plus a random sample of non-matched
  failures from the same period, with their repair context.
- **Labels from repairs.** An agent labels each case from the repair, as the 207-case review
  did, with `labelSource: repair-witness` or `agent-draft`.
- **Defeaters are recorded.** A repair that contradicts the advice (the agent fixed something
  else, and the advice would not have helped) is a defeater. A hypothesis whose matched cases
  are mostly defeated is `defeated`, even if it recurs.

The case set then goes through Spec 12 `finding cases-import` and `finding recalibrate`.

## 4. Status and budget

```
proposed → shadowing → recurrent → harvested → candidate → (trial, via review)
                    ↘ refuted-recurrence | untested     ↘ defeated
```

- **Promotion to a trial is never automatic.** `candidate` means "ready for review". A
  person or reviewing agent declares the finding and registers the trial, as today.
- **Bounded cost.** At most `maxShadowing` (default 5) hypotheses shadow at once, so each
  failure costs at most 5 local decisions. `propose` runs on demand, with a token budget
  per run. Both limits are in `~/.lyo/decisions.json`.

## Acceptance

1. `propose` on a fixture corpus produces schema-valid hypotheses. At least one proposal in
   ten is marked as a rival. Nothing is sent when no generator is configured.
2. Shadowing records matches for new failures without delivering anything, and respects
   `maxShadowing`.
3. Window evaluation distinguishes `recurrent`, `refuted-recurrence` and `untested`.
4. Harvest produces a case set that `finding cases-import` accepts, with a test split.
5. **Replay check.** Run on failures up to 30 September only, the pipeline proposes a
   hypothesis that matches the JSON situation, and replay over October–November confirms
   recurrence. This tests the generator against the one lesson found by hand. Claude
   transcripts on this machine start in late August (140 failures up to September,
   429 after), so the proposal window is effectively September.

## Commands

```sh
lyo hypotheses propose [--from --until --max-episodes --max-proposals]   # needs "generator" in decisions.json
lyo hypotheses list [--status]      lyo hypotheses show --id
lyo hypotheses accept --id          lyo hypotheses retire --id [--defeated] [--reason]
lyo hypotheses replay --id --from --until          # ask about historical failures; nothing delivered
lyo hypotheses evaluate --id [--window-days]       # judge live shadowing after its window
lyo hypotheses harvest --id [--out]                # review pack for labelling
```

## Not in scope

Automatic trial registration; non-Claude repair context; generating lessons from
successes; merging near-duplicate hypotheses beyond recording rivals.
