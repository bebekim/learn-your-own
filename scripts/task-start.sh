#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/task-start.sh /path/to/manifest.yaml" >&2
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
  task.branch \
  task.beads_path \
  reporting.functional_axis \
  reporting.functional_axis.area \
  reporting.functional_axis.competence_band \
  scope.include \
  scope.exclude \
  model_routing.planned_model \
  model_routing.reasoning_effort \
  model_routing.expected_tokens \
  model_routing.maximum_tokens \
  model_routing.role \
  guardrails.required \
  guardrails.plan_path \
  guardrails.verifier_command \
  guardrails.approval_required \
  verification.spec_path \
  recording.goal.summary \
  recording.goal.success_criteria \
  recording.goal.stop_condition \
  recording.goal.expected_process \
  recording.goal.risk_class \
  recording.execution.task_shape \
  recording.execution.functional_axis \
  recording.execution.domain_axis \
  recording.execution.stack \
  recording.execution.tools_used \
  recording.execution.files_touched \
  recording.execution.commands_run \
  learning.record_agent_run)"

bead_id="$TASK_BEAD_ID"
workspace_scope="$TASK_WORKSPACE_SCOPE"
repo_path_raw="${TASK_REPO_PATH/#\~/$HOME}"
branch="$TASK_BRANCH"
beads_path="${TASK_BEADS_PATH/#\~/$HOME}"
functional_axis="${REPORTING_FUNCTIONAL_AXIS_AREA:-$REPORTING_FUNCTIONAL_AXIS}"
competence_band="$REPORTING_FUNCTIONAL_AXIS_COMPETENCE_BAND"
scope_include="$SCOPE_INCLUDE"
scope_exclude="$SCOPE_EXCLUDE"
planned_model="$MODEL_ROUTING_PLANNED_MODEL"
reasoning_effort="$MODEL_ROUTING_REASONING_EFFORT"
expected_tokens="${MODEL_ROUTING_EXPECTED_TOKENS:-0}"
maximum_tokens="${MODEL_ROUTING_MAXIMUM_TOKENS:-0}"
model_role="${MODEL_ROUTING_ROLE:-leader}"
guardrail_required="$GUARDRAILS_REQUIRED"
guardrail_plan_path="$GUARDRAILS_PLAN_PATH"
guardrail_verifier="$GUARDRAILS_VERIFIER_COMMAND"
approval_required="${GUARDRAILS_APPROVAL_REQUIRED:-false}"
spec_path="$VERIFICATION_SPEC_PATH"
recorded_goal="${RECORDING_GOAL_SUMMARY:-}"
success_criteria="$RECORDING_GOAL_SUCCESS_CRITERIA"
stop_condition="$RECORDING_GOAL_STOP_CONDITION"
expected_process="$RECORDING_GOAL_EXPECTED_PROCESS"
risk_class="$RECORDING_GOAL_RISK_CLASS"
recorded_task_shape="${RECORDING_EXECUTION_TASK_SHAPE:-$functional_axis}"
recorded_functional_axis="${RECORDING_EXECUTION_FUNCTIONAL_AXIS:-$functional_axis}"
domain_axis="$RECORDING_EXECUTION_DOMAIN_AXIS"
recorded_stack="$RECORDING_EXECUTION_STACK"
tools_used="$RECORDING_EXECUTION_TOOLS_USED"
files_touched="$RECORDING_EXECUTION_FILES_TOUCHED"
commands_run="$RECORDING_EXECUTION_COMMANDS_RUN"
record_agent_run="${LEARNING_RECORD_AGENT_RUN:-true}"

require_value "task.bead_id" "$bead_id"
require_value "task.workspace_scope" "$workspace_scope"
require_value "task.repo_path" "$repo_path_raw"
require_value "model_routing.planned_model" "$planned_model"
repo_path="$(cd "$repo_path_raw" && pwd)"
branch="${TASK_BRANCH:-$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || true)}"

if [ "$record_agent_run" = "false" ]; then
  echo "Manifest has learning.record_agent_run=false; no ledger run created."
  exit 0
fi

if ! git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a Git worktree: $repo_path" >&2
  exit 1
fi

workspace="$(find_workspace_for_repo "$repo_path" || true)"
if [ -z "$workspace" ]; then
  echo "No Dolt learning ledger found in $repo_path or its parents" >&2
  exit 1
fi
ledger_dir="$workspace/.agent-learning/ledger"
context_id="$(context_id_for "$workspace_scope" "$repo_path")"
repo_family="$(repo_family_for "$(basename "$repo_path")")"
current_commit="$(git -C "$repo_path" rev-parse HEAD 2>/dev/null || true)"
beads_workdir="$(beads_workdir_for "$workspace" "$repo_path" "$beads_path")"

if ! (cd "$beads_workdir" && bd show "$bead_id" --short >/dev/null); then
  echo "Bead not found from $beads_workdir: $bead_id" >&2
  exit 1
fi

path_in_csv_prefixes() {
  local path="$1"
  local prefixes="$2"
  local prefix
  [ -z "$prefixes" ] && return 1
  IFS=, read -r -a prefix_list <<< "$prefixes"
  for prefix in "${prefix_list[@]}"; do
    prefix="$(printf "%s" "$prefix" | sed 's/^ *//; s/ *$//')"
    [ -z "$prefix" ] && continue
    [ "$prefix" = "." ] && return 0
    case "$path" in
      "$prefix"|"$prefix"/*) return 0 ;;
    esac
  done
  return 1
}

dirty="$(git -C "$repo_path" status --porcelain)"
if [ -n "$dirty" ]; then
  out_of_scope=()
  while IFS= read -r line; do
    file_path="$(printf "%s" "$line" | sed 's/^...//; s/.* -> //')"
    if { [ -n "$scope_include" ] && ! path_in_csv_prefixes "$file_path" "$scope_include"; } ||
       { [ -n "$scope_exclude" ] && path_in_csv_prefixes "$file_path" "$scope_exclude"; }; then
      out_of_scope+=("$line")
    fi
  done <<< "$dirty"
  if [ "${#out_of_scope[@]}" -gt 0 ]; then
    echo "Warning: dirty files outside manifest scope:" >&2
    printf "%s\n" "${out_of_scope[@]}" >&2
  fi
fi

run_id="${workspace_scope}:${bead_id}:$(date -u +%Y%m%dT%H%M%SZ):$$"
recorded_goal="${recorded_goal:-Task $bead_id}"

cd "$ledger_dir"
dolt sql -q "replace into repo_contexts (context_id, workspace_scope, repo_family, repo_path, branch, current_commit, bead_id, spec_path, updated_at) values ('$(sql_escape "$context_id")', '$(sql_escape "$workspace_scope")', '$(sql_escape "$repo_family")', '$(sql_escape "$repo_path")', '$(sql_escape "$branch")', '$(sql_escape "$current_commit")', '$(sql_escape "$bead_id")', '$(sql_escape "$spec_path")', current_timestamp);"
dolt sql -q "insert into agent_runs (run_id, context_id, workspace_scope, repo_family, task_shape, circle_of_competence, expected_tokens, maximum_tokens, completed, trace_ref, started_at) values ('$(sql_escape "$run_id")', '$(sql_escape "$context_id")', '$(sql_escape "$workspace_scope")', '$(sql_escape "$repo_family")', '$(sql_escape "$functional_axis")', '$(sql_escape "$competence_band")', $expected_tokens, $maximum_tokens, false, '$(sql_escape "$manifest")', current_timestamp);"
dolt sql -q "replace into run_goals (run_id, goal, success_criteria, stop_condition, expected_process, risk_class) values ('$(sql_escape "$run_id")', '$(sql_escape "$recorded_goal")', '$(sql_escape "$success_criteria")', '$(sql_escape "$stop_condition")', '$(sql_escape "$expected_process")', '$(sql_escape "$risk_class")');"
dolt sql -q "replace into run_execution_contexts (run_id, task_shape, functional_axis, domain_axis, stack, tools_used, files_touched, commands_run, updated_at) values ('$(sql_escape "$run_id")', '$(sql_escape "$recorded_task_shape")', '$(sql_escape "$recorded_functional_axis")', '$(sql_escape "$domain_axis")', '$(sql_escape "$recorded_stack")', '$(sql_escape "$tools_used")', '$(sql_escape "$files_touched")', '$(sql_escape "$commands_run")', current_timestamp);"
dolt sql -q "replace into run_models (run_id, model, role, reasoning_effort, routing_fit, notes) values ('$(sql_escape "$run_id")', '$(sql_escape "$planned_model")', '$(sql_escape "$model_role")', '$(sql_escape "$reasoning_effort")', 'planned', 'planned at task start');"
dolt sql -q "replace into run_guardrails (run_id, plan_path, verifier_command, verifier_ok, risk_level, approval_required, approval_granted, missing_policy_coverage) values ('$(sql_escape "$run_id")', '$(sql_escape "$guardrail_plan_path")', '$(sql_escape "$guardrail_verifier")', null, '$(sql_escape "$guardrail_required")', $approval_required, false, null);"
commit_ledger_if_changed "Start agent run $run_id"

(cd "$beads_workdir" && bd update "$bead_id" --status in_progress --append-notes "Agent run started: $run_id")

echo "Started agent run:"
echo "  run_id: $run_id"
echo "  context_id: $context_id"
echo "  ledger: $ledger_dir"
echo "  beads: $beads_workdir"
