# Manifest Fields

Use `.agent-learning/task-manifest.yaml`.

Fill `recording.goal` before or at task start:

- `summary`
- `success_criteria`
- `stop_condition`
- `expected_process`
- `risk_class`

Fill `recording.execution` as the run becomes concrete:

- `task_shape`
- `functional_axis`
- `domain_axis`
- `stack`
- `tools_used`
- `files_touched`
- `commands_run`

Fill `recording.model_actuals`, `recording.outcome`, and `recording.trace`
before `scripts/task-finish.sh`.

For `recording.model_actuals.models_used`, use:

```text
model:role:reasoning_effort:input_tokens:output_tokens:total_tokens
```
