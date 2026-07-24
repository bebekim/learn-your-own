# Learned Reducer Rules And Eval Rubric

## Purpose

Lyo needs one self-modification surface before it needs arbitrary reducer
rewrites.

The first surface is learned reducer rules:

```text
agent behavior -> ledger data -> proposed rule -> interpreted behavior
-> future agent trace -> grounded outcome -> rule credit/debit
```

This is the "data -> code, code -> data" loop, but with a fixed kernel
interpreting mutable rules instead of agents editing TypeScript reducers.

The second requirement is measurement. Skill optimization systems such as
SkillOpt treat a skill document as trainable state and validate updates against
held-out scores. Lyo needs the same discipline, but the trainable state is a
rule ledger and reducer behavior, not only a prompt document.

## Current Claim

Lyo should prove improvement over:

```text
vanilla model
static hand-written skill
optimized skill document
Lyo observe-only ledger
Lyo learned reducer rules
Lyo learned reducer rules + skill document
```

The comparison must freeze model, task budget, harness, and evaluator. Otherwise
"better" just means someone spent more tokens, picked an easier task split, or
leaked the answer into context.

## Literature-Derived Eval Discipline

Do not start from "what can Lyo measure?" Start from "what claim is Lyo making?"
Then pick the smallest evaluation that could falsify that claim.

The current Lyo claim is:

```text
grounded learned rules improve future agent episodes without uncontrolled
context cost, hidden regressions, or unverifiable self-approval
```

The useful patterns from existing LLM eval work:

| Pattern | What to copy | What to avoid |
| --- | --- | --- |
| HELM-style scenario eval | Declare scenarios, metrics, model, prompts, budget, and raw outputs | One headline score that hides cost or robustness |
| SWE-bench-style coding eval | Prefer real repo tasks with executable tests | Toy tasks where success is subjective |
| AgentBench/GAIA-style agent eval | Score tool-using episodes by final environment outcome and trace | Judging only the final prose answer |
| Arena/preference eval | Use pairwise comparisons when quality is subjective | Treating preference as proof of correctness |
| LLM-as-judge eval | Use judges only for secondary soft scores, with bias controls | Letting a judge replace executable evidence |
| Memory/RAG eval | Separate retrieval/memory hit quality from downstream task success | Claiming memory works because it retrieved something plausible |
| SkillOpt-style optimization eval | Use train/selection/test, validation gates, and ablations | Updating the learned artifact on the final test split |

Implications for Lyo:

```text
1. Freeze the executor model, harness, prompts, budget, and tools.
2. Keep train, selection, and final test separate.
3. Use executable or externally checkable outcomes whenever possible.
4. Report cost, context overhead, and regressions beside success.
5. Run ablations so the lift is attributable to learned rules, not more context.
6. Keep raw traces and ledger deltas so every accepted rule has provenance.
```

Useful references:

```text
HELM: https://github.com/stanford-crfm/helm
SWE-bench: https://www.swebench.com/
AgentBench: https://github.com/THUDM/AgentBench
GAIA: https://huggingface.co/datasets/gaia-benchmark/GAIA
Chatbot Arena: https://lmarena.ai/
LongMemEval: https://github.com/xiaowu0162/LongMemEval
LoCoMo: https://snap-research.github.io/locomo/
SkillOpt: /Users/marcus.kim/repositories/oss/SkillOpt
```

## Related Baseline: SkillOpt

SkillOpt's relevant pattern:

```text
rollout -> reflect -> aggregate -> select -> update skill doc -> validation gate
```

The deployed artifact is a compact `best_skill.md`; candidate edits are accepted
only when they improve a selection/validation score. Its config separates hard,
soft, and mixed gate metrics, then reports final held-out test scores.

Lyo should copy the evaluation discipline, not the exact artifact:

```text
SkillOpt trainable state: natural-language skill document
Lyo trainable state: grounded reducer rules + lesson selection state
```

## Architecture

Keep the kernel fixed:

```text
hook capture
normalization
trace/effect compiler
rule interpreter
application logger
outcome reducer
promotion/quarantine gate
```

Make the learned program mutable:

```text
learned_rule
learned_rule_delta
learned_rule_application
```

Do not let the first version edit reducer source code. A bad TypeScript edit can
break the learner. A bad rule can be quarantined.

## Schema Sketch

```text
learned_rule
  rule_id TEXT PRIMARY KEY
  kind TEXT NOT NULL
  scope_kind TEXT NOT NULL
  scope_value TEXT NOT NULL
  condition_json TEXT NOT NULL
  action_json TEXT NOT NULL
  status TEXT NOT NULL       -- candidate | active | quarantined | retired
  helpful_count INTEGER NOT NULL DEFAULT 0
  harmful_count INTEGER NOT NULL DEFAULT 0
  created_from_ref TEXT
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

```text
learned_rule_delta
  delta_id INTEGER PRIMARY KEY AUTOINCREMENT
  rule_id TEXT NOT NULL
  run_id TEXT
  actor TEXT NOT NULL        -- proposer | evaluator | curator | user
  delta_type TEXT NOT NULL   -- CREATE | EDIT | MARK_HELPFUL | MARK_HARMFUL
                             -- ACTIVATE | QUARANTINE | RETIRE
  payload_json TEXT NOT NULL
  created_at TEXT NOT NULL
```

```text
learned_rule_application
  application_id TEXT PRIMARY KEY
  rule_id TEXT NOT NULL
  run_id TEXT NOT NULL
  trigger_ref TEXT
  emitted_fact_json TEXT NOT NULL
  outcome TEXT               -- pending | helpful | harmful | neutral
  counted INTEGER NOT NULL DEFAULT 0
  created_at TEXT NOT NULL
  updated_at TEXT NOT NULL
```

## First Rule Kind

Only ship one rule kind first:

```text
verifier_for_path
```

Example:

```json
{
  "kind": "verifier_for_path",
  "scope": {
    "kind": "repository",
    "value": "/repo"
  },
  "condition": {
    "path_glob": "src/billing/**"
  },
  "action": {
    "command": "uv run pytest tests/test_billing.py",
    "require_before_done": true
  }
}
```

Interpreter behavior:

```text
if current run touched src/billing/**
then emit verifier recommendation/gate:
  uv run pytest tests/test_billing.py
```

The emitted gate must be logged as an application. If the run later executes the
verifier and gets useful evidence, the rule earns credit. If it blocks unrelated
work or pushes a wrong verifier, it loses credit.

## Rule Lifecycle

```text
candidate
  proposed from repeated trace patterns or explicit user preference

active
  selected after enough grounded positive evidence

quarantined
  hidden from future injection after grounded negative evidence

retired
  intentionally removed from active consideration
```

Use the same posture as lessons:

```text
provisional until grounded
auditable deltas
replayable state
no silent overwrite
```

## Proposal Sources

Allowed first sources:

```text
observed path -> verifier co-activation
run tape pairs: chosen run verified, rejected run unverified
explicit user preference pair
manual seed rule
```

Defer:

```text
arbitrary rule synthesis from free-form chat
arbitrary TypeScript reducer patches
generic Lisp interpreter
multi-rule planner
```

## Evaluation Unit

The eval unit is an agent episode with:

```text
task_id
repo fixture or live repo snapshot
prompt/task
allowed tools
target model
harness
budget
ground-truth verifier or judge
success criteria
```

Every episode must produce:

```text
trace
diff or final answer
verifier evidence
token usage
wall time
rule/skill/context injected
outcome
```

## Dataset Splits

Use three splits:

```text
train
  traces/tasks the learner may mine

selection
  held-out tasks used to accept/reject proposed rules

test
  final held-out tasks never seen by proposer or gate
```

Prefer time-based or repo-based splits for local agent work. Random splits are
too easy to leak repeated file/test names into both train and test.

## Baselines

| ID | Condition | Purpose |
| --- | --- | --- |
| B0 | Vanilla model, no skill, no Lyo injection | Measures raw model+harness ability |
| B1 | Static hand-written skill/instructions | Measures ordinary skill authoring |
| B2 | SkillOpt-style optimized skill | Measures text-skill optimization |
| B3 | Lyo observe-only | Ensures recording itself does not change behavior |
| B4 | Lyo learned reducer rules | Measures reducer-rule adaptation |
| B5 | Lyo rules + static/optimized skill | Measures complementarity |

All baselines use the same model, harness, tool permissions, and budget.

## Metrics

Primary:

```text
verified_success_rate
  fraction of episodes satisfying success criteria with required verifier evidence
```

Secondary:

```text
task_score
  benchmark-native score, exact when available

verifier_compliance_rate
  final edit followed by required verifier pass

false_gate_rate
  rule fired but verifier was irrelevant or blocked correct work

regression_rate
  previously passing check broken or success criteria worsened

token_cost
  input + output tokens, including injected skill/rule text

wall_time
  elapsed time per episode

tool_call_count
  commands, edits, external calls

context_overhead_tokens
  extra prompt tokens caused by skill/rule/lesson injection

sample_efficiency
  episodes needed before improvement appears on selection/test

transfer_lift
  improvement on repos/task families not used for training

auditability
  fraction of injected guidance linked to rule_id, evidence refs, and outcomes
```

Do not hide cost. A system that wins by dumping 20k extra context tokens is not
the same as a system that wins with a 200-token grounded rule.

## Hard And Soft Scores

Hard score:

```text
1 if success criteria pass and required verifier evidence exists
0 otherwise
```

Soft score:

```text
partial credit from benchmark rubric, verifier progress, or judge score
```

Mixed gate score:

```text
mixed = hard_weight * hard + soft_weight * soft - cost_penalty - safety_penalty
```

For first implementation, report hard and soft separately. Use mixed only for
gate experiments; do not make the headline depend on a tunable formula.

## Rule Gate

A candidate rule can become active only if:

```text
selection hard score improves
or selection hard score is unchanged and cost/safety improves
```

It must be rejected or quarantined if:

```text
false_gate_rate increases beyond threshold
regression_rate increases beyond threshold
rule applications cannot be tied to evidence
```

Default posture:

```text
gate on
strict promotion
cheap rollback
held-out test untouched
```

## Reporting

Every eval report should include:

```text
model
harness
budget
task split hashes
baseline scores
treatment scores
absolute lift
relative lift
confidence interval or bootstrap interval
token/cost delta
wall-time delta
rule count
rule application count
accepted/rejected/quarantined rules
worst regressions
```

Minimum credible claim:

```text
Lyo learned reducer rules improve verified_success_rate on held-out test
against B0 and B1, without a worse false_gate_rate or uncontrolled cost.
```

Stronger claim:

```text
Lyo matches or beats B2 SkillOpt-style optimized skills on recurring
tool-use tasks, or combines with B2 for additive lift.
```

## Pilot Benchmark

Start with local coding episodes because they have real verifiers:

```text
task: edit known fixture/repo state
success: targeted test/typecheck/lint passes
failure: final claim without verifier, failing verifier, wrong diff
```

Pilot scale:

```text
20 train episodes
20 selection episodes
40 test episodes
same target model
same wall/token budget
paired task order randomized per condition
```

Serious scale:

```text
3+ repos
3+ task families
3 seeds or repeated runs
at least one cheap model and one frontier model
all raw traces and eval summaries committed or archived
```

## First Implementation Slice

Build only:

```text
learned_rule schema
verifier_for_path interpreter
application logging
outcome counter update
promotion/quarantine gate
eval report comparing B0/B1/B3/B4
```

Do not build:

```text
generic rule language
new agent planner
source-code self-editing
dashboard
cloud sync
```

The first proof is not that Lyo is generally intelligent. The first proof is
that a grounded rule ledger can make future agent work measurably more verified,
with lower context waste and better auditability than ordinary static skills.
