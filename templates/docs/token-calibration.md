# Token Calibration

Token estimates are forecasts. Track them so judgment improves over time.

The goal is not to spend fewer tokens at all costs. The goal is to learn which
task shapes consume tokens, where estimates are reliable, and when a task is
outside the current circle of competence.

## Estimate Before Work

Record this before implementation starts:

```yaml
token_block:
  expected_tokens:
  maximum_tokens:
  confidence: low | medium | high
  circle_of_competence: inside | edge | outside
  task_shape:
  planned_model:
  planned_reasoning_effort:
  routing_reason:
  known_ingredients:
  missing_ingredients:
  stakeholders:
  expected_state_transition:
  evidence_required:
  stop_condition:
```

Use `circle_of_competence` as an estimate-quality signal:

- `inside`: the repo, domain, tools, test shape, and acceptance owner are known.
- `edge`: one or two major ingredients are uncertain.
- `outside`: domain ownership, tool behavior, data semantics, or acceptance
  criteria are materially unknown.

## Measure After Work

Record this after completion, abandonment, or handoff:

```yaml
token_actuals:
  models_used:
    - model:
      role:
      reasoning_effort:
      input_tokens:
      output_tokens:
      total_tokens:
  actual_tokens:
  accepted_state_transitions:
  completed: true | false
  reviewer:
  outcome: accepted | needs-fix | blocked | abandoned
  estimate_error:
  model_routing_fit: good | overpowered | underpowered | mismatched | unknown
  primary_error_source:
  reusable_lesson:
```

Use this rough formula:

```text
estimate_error = actual_tokens / expected_tokens
progress_density = accepted_state_transitions / actual_tokens
```

Interpretation:

- `estimate_error < 0.5`: likely overestimated, or task was simpler than
  believed.
- `0.5 <= estimate_error <= 2.0`: estimate was usable.
- `estimate_error > 2.0`: task shape was misunderstood or missing ingredients
  were undercounted.
- `completed=false` with high token use: likely outside competence, blocked, or
  trapped in a local maximum.

## Calibration Questions

Ask these during review:

- Was this task inside, near, or outside our circle of competence?
- Which ingredient dominated token use: context search, design ambiguity,
  implementation, verification, domain review, or tool failure?
- Which stakeholder or acceptance owner should have been named earlier?
- Was the selected model appropriate for the task shape and competence level?
- Did a cheaper/faster model handle discovery well enough before escalating?
- Did a stronger model reduce loops, review defects, or total token use?
- Did the task need a smaller token block, a larger one, or a forced stop?
- Should this update `AGENTS.md`, preflight, a spec template, a test, or a
  review lens?

## Model Routing

Track model selection as part of the run, not as background detail.

Model choice should be judged by outcome quality and total system cost, not by
raw model size. A stronger model may be cheaper overall when it avoids loops,
bad patches, failed tool calls, or repeated review cycles.

Recommended routing questions:

- What model was planned and why?
- Which models actually ran?
- Which role did each model serve: leader, explorer, implementer, reviewer,
  judge, or summarizer?
- Did the model choice match the task shape?
- Did the model choice match the circle of competence?
- Did the run need escalation to a stronger model?
- Did the run use a strong model for work a smaller model could do?

Useful outcomes:

- `good`: model choice fit the task and evidence quality.
- `overpowered`: a stronger or more expensive model was used where a smaller
  model likely would have worked.
- `underpowered`: model choice caused loops, missed defects, weak reasoning, or
  poor tool use.
- `mismatched`: model was strong enough but wrong for the role or task shape.
- `unknown`: insufficient evidence to judge.

## Task Shape Hints

Use historical outcomes to refine estimates by task shape:

| Task Shape | Typical Token Driver | Routing Hint |
| --- | --- | --- |
| Read-only explanation | Context discovery and synthesis | Start with fast exploration; escalate for synthesis if ambiguity remains. |
| Small code edit | File discovery, local patch, targeted verification | Use standard implementer plus targeted checks. |
| Data pipeline change | Domain semantics, fixtures, integration checks | Use stronger reasoning when data meaning or production risk is unclear. |
| Production-impacting change | Guardrails, approvals, rollback planning | Use strong planner/reviewer; require human authority. |
| Cross-repo workflow update | Drift checks, portability checks, template sync | Use fast scan plus strong reviewer for portability/risk. |
| Debugging | Reproduction quality and hypothesis churn | Escalate when hypotheses repeat without new evidence. |
| Architecture change | Stakeholder alignment and second-order effects | Use strong architect/reviewer early. |

## Learning Rule

After every meaningful task, decide whether the estimate error was caused by:

- bad initial scope
- weak acceptance criteria
- missing domain owner
- missing fixture or environment
- unknown tool behavior
- agent loop or local maximum
- underdeveloped circle of competence
- mismatched model routing

If the cause is reusable, broadcast it into the workflow. If it is local, record
it on the task.
