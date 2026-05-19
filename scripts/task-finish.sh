#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/task-finish.sh /path/to/manifest.yaml" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/task-manifest.sh
source "$script_dir/lib/task-manifest.sh"

manifest="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
eval "$(manifest_values "$manifest" \
  task.bead_id \
  task.workspace_scope \
  task.repo_path \
  task.beads_path \
  learning.run_id \
  completion.actual_tokens \
  completion.outcome \
  completion.completed \
  completion.primary_error_source \
  completion.reusable_lesson \
  completion.missing_ingredients \
  completion.close_bead \
  model_routing.routing_fit \
  guardrails.verifier_ok \
  guardrails.approval_granted \
  guardrails.blocked_findings \
  guardrails.missing_policy_coverage \
  recording.model_actuals.models_used \
  recording.model_actuals.provider \
  recording.model_actuals.local_or_remote \
  recording.model_actuals.estimated_cost \
  recording.model_actuals.latency_ms \
  recording.model_actuals.escalated_from \
  recording.model_actuals.escalated_to \
  recording.model_actuals.routing_reason \
  recording.outcome.tests_run \
  recording.outcome.checks_run \
  recording.outcome.verification_passed \
  recording.outcome.human_corrections \
  recording.trace.important_events \
  recording.trace.state_transitions \
  review.review_type \
  review.reviewer \
  review.verdict \
  review.defects \
  review.business_outcome \
  review.functional_outcome)"

bead_id="$TASK_BEAD_ID"
workspace_scope="$TASK_WORKSPACE_SCOPE"
repo_path_raw="${TASK_REPO_PATH/#\~/$HOME}"
beads_path="${TASK_BEADS_PATH/#\~/$HOME}"
run_id="$LEARNING_RUN_ID"
actual_tokens="${COMPLETION_ACTUAL_TOKENS:-0}"
outcome="${COMPLETION_OUTCOME:-completed}"
completed="${COMPLETION_COMPLETED:-true}"
primary_error_source="$COMPLETION_PRIMARY_ERROR_SOURCE"
reusable_lesson="$COMPLETION_REUSABLE_LESSON"
missing_ingredients="$COMPLETION_MISSING_INGREDIENTS"
close_bead="${COMPLETION_CLOSE_BEAD:-true}"
routing_fit="${MODEL_ROUTING_ROUTING_FIT:-fit}"
verifier_ok="${GUARDRAILS_VERIFIER_OK:-true}"
approval_granted="${GUARDRAILS_APPROVAL_GRANTED:-false}"
blocked_findings="$GUARDRAILS_BLOCKED_FINDINGS"
missing_policy_coverage="$GUARDRAILS_MISSING_POLICY_COVERAGE"
models_used="$RECORDING_MODEL_ACTUALS_MODELS_USED"
model_provider="$RECORDING_MODEL_ACTUALS_PROVIDER"
local_or_remote="$RECORDING_MODEL_ACTUALS_LOCAL_OR_REMOTE"
estimated_cost="${RECORDING_MODEL_ACTUALS_ESTIMATED_COST:-0}"
latency_ms="${RECORDING_MODEL_ACTUALS_LATENCY_MS:-0}"
escalated_from="$RECORDING_MODEL_ACTUALS_ESCALATED_FROM"
escalated_to="$RECORDING_MODEL_ACTUALS_ESCALATED_TO"
routing_reason="$RECORDING_MODEL_ACTUALS_ROUTING_REASON"
tests_run="$RECORDING_OUTCOME_TESTS_RUN"
checks_run="$RECORDING_OUTCOME_CHECKS_RUN"
verification_passed="${RECORDING_OUTCOME_VERIFICATION_PASSED:-}"
human_corrections="$RECORDING_OUTCOME_HUMAN_CORRECTIONS"
important_events="$RECORDING_TRACE_IMPORTANT_EVENTS"
state_transitions="$RECORDING_TRACE_STATE_TRANSITIONS"
review_type="${REVIEW_REVIEW_TYPE:-completion}"
reviewer="${REVIEW_REVIEWER:-agent}"
verdict="$REVIEW_VERDICT"
defects="$REVIEW_DEFECTS"
business_outcome="$REVIEW_BUSINESS_OUTCOME"
functional_outcome="$REVIEW_FUNCTIONAL_OUTCOME"

require_value "task.bead_id" "$bead_id"
require_value "task.workspace_scope" "$workspace_scope"
require_value "task.repo_path" "$repo_path_raw"
repo_path="$(cd "$repo_path_raw" && pwd)"

workspace="$(find_workspace_for_repo "$repo_path" || true)"
if [ -z "$workspace" ]; then
  echo "No Dolt learning ledger found in $repo_path or its parents" >&2
  exit 1
fi
ledger_dir="$workspace/.agent-learning/ledger"
context_id="$(context_id_for "$workspace_scope" "$repo_path")"
beads_workdir="$(beads_workdir_for "$workspace" "$repo_path" "$beads_path")"

cd "$ledger_dir"
if [ -z "$run_id" ]; then
  run_id="$(dolt sql -r csv -q "select run_id from agent_runs where context_id = '$(sql_escape "$context_id")' and completed = false order by started_at desc limit 1;" | csv_first_data_value)"
fi

require_value "learning.run_id or open run for context" "$run_id"

expected_tokens="$(dolt sql -r csv -q "select coalesce(expected_tokens, 0) from agent_runs where run_id = '$(sql_escape "$run_id")';" | csv_first_data_value)"
estimate_error="null"
if [ "$actual_tokens" -gt 0 ] 2>/dev/null && [ "${expected_tokens:-0}" -gt 0 ] 2>/dev/null; then
  estimate_error="$(python3 - "$actual_tokens" "$expected_tokens" <<'PY'
import sys
print(float(sys.argv[1]) / float(sys.argv[2]))
PY
)"
fi

dolt sql -q "update agent_runs set actual_tokens = $actual_tokens, completed = $completed, outcome = '$(sql_escape "$outcome")', estimate_error = $estimate_error, primary_error_source = '$(sql_escape "$primary_error_source")', reusable_lesson = '$(sql_escape "$reusable_lesson")', completed_at = current_timestamp where run_id = '$(sql_escape "$run_id")';"
dolt sql -q "update run_models set routing_fit = '$(sql_escape "$routing_fit")' where run_id = '$(sql_escape "$run_id")';"
dolt sql -q "update run_guardrails set verifier_ok = $verifier_ok, approval_granted = $approval_granted, blocked_findings = '$(sql_escape "$blocked_findings")', missing_policy_coverage = '$(sql_escape "$missing_policy_coverage")' where run_id = '$(sql_escape "$run_id")';"
dolt sql -q "replace into run_verification_results (run_id, tests_run, checks_run, verification_passed, review_verdict, defects, human_corrections, missing_ingredients, guardrail_result, updated_at) values ('$(sql_escape "$run_id")', '$(sql_escape "$tests_run")', '$(sql_escape "$checks_run")', $(sql_bool_or_null "$verification_passed"), '$(sql_escape "$verdict")', '$(sql_escape "$defects")', '$(sql_escape "$human_corrections")', '$(sql_escape "$missing_ingredients")', '$(sql_escape "$blocked_findings")', current_timestamp);"

if [ -n "$models_used" ]; then
  IFS=, read -r -a model_rows <<< "$models_used"
  model_index=0
  for model_row in "${model_rows[@]}"; do
    model_row="$(printf "%s" "$model_row" | sed 's/^ *//; s/ *$//')"
    [ -z "$model_row" ] && continue
    IFS=: read -r used_model used_role used_effort input_tokens output_tokens total_tokens <<< "$model_row"
    [ -z "${used_model:-}" ] && continue
    usage_id="${run_id}:model:${model_index}"
    dolt sql -q "replace into run_model_usage (usage_id, run_id, model, provider, role, reasoning_effort, local_or_remote, input_tokens, output_tokens, total_tokens, estimated_cost, latency_ms, escalated_from, escalated_to, routing_reason, routing_fit) values ('$(sql_escape "$usage_id")', '$(sql_escape "$run_id")', '$(sql_escape "$used_model")', '$(sql_escape "$model_provider")', '$(sql_escape "${used_role:-}")', '$(sql_escape "${used_effort:-}")', '$(sql_escape "$local_or_remote")', $(sql_int_or_null "${input_tokens:-}"), $(sql_int_or_null "${output_tokens:-}"), $(sql_int_or_null "${total_tokens:-}"), $(sql_float_or_null "$estimated_cost"), $(sql_int_or_null "$latency_ms"), '$(sql_escape "$escalated_from")', '$(sql_escape "$escalated_to")', '$(sql_escape "$routing_reason")', '$(sql_escape "$routing_fit")');"
    model_index=$((model_index + 1))
  done
fi

event_index=0
if [ -n "$important_events" ]; then
  IFS=, read -r -a event_rows <<< "$important_events"
  for event_row in "${event_rows[@]}"; do
    event_row="$(printf "%s" "$event_row" | sed 's/^ *//; s/ *$//')"
    [ -z "$event_row" ] && continue
    event_id="${run_id}:event:${event_index}"
    dolt sql -q "replace into run_trace_events (event_id, run_id, event_index, event_type, summary) values ('$(sql_escape "$event_id")', '$(sql_escape "$run_id")', $event_index, 'important_event', '$(sql_escape "$event_row")');"
    event_index=$((event_index + 1))
  done
fi

if [ -n "$state_transitions" ]; then
  IFS=, read -r -a transition_rows <<< "$state_transitions"
  for transition_row in "${transition_rows[@]}"; do
    transition_row="$(printf "%s" "$transition_row" | sed 's/^ *//; s/ *$//')"
    [ -z "$transition_row" ] && continue
    event_id="${run_id}:event:${event_index}"
    dolt sql -q "replace into run_trace_events (event_id, run_id, event_index, event_type, summary) values ('$(sql_escape "$event_id")', '$(sql_escape "$run_id")', $event_index, 'state_transition', '$(sql_escape "$transition_row")');"
    event_index=$((event_index + 1))
  done
fi

if [ -n "$verdict" ] || [ -n "$defects" ] || [ -n "$business_outcome" ] || [ -n "$functional_outcome" ]; then
  review_id="${run_id}:review:${review_type}"
  dolt sql -q "replace into run_reviews (review_id, run_id, review_type, reviewer, verdict, defects, business_outcome, functional_outcome) values ('$(sql_escape "$review_id")', '$(sql_escape "$run_id")', '$(sql_escape "$review_type")', '$(sql_escape "$reviewer")', '$(sql_escape "$verdict")', '$(sql_escape "$defects")', '$(sql_escape "$business_outcome")', '$(sql_escape "$functional_outcome")');"
fi

if [ -n "$missing_ingredients" ]; then
  IFS=, read -r -a ingredients <<< "$missing_ingredients"
  for ingredient in "${ingredients[@]}"; do
    ingredient="$(printf "%s" "$ingredient" | sed 's/^ *//; s/ *$//')"
    [ -z "$ingredient" ] && continue
    dolt sql -q "replace into run_missing_ingredients (run_id, ingredient, source, impact) values ('$(sql_escape "$run_id")', '$(sql_escape "$ingredient")', 'manifest', 'recorded at task finish');"
  done
fi

commit_ledger_if_changed "Finish agent run $run_id"

if [ "$completed" = "true" ] && [ "$close_bead" = "true" ] && [ "$outcome" != "failed" ]; then
  (cd "$beads_workdir" && bd close "$bead_id" --reason "Agent run completed: $run_id")
else
  (cd "$beads_workdir" && bd update "$bead_id" --append-notes "Agent run finished without closing bead: $run_id ($outcome)")
fi

echo "Finished agent run:"
echo "  run_id: $run_id"
echo "  outcome: $outcome"
echo "  estimate_error: $estimate_error"
