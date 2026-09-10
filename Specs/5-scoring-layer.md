# Scoring and learning-cost evidence

State: partial — descriptive measurement implemented; useful-learning yield open
(reviewed 2026-09-10)

The internal question is whether useful learning justifies the tokens spent to
obtain it. Counting saved lessons or delivered findings cannot answer that.

## Implemented measurement

- [x] [Prompt measurement](../src/measurement/prompt-kind.ts) distinguishes
      content-induced flips from positional overrides and reports inter-method
      concordance. These are descriptive measures, not ground-truth accuracy.
- [x] [Turn cost attribution](5.2-cost-attribution-turn-id.md) and
      [episode spend](5.3-episode-compression-cost.md) expose recorded costs and
      grouping assumptions.
- [x] [Task evidence](../src/lyo/control/task-evidence.ts) and
      [evaluation reports](../src/eval/report.ts) separate acceptance, regressions,
      unknown evidence and costs.
- [x] Retained source, reflection, candidate and trial costs exist for the recent
      specific-intervention screen; see [Spec 8](8-learning-evidence-loop.md).

Prompt likelihood constants (99/3/4), Jaccard overlap ≥ 0.5 and short-continuation
grouping remain uncalibrated priors. Agreement between classifiers is not accuracy.
Repeated or similar prompts can be productive; `retrySpend` and `echoSpend` do not
establish avoidable waste. A verifier pass or absence of a retry also does not
establish the user's full task acceptance.

## Useful-learning yield

Report separately:

1. Tokens spent, with source, generation/reflection, delivery, evaluation and
   implementation/orchestration scopes. Identify overlap, cached input and unknown
   coverage; token totals are not dollar costs.
2. Candidate and finding counts, to describe outputs.
3. **Validated useful interventions**, to measure the useful output denominator.
   Require comparable later accepted work, regression checks and total learning cost.

The recent transfer work produced zero validated useful coding interventions.
The ratio is therefore undefined/no finite value, not zero tokens per lesson.
Do not replace the denominator with three observed findings. Report negative and
inconclusive trials even when the cost-to-usefulness picture is poor.

## Remaining acceptance

- [ ] Enforce an all-in experiment allowance before and during execution,
      including reflection and orchestration. Current trial budgets are checked
      after work and can be exceeded.
- [ ] Validate useful transfer at acceptable total cost.
- [ ] Calibrate classification/grouping only against relevant independently
      labeled outcomes; session efficiency alone must not award lesson credit.
- [ ] Attribute corrected measurements and unknown costs consistently through
      future policy updates.

This replaces the sports/hiring metaphor and the proposed session-efficiency
score as the learning objective. The existing descriptive reports remain useful
for inspection; no new composite KPI is introduced.
