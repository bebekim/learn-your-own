#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/agent-learning-report.sh /path/to/workspace" >&2
  exit 1
fi

workspace="$(cd "$1" && pwd)"
ledger_dir="$workspace/.agent-learning/ledger"

if [ ! -d "$ledger_dir/.dolt" ]; then
  echo "No Dolt learning ledger found at $ledger_dir" >&2
  exit 1
fi

cd "$ledger_dir"

echo "# Agent Learning Report"
echo
echo "Workspace: $workspace"
echo

echo "## Workspace Profiles"
dolt sql -q "select workspace_scope, workspace_path, dominant_stacks, guardrail_packs from workspace_profiles order by workspace_scope;"
echo

echo "## Estimate Error By Task Shape"
dolt sql -q "select task_shape, circle_of_competence, count(*) as runs, avg(estimate_error) as avg_estimate_error, avg(progress_density) as avg_progress_density from agent_runs where expected_tokens is not null and actual_tokens is not null group by task_shape, circle_of_competence order by avg_estimate_error desc;"
echo

echo "## Model Routing Fit"
dolt sql -q "select model, role, routing_fit, count(*) as uses, avg(total_tokens) as avg_total_tokens from run_models group by model, role, routing_fit order by uses desc;"
echo

echo "## Missing Ingredients"
dolt sql -q "select ingredient, count(*) as occurrences from run_missing_ingredients group by ingredient order by occurrences desc;"
echo

echo "## Functional Broadcasts"
dolt sql -q "select workspace_scope, target_layer, target_artifact, count(*) as broadcasts from functional_broadcasts group by workspace_scope, target_layer, target_artifact order by broadcasts desc;"
