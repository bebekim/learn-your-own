# Spec 10: Harness² library entry trial

Status: **draft**. Nothing here is implemented or run. It needs two increments
(an entry importer and file-tree delivery in the lab) and a Harness² library
built on a benchmark first.

## Why

Harness² ([google-research/harness2](https://github.com/google-research/harness2),
paper [arXiv:2610.14224](https://arxiv.org/abs/2610.14224)) edits an agent's harness
per task and keeps a library of adopted harnesses with an `EXPERIENCE.md` lesson. Its
claims rest on evidence that LYO treats as proxies:

- **Adoption is a judgment, not a measurement.** A proposed harness passes only
  structural checks (`core/recursion.py` `_accept_tree`). A composer model builds the
  final harness from contrasts between runs, and a blind selector picks among the
  finals (`core/selection.py`). The grader is never consulted.
- **Library entries are written on form, not evidence.** `Library.add` stores an
  entry whenever the reflection reply has non-empty `cue`, `lesson` and `evidence`
  fields. The prompt asks for `confounded` verdicts and `NO_ENTRY` when evidence is
  thin, but the code does not parse verdicts or confidence. An entry is stored even
  when the adopted harness is identical to the base.
- **The comparison does not hold compute fixed.** At k=1 the delivered output follows
  four executions of the same task. No baseline gets four executions and a selector.
- **Failures leave the denominator.** Ungraded tasks and failed selections are
  excluded from the reported mean (`core/report.py`), and nothing in the repository
  pairs adapted scores with `base_judged.json` per task.
- **Transfer is barely tested.** The paper's library ablation is within-stream;
  cross-benchmark gains are +0.5 to +2.9 and described as a retrospective test.

This spec turns two of those claims into LYO trials, with fixed arms, fixed analysis
and failures kept in the denominator.

## Claims under test

| ID | Claim | Witness that would establish it here |
|---|---|---|
| C1 | An adopted library entry, applied unchanged to **unseen** tasks, raises the pass rate over the base harness. | Lab screen, entry vs no entry, paired within each held-out task, task-stratified exact test (Spec 9). |
| C2 | Task-level refinement (Harness² k=1) beats spending the **same number of executions** on the base harness with the same selector. | Paired comparison per task: refined final vs blind-selected best of four base runs. |

C1 is the reusable-learning claim LYO cares about. C2 tests whether the per-task gain
is more than extra attempts. Neither result says anything about general competence;
each establishes an effect on its declared check, on its task set, for its model and
executor.

## Phase 0: obtain entries

1. Run a Harness² sweep on one benchmark subset with a hard spend cap (see Budget).
   WorkBuddy-Bench `--subset code` is preferred because its tasks are closest to LYO's
   repository tasks. Use `--substrate cx` (Codex) so the executor matches LYO's
   `codex` runtime.
2. Keep every library entry, including ones the trial will not use, and record the
   sweep's `summary.json` files, adopted harness fingerprints and improver spend.
3. **Select entries before seeing any LYO outcome.** The rule: up to three entries
   whose `confidence` is not `low` and whose `edits.md` has at least one `helped`
   verdict that is not `confounded`. Ties go to the earliest entry in stream order. If
   no entry meets the rule, stop: report that the library produced no entry that
   clears its own stated bar, and run only C2.

Selection uses the library's own fields; a reviewer reads the chosen entries once to
check that they contain no task answers. That review is recorded, and it is a
judgment, not evidence of benefit.

## Phase 1: entry screen (C1)

### Required increments

1. **Entry import.** `lyo finding import-harness2 --entry <dir> --store <path>`
   creates a finding whose intervention is the entry's `lesson`, whose activity is a
   reviewed restatement of its `cue`, and whose `evidenceRef` is the hash of the entry
   directory (`EXPERIENCE.md` plus the full harness tree). Validity starts as
   `unvalidated`. Import establishes provenance only.
2. **File-tree advice in the lab.** Extend the lab plan's `advice` with
   `files: [{ path, sha256 }]`. Each run in the advice arm gets those files written
   into its worktree before the executor starts; the no-advice arm gets none. The
   run fails closed if a hash does not match. The mapping from Harness² components
   to Codex paths (system prompt → `AGENTS.md` append, skills → skill directory,
   scripts → `scripts/`) is fixed in the plan and hashed with it. Plugins and
   guardrail hooks are **excluded**: they run code inside the tool loop, and the lab
   does not sandbox them.

### Design

- **Tasks:** LYO lab tasks (git `repo_ref`, command `success_check`) that did not
  contribute to the library. No task may share a repository with a Phase 0 task.
  Target 20 tasks; each task family's verifier must fail on deliberately broken code
  before the screen starts. That is Spec 9's planned verifier-audit increment, which is
  not implemented; until it is, run and record the check by hand.
- **Arms:** `advice` = entry files mounted (plus the lesson paragraph in the prompt,
  so text-only and file effects are not separated; see Limits), `no-advice` = base.
- **Runs:** `runsPerArm: 4`, so 160 runs. One screen per entry; three entries means
  three registered plans with separate IDs.
- **Isolation:** the existing lab guarantees apply: detached worktrees, empty lesson
  store, native LYO config disabled, wall-time kill, and changed verifier files make
  the outcome unknown.
- **Analysis:** task-stratified exact test at `alpha/2` with `alpha = 0.1`. Unknown
  outcomes count against the advice for the benefit test and for it in the harm
  test. Three entries mean three tests: apply Holm's correction across them before
  calling any entry a benefit.

### Decisions

| Result | Recorded as | Next step |
|---|---|---|
| Benefit after correction | `screened-benefit` | Candidate ordinary trial (Spec 8) with a reviewed trigger and evaluator. |
| Harm | `screened-harm` | Withhold; record against the entry. |
| Neither | `inconclusive` | Withhold. Not evidence that the entry is useless. |

A screened benefit is still not a delivery decision; Spec 9's tier rules apply.

## Phase 2: compute-matched refinement (C2)

Runs inside Harness² on the Phase 0 benchmark, on tasks **not** used in Phase 0, with
the library disabled (empty library root) so only task-level refinement is tested.

- **Arm R (refined):** `run_task` with `k=1`, one mode. Four executions (one
  reference, two candidates, one composed final) and three improver sessions. The
  delivered output is the composed final.
- **Arm M (matched):** four executions of the base harness on the same task, then
  `run_selection` over those four outputs with the same selector channel, prompt and
  `pool_kind`. The delivered output is the selected base run.
- **Pairing:** both arms run on every task, in a seeded random order per task, with
  the same executor model and settings. A third arm, **B** (one base execution,
  no selector), is the reference both arms are reported against.
- **Outcome:** a binary pass on the benchmark's own judge, fixed before the run:
  `all_pass` on LAB, otherwise `score ≥` a threshold chosen from Phase 0 base scores
  and written into the registration. The fractional score is reported but not tested.
- **Failures count.** A task where an arm produced no deliverable, failed selection,
  or was not graded counts as a **fail** for that arm. The count of each failure kind
  per arm is reported. This replaces Harness²'s exclusion rule.
- **Analysis:** exact McNemar on discordant pairs (the task-stratified exact test with
  one run per arm per task), one-sided for R > M at `alpha/2`. Report R vs B and M vs B
  descriptively.
- **Judge independence:** the scoring judge must come from a different model family
  than the editor and selector. If the benchmark's judge cannot be changed, record
  the overlap as a limit of the result.
- **Executor tokens** per arm are reported alongside the outcome. Arm R also spends
  improver sessions that arm M does not, so R is matched on executions and advantaged
  on total compute. If R does not beat M under that advantage, the per-task gain is
  not shown to exceed extra attempts.

### Sample size

Not yet fixed. Before registration, simulate exact McNemar power at the planned task
count using Phase 0 base pass rates and the observed concordance between repeated base
runs. Register the task count, threshold and alpha together; do not add tasks after
seeing outcomes.

## Budget

Set before any run, enforceable, and including every cost (finding
`catalog-20260910:learning-budget`):

- **LYO lab:** `budget.maxTokens` admits whole tasks before launch (Spec 9).
- **Harness²:** it has no token cap. Enforce spending with a Vertex AI **quota** or a
  billing cap that stops calls, not an alert. Cap with `--max-tasks` and record the
  cap in the registration.
- **Report:** acquisition (Phase 0 sweep), evaluation (Phases 1–2 executor and judge
  calls) and orchestration (this work) separately. Harness²'s own report counts only
  improver spend; executor spend has to be added from the run records.

## Safety

Harness² launches its editor with `claude --dangerously-skip-permissions` and the
Codex executor with `--dangerously-bypass-approvals-and-sandbox`; executor network
access is unrestricted. Run Phases 0 and 2 in a disposable VM or container with no
credentials besides the Vertex project, and egress limited to the model endpoints.
Without that restriction, public rubrics may be reachable during execution, and a
result must be recorded as possibly contaminated.

## Limits

- **Transfer distance is a variable, not a constant.** Phase 1 moves entries from a
  benchmark to repository tasks and from OpenCode or Codex to LYO's Codex runtime. A
  null result may mean the lesson does not transfer that far, not that it is wrong.
- **File and text effects are not separated** in Phase 1. A follow-up can split the
  arms if an entry screens as a benefit.
- **The lab delivers advice in the prompt**, unlike ordinary hook delivery (Spec 9).
- **Verifier coverage bounds the result** (finding `catalog-20260910:experiment-design`):
  both arms can pass a verifier that misses the case the lesson is about.
- **One benchmark, one model, one executor** per phase. The error allowance applies to
  the registered tests, not to a search over further entries or thresholds.

## Acceptance

This spec is done when, for at least one entry and one task set:

1. the registration (entries, rule, tasks, thresholds, alpha, budget, sandbox) is
   hashed and stored before the first run;
2. Phase 1 and Phase 2 results are recomputable from retained results with
   `lyo lab report` or an equivalent read-only command; and
3. the write-up states which claim each result supports, using the decision tables
   above, including an inconclusive outcome.
