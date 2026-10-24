# A complete task feedback cycle

Reference for the explicit registered-task experiment. For reusable triggers in ordinary Codex/Claude sessions, use [prospective finding trials](prospective-finding-trials.md). The two paths have different comparison and correction contracts.

The task workflow connects a declared task to native intervention delivery,
independent verification, measured host usage, feedback, and a frozen policy
used in later work. An inconclusive comparison is a valid result. Completing
the connection does not establish that guidance improves coding work.

## Run a task

Use Node 24 or newer and the package installed for the Codex/Claude hooks.
Task commands use the configured central database unless `--db` or
`LEARNLOOP_DB` overrides it. Keep traces and verifier files outside the task
worktree. Registration requires a clean Git worktree and an exact starting
commit; the declared regression check must initially pass.

A registration is an existing `EvalTask` plus the following experiment data:

```json
{
  "attemptId": "ticket-123-attempt-1",
  "cwd": "/absolute/path/to/worktree",
  "runtime": "codex",
  "model": "your-configured-model",
  "family": "evaluation-input-validation",
  "condition": "explore",
  "criteria": ["The declared invalid inputs are rejected; existing valid inputs still work."],
  "verifierFiles": ["/absolute/path/to/acceptance.cjs"],
  "regressionCheck": {
    "command": "node /absolute/path/to/regression.cjs",
    "files": ["/absolute/path/to/regression.cjs"]
  },
  "task": {
    "task_id": "ticket-123",
    "split": "train",
    "repo_ref": {"kind": "git", "ref": "exact-starting-commit"},
    "prompt": "The exact task prompt passed to the coding host.",
    "allowed_tools": ["shell", "read", "edit"],
    "budget": {"max_turns": 30, "max_wall_time_seconds": 600, "max_tokens": 500000},
    "success_check": {"kind": "command", "command": "node /absolute/path/to/acceptance.cjs"},
    "expected_touched_paths": ["src/example.ts"],
    "tags": ["validation"]
  }
}
```

```sh
rtk proxy lyo task run --input registration.json --trace /absolute/path/to/host.jsonl
rtk proxy lyo task inspect --attempt-id ticket-123-attempt-1
rtk proxy lyo control status --db /absolute/path/to/central.sqlite
```

`task run` starts Codex or Claude with the registered model and prompt. The
existing `UserPromptSubmit` hook binds the task to its host session and delivers
one randomized action: no guidance or an acceptance reminder. Registered tasks
do not also train the older check-recovery experiment. A host `Stop` cannot
award task credit.

After the host exits, LYO runs the registered acceptance and regression commands,
checks the verifier fingerprints and source stability, reads usage from that
same host session, and retains a receipt in SQLite. It records the complete
supplied trace, verifier outputs, Git diff and untracked file contents. Review
those artifacts before sharing an exported database.

Acceptance is `true`, `false`, or `null`. Feedback is 1 only for acceptance
without regression within the declared token, wall-time and host-turn budgets;
known failures or budget overruns yield 0. Missing evidence remains unknown.
Codex input tokens already include cached input; Claude cache-read and
cache-creation tokens are added separately. A missing dollar price stays
unknown. Failed attempts still contribute their measured cost.

Manual host workflows can use `task register --input ...` before launch and
`task finish --attempt-id ... --trace ...` afterward. The initial prompt must
match the registration. An interrupted launch retains its artifacts and may
leave an unfinished attempt; inspect it and recover the evidence before freezing.
Finalized receipts are immutable; corrected-evidence supersession is separate work.

## Freeze and use evidence in later work

```sh
rtk proxy lyo task freeze --attempt-id ticket-123-attempt-1
```

Freeze only after every registered training attempt in the same state is
finished. The returned policy records its feedback cutoff, receipt references,
training task fingerprints, token cost and elapsed time. A later registration
uses `condition: "learned"`, that `policyId`, and a `selection` or `test` split.
Its family, model, budgets and tools must match the policy state. The directory
and repository name are not policy lookup keys. Renaming a training task and
changing its split cannot make it eligible as independent later evidence.

The later hook reads estimates from verified task feedback up to that cutoff.
If every action has evidence, it selects the highest measured mean; ties and
missing action coverage use the baseline. Evaluation outcomes do not train the
frozen policy. Inspect the later attempt to see the decision, estimates,
revision, delivery and eventual receipt together.

## Compare before making a benefit claim

Register baseline and learned attempts on matched, independent worktrees before
starting either host. Give each pair the same `pairId`, task, starting commit
and verifier, then register the fixed comparison:

```json
{
  "id": "validation-transfer-1",
  "policyId": "returned-policy-id",
  "pairs": [
    {"baselineAttemptId": "case-1-baseline", "learnedAttemptId": "case-1-learned"},
    {"baselineAttemptId": "case-2-baseline", "learnedAttemptId": "case-2-learned"}
  ],
  "maxTotalTokenRatio": 1
}
```

```sh
rtk proxy lyo task compare --input comparison.json
rtk proxy lyo task report --policy-id returned-policy-id --comparison-id validation-transfer-1
```

The report reuses the paired evaluation gate and retains its own snapshot and
receipt hashes. Unknown outcomes, missing costs, unfinished registered attempts,
or an absent preregistration prevent promotion. Training cost plus learned
evaluation cost must fit the declared ratio to baseline cost. Selection uses
selection-split tasks; test-split results remain descriptive and cannot tune
the policy. A small comparison can remain inconclusive even if every task passes.
The report does not automatically deploy a policy into unregistered daily work.

## Code and proof boundaries

- [Task launcher](../src/lyo/control/task-run.ts): register, launch, collect.
- [Task feedback](../src/lyo/control/task-feedback.ts): bind decisions, persist
  receipts, freeze policies and register comparisons.
- [Task evidence](../src/lyo/control/task-evidence.ts): task identity, verifier
  fingerprints, source artifacts, host usage and measured outcomes.
- [Native hook](../src/lyo/control/native-feedback.ts): deliver registered task
  decisions at the prompt boundary.
- [Task report](../src/lyo/eval/task-report.ts): compare measured outcomes and include
  the cost of learning using the [existing gate](../src/lyo/eval/report.ts).
- [Cycle tests](../tests/task-feedback.test.js) and
  [evidence tests](../tests/task-feedback-evidence.test.js): executable contract
  checks with fixtures. These are not evidence of coding-agent benefit.

The original task policy chooses between two supplied actions. It does not
discover failure causes or synthesize a new lesson. Task families and verifier
dependency files are declared by the experiment author; their quality still matters.

## Derive and test a specific intervention

On `feat/task-derived-interventions`, `task derive` connects a completed receipt
to the existing model client. It replays the original source and its retained
repair in a disposable worktree. The same frozen acceptance check must fail
before the repair and pass afterward; the regression check must pass in both.
The model receives those observations and the diff, then proposes a cause,
transferable advice, a prediction, a falsification condition, and an exact code
replacement that it claims caused the improvement.

```sh
rtk proxy lyo task derive --attempt-id completed-source-id --repo /path/to/repository \
  --model openai/gpt-4o-mini
rtk proxy lyo task analyses --attempt-id completed-source-id
rtk proxy lyo task intervention --intervention-id returned-id --output candidate.md
rtk proxy lyo task trial --intervention-id returned-id
```

The derive command uses OpenRouter and `OPENROUTER_API_KEY`. It sends the task
criteria, verifier outputs and source diff to the named model. Use it only for
evidence you authorize that provider to process. The existing lesson-library
format is available through `--output`; export does not install the candidate
into ordinary session guidance.

LYO removes the claimed change while preserving the rest of the recorded repair,
then restores it. It requires fail → pass → the **same failure** → pass, with
regression checks passing throughout. A model-created explanation or a different
failure cannot satisfy this check. Exact verifier-output matching is deliberately
conservative: nondeterministic output may leave a mechanism unsupported.
Dependency installation and the surrounding environment are reused, not fully
attested. This is a local intervention check, not proof of general causality.

The candidate retains its source receipt hash, model request and response,
all four verifier results, and measured reflection cost. Analysis failures are
retained; retrying the same source/model does not silently issue another request.
An enclosing Markdown JSON fence is accepted; the proposal schema remains strict.
After inspecting a failed analysis with a retained response, explicitly recheck it
with `task derive ... --reuse-analysis analysis-id`. The source/model and replayed
request must match. This makes no model call, preserves the failed record, and
charges the original inference once while including the new local replay time.
Malformed responses retain their raw content and measured usage. Trial costs
count the source task once plus every analysis of it, including failed attempts
and their elapsed time; pending analyses prevent freezing. Unknown reflection
costs remain unknown. No helpful or harmful lesson credit is
awarded merely because the repaired source passes.

`task trial` returns a policy with `kind: "candidate-trial"`. This explicitly
tests the proposed advice before any claim that it is a learned best action.
Use `--budget budget.json` to freeze a different evaluation budget with
`max_tokens`, `max_turns` and `max_wall_time_seconds`; both comparison arms must
use that exact budget. Source learning costs remain included. Token budgets are
checked from completed host receipts; they are not a provider-enforced token cap.
Both baseline and learned-condition registrations must reference that policy
with `policyId`, use later tasks, and match its family, model, budget and tools.
Register their comparison before launching either host. The baseline receives
no additional advice; the other arm receives the exact frozen intervention.
Decisions use `fixed-action@1`, with no invented training observations.

The existing task report then compares independently measured later outcomes
and includes source-task and reflection costs. `task intervention` exposes the
retained comparison verdicts alongside the candidate. Unknown or inconclusive
results remain visible; no automatic promotion follows. The
[first real derivation](../evidence/native-task-intervention-2026-09-10/assessment.md)
reproduced the claimed repair mechanism, including removal and restoration.
Its generated advice remains broad and has no later-task usefulness evidence.

Relevant code:

- [Derivation and local mechanism checks](../src/lyo/control/task-intervention.ts).
- [Trial registration and native delivery](../src/lyo/control/task-feedback.ts).
- [Explicit evaluation actions](../src/lyo/control/feedback-controller.ts).
- [Behavioral and CLI tests](../tests/task-intervention.test.js).
