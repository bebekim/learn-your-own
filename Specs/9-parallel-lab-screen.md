# Spec 9: Parallel lab screen

Status: **partial**. The runner, analysis and CLI exist and are tested with a scripted
executor. No live host run has been made; no lesson has been screened.

## Why

Ordinary-session trials learn at the rate real work produces matching situations.
Even with session enrollment and the stratified exact test (Spec 8), that is weeks
per lesson. Learning speed should depend on compute, not on human attention.

The lab replays registered tasks in parallel isolated worktrees, half with the
advice and half without, and compares them **within each task**. Each task is
its own control, so task difficulty drops out of the comparison.

## Two tiers

| Tier | Question | Unit | Human attention |
|---|---|---|---|
| Lab screen (`lyo lab run`) | Does this advice move the declared verifier on replayed tasks? | Paired runs, task as stratum | Review each task family's verifier once |
| Ordinary trial (Spec 8) | Does it help in real sessions? | Sessions, repository as stratum | Approve a promotion digest |

A lab result is a **screen**, not a delivery decision. It suggests benefit on
replayed tasks; only ordinary trials establish it in real work. The lab's job
is to discard most candidates cheaply so the slow tier only confirms likely effects.

## What a run does

1. Load a plan: repository, runtime, model, advice text, tasks with their verifier
   files, `runsPerArm`, `concurrency`, a token budget, `alpha` and a seed.
2. For each task, schedule exactly `runsPerArm` runs per arm in a seeded random order.
3. Admit **whole tasks** against the budget, reserving every run's `max_tokens`
   before any of them starts. An unmeasured run is charged its full reservation.
   Admitting single runs would let earlier runs' token use, which advice can
   change, decide which runs are included, and that biases the test.
4. Run each attempt in its own detached git worktree at the task's `repo_ref`,
   with an empty Lyo lesson store and native Lyo config disabled, so ambient Lyo
   guidance is the same in both arms. The advice arm gets the task prompt plus one
   advice paragraph; the other arm gets the prompt alone.
5. Kill the executor's process group at the task's wall-time budget.
6. If the run changed a declared verifier file, record the outcome as unknown.
   Otherwise run the task's `success_check`. Keep the trace, prompt and diff, then
   remove the worktree.
7. Analyse with the stratified exact test (Spec 8), tasks as strata, at `alpha/2`.
   Unknown outcomes count against the advice in the benefit test.

`lyo lab run --plan plan.json --out <dir> [--dry-run] [--host-binary <path>]`
writes `plan.json`, `results.jsonl`, `report.json` and per-run artifacts.
`lyo lab report --out <dir>` recomputes the analysis from the retained results.

## Assumptions and limits

- **No shared state between runs.** Worktrees and stores are separate. The host's
  global configuration (CLAUDE.md, skills, MCP servers, the Lyo reasoning mandate)
  is shared but identical across arms.
- **Prompt delivery differs from ordinary delivery.** The lab puts the advice in the
  prompt; ordinary trials deliver it as hook context after a diagnostic. Transfer
  between the two is part of what the ordinary tier tests.
- **Token budgets cannot stop a run mid-way.** The wall-time kill bounds each run;
  the token budget bounds what is launched.
- **Verifier quality bounds what a screen means.** A verifier that misses a case
  (as the U+0085 transfer experiment showed) makes both arms look equally correct.
- Host runs reuse `task run`'s headless arguments, including the Claude
  `--allowedTools 'Bash(rtk *)'` restriction.

## Next increments

1. **Task supply.** Mine tasks from git history: revert a fix, keep its test as the
   verifier, hold out the fix. Without many tasks, the lab cannot learn faster.
2. **Verifier audit.** Before a family's first screen, check that the verifier fails
   on deliberately broken code (mutation check), and record the human review once.
3. **Overnight scheduling.** Run screens unattended with a hard budget and post one
   digest: screened benefit, harm, inconclusive, cost.
4. **Handoff.** A lesson that screens as a benefit becomes a candidate ordinary
   trial (Spec 8) with a reviewed trigger and evaluator.
5. **Orchestration.** An agent proposes lesson variants and plans screens; the human
   reviews verifiers and approves promotions, not individual runs.
