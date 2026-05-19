#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# shellcheck source=../scripts/lib/task-manifest.sh
source "$repo_root/scripts/lib/task-manifest.sh"

schema="$repo_root/templates/.agent-learning/schema.sql"
scaffold_manifest="$repo_root/templates/scaffold/task-manifest.yaml.j2"
install_manifest="$repo_root/templates/.agent-learning/task-manifest.yaml"

for table in \
  run_goals \
  run_execution_contexts \
  run_model_usage \
  run_verification_results \
  run_trace_events
do
  if ! grep -q "create table if not exists $table" "$schema"; then
    echo "Missing recording table: $table" >&2
    exit 1
  fi
done

for table in \
  functional_broadcasts \
  broadcast_deliveries \
  broadcast_effect_evaluations
do
  if ! grep -q "create table if not exists $table" "$schema"; then
    echo "Missing broadcast learning table: $table" >&2
    exit 1
  fi
done

for manifest in "$scaffold_manifest" "$install_manifest"; do
  for field in \
    "recording:" \
    "goal:" \
    "success_criteria:" \
    "stop_condition:" \
    "expected_process:" \
    "risk_class:" \
    "domain_axis:" \
    "tools_used:" \
    "models_used:" \
    "important_events:" \
    "state_transitions:"
  do
    if ! grep -q "$field" "$manifest"; then
      echo "Missing manifest recording field in $manifest: $field" >&2
      exit 1
    fi
  done
done

sample="$tmp/task-manifest.yaml"
cat >"$sample" <<'YAML'
recording:
  goal:
    summary: "Extract calendar event fields from image reliably."
    success_criteria: "Required fields validate."
    stop_condition: "Fixture replay passes."
    expected_process: "Run extraction, validate schema, replay fixtures."
    risk_class: "local"
  execution:
    task_shape: "extraction"
    functional_axis: "vision_extraction"
    domain_axis: "calendar"
    stack:
      - "python"
      - "vision"
    tools_used:
      - "pytest"
    files_touched:
      - "src/extract.py"
    commands_run:
      - "pytest tests/extraction"
  model_actuals:
    models_used:
      - "local-llm:extractor:low:100:50:150"
  outcome:
    tests_run: "pytest tests/extraction"
    checks_run: "schema validation"
    verification_passed: true
    human_corrections: ""
  trace:
    important_events:
      - "Read spec"
      - "Ran fixture replay"
    state_transitions:
      - "unstarted->verified: fixture replay passed"
YAML

eval "$(manifest_values "$sample" \
  recording.goal.summary \
  recording.goal.success_criteria \
  recording.execution.stack \
  recording.execution.tools_used \
  recording.execution.commands_run \
  recording.model_actuals.models_used \
  recording.trace.important_events \
  recording.trace.state_transitions)"

[ "$RECORDING_GOAL_SUMMARY" = "Extract calendar event fields from image reliably." ]
[ "$RECORDING_GOAL_SUCCESS_CRITERIA" = "Required fields validate." ]
[ "$RECORDING_EXECUTION_STACK" = "python,vision" ]
[ "$RECORDING_EXECUTION_TOOLS_USED" = "pytest" ]
[ "$RECORDING_EXECUTION_COMMANDS_RUN" = "pytest tests/extraction" ]
[ "$RECORDING_MODEL_ACTUALS_MODELS_USED" = "local-llm:extractor:low:100:50:150" ]
[ "$RECORDING_TRACE_IMPORTANT_EVENTS" = "Read spec,Ran fixture replay" ]
[ "$RECORDING_TRACE_STATE_TRANSITIONS" = "unstarted->verified: fixture replay passed" ]
