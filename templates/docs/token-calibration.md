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
  actual_tokens:
  accepted_state_transitions:
  completed: true | false
  reviewer:
  outcome: accepted | needs-fix | blocked | abandoned
  estimate_error:
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
- Did the task need a smaller token block, a larger one, or a forced stop?
- Should this update `AGENTS.md`, preflight, a spec template, a test, or a
  review lens?

## Task Shape Hints

Use historical outcomes to refine estimates by task shape:

| Task Shape | Typical Token Driver |
| --- | --- |
| Read-only explanation | Context discovery and synthesis |
| Small code edit | File discovery, local patch, targeted verification |
| Data pipeline change | Domain semantics, fixtures, integration checks |
| Production-impacting change | Guardrails, approvals, rollback planning |
| Cross-repo workflow update | Drift checks, portability checks, template sync |
| Debugging | Reproduction quality and hypothesis churn |
| Architecture change | Stakeholder alignment and second-order effects |

## Learning Rule

After every meaningful task, decide whether the estimate error was caused by:

- bad initial scope
- weak acceptance criteria
- missing domain owner
- missing fixture or environment
- unknown tool behavior
- agent loop or local maximum
- underdeveloped circle of competence

If the cause is reusable, broadcast it into the workflow. If it is local, record
it on the task.
