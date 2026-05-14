#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ] || [ "$#" -gt 2 ]; then
  echo "Usage: scripts/learning-review.sh /path/to/workspace [--record]" >&2
  exit 1
fi

workspace="$(cd "$1" && pwd)"
record="${2:-}"
ledger_dir="$workspace/.agent-learning/ledger"

if [ "$record" != "" ] && [ "$record" != "--record" ]; then
  echo "Unknown option: $record" >&2
  exit 1
fi

if [ ! -d "$ledger_dir/.dolt" ]; then
  echo "No Dolt learning ledger found at $ledger_dir" >&2
  exit 1
fi

cd "$ledger_dir"

sql_quote() {
  printf "%s" "$1" | sed "s/'/''/g"
}

target_for_scope() {
  local scope="$1"
  local pattern_type="$2"
  case "$pattern_type" in
    estimate_overrun)
      printf "docs/token-calibration.md"
      ;;
    missing_ingredient)
      printf ".sandcastle/preflight-specs.md"
      ;;
    guardrail_block)
      printf "docs/guardrails.md"
      ;;
    model_routing)
      printf "docs/token-calibration.md"
      ;;
    repeat_defect)
      printf "Specs/spec-template.md"
      ;;
    *)
      printf "AGENTS.md"
      ;;
  esac
}

layer_for_scope() {
  local scope="$1"
  case "$scope" in
    global) printf "global" ;;
    work) printf "work" ;;
    individual) printf "individual" ;;
    *) printf "workspace" ;;
  esac
}

confidence_for_count() {
  local count="$1"
  if [ "$count" -ge 5 ]; then
    printf "high"
  elif [ "$count" -ge 3 ]; then
    printf "medium"
  else
    printf "low"
  fi
}

recommendation_text() {
  local pattern_type="$1"
  local key="$2"
  case "$pattern_type" in
    estimate_overrun)
      printf "Review token priors and required ingredients for %s; update token blocks or preflight so similar tasks start with a better estimate and stop condition." "$key"
      ;;
    missing_ingredient)
      printf "Add a preflight requirement for missing ingredient %s before similar specs are marked ready." "$key"
      ;;
    guardrail_block)
      printf "Clarify guardrail plan requirements for %s; update guardrail docs or verifier policy if this block pattern is expected to recur." "$key"
      ;;
    model_routing)
      printf "Update model routing guidance for %s; record when to escalate or downgrade models for this task shape/role." "$key"
      ;;
    repeat_defect)
      printf "Add a spec, review, or test checklist item for repeated defect pattern %s." "$key"
      ;;
    *)
      printf "Review recurring pattern %s and broadcast the smallest workflow change that prevents recurrence." "$key"
      ;;
  esac
}

emit_row() {
  local pattern_type="$1"
  local scope="$2"
  local key="$3"
  local support="$4"
  local metric="$5"
  local evidence_query="$6"
  local confidence
  local target_layer
  local target_artifact
  local recommendation
  local recommendation_id

  confidence="$(confidence_for_count "$support")"
  target_layer="$(layer_for_scope "$scope")"
  target_artifact="$(target_for_scope "$scope" "$pattern_type")"
  recommendation="$(recommendation_text "$pattern_type" "$key")"
  recommendation_id="${scope}:${pattern_type}:$(printf "%s" "$key" | tr -c 'A-Za-z0-9_.:-' '_' | sed 's/_*$//')"

  printf "| %s | %s | %s | %s | %s | %s | %s |\n" \
    "$pattern_type" "$scope" "$key" "$support" "$confidence" "$target_artifact" "$recommendation"

  if [ "$record" = "--record" ]; then
    dolt sql -q "replace into learning_recommendations (recommendation_id, workspace_scope, pattern_type, pattern_key, supporting_run_count, confidence, evidence_query, recommendation, target_layer, target_artifact, expected_metric_change, followup_metric, review_after_runs, status, updated_at) values ('$(sql_quote "$recommendation_id")', '$(sql_quote "$scope")', '$(sql_quote "$pattern_type")', '$(sql_quote "$key")', $support, '$(sql_quote "$confidence")', '$(sql_quote "$evidence_query")', '$(sql_quote "$recommendation")', '$(sql_quote "$target_layer")', '$(sql_quote "$target_artifact")', 'Reduce recurrence or estimate error for this pattern.', '$(sql_quote "$metric")', 10, 'proposed', current_timestamp);"
  fi
}

run_query() {
  local pattern_type="$1"
  local query="$2"
  local metric="$3"
  local evidence_query="$4"

  dolt sql -r csv -q "$query" | tail -n +2 | while IFS=, read -r scope key support value; do
    [ -z "${scope:-}" ] && continue
    emit_row "$pattern_type" "$scope" "$key" "$support" "$metric" "$evidence_query"
  done
}

echo "# Learning Review"
echo
echo "Workspace: $workspace"
echo "Mode: ${record:---dry-run}"
echo
echo "| Pattern | Scope | Key | Runs | Confidence | Target Artifact | Recommendation |"
echo "| --- | --- | --- | ---: | --- | --- | --- |"

estimate_query="select workspace_scope, concat(coalesce(task_shape, 'unknown'), '/', coalesce(circle_of_competence, 'unknown')) as pattern_key, count(*) as supporting_run_count, avg(estimate_error) as metric_value from agent_runs where estimate_error > 2 group by workspace_scope, task_shape, circle_of_competence having count(*) >= 2 order by supporting_run_count desc;"
run_query "estimate_overrun" "$estimate_query" "avg_estimate_error" "$estimate_query"

missing_query="select coalesce(r.workspace_scope, 'unknown') as workspace_scope, m.ingredient as pattern_key, count(*) as supporting_run_count, count(*) as metric_value from run_missing_ingredients m left join agent_runs r on r.run_id = m.run_id group by coalesce(r.workspace_scope, 'unknown'), m.ingredient having count(*) >= 2 order by supporting_run_count desc;"
run_query "missing_ingredient" "$missing_query" "missing_ingredient_count" "$missing_query"

guardrail_query="select coalesce(r.workspace_scope, 'unknown') as workspace_scope, coalesce(nullif(g.blocked_findings, ''), 'guardrail_block') as pattern_key, count(*) as supporting_run_count, count(*) as metric_value from run_guardrails g left join agent_runs r on r.run_id = g.run_id where coalesce(g.verifier_ok, false) = false or (coalesce(g.approval_required, false) = true and coalesce(g.approval_granted, false) = false) group by coalesce(r.workspace_scope, 'unknown'), coalesce(nullif(g.blocked_findings, ''), 'guardrail_block') having count(*) >= 2 order by supporting_run_count desc;"
run_query "guardrail_block" "$guardrail_query" "guardrail_block_count" "$guardrail_query"

model_query="select coalesce(r.workspace_scope, 'unknown') as workspace_scope, concat(coalesce(m.model, 'unknown'), '/', coalesce(m.role, 'unknown'), '/', coalesce(m.routing_fit, 'unknown')) as pattern_key, count(*) as supporting_run_count, avg(coalesce(m.total_tokens, 0)) as metric_value from run_models m left join agent_runs r on r.run_id = m.run_id where m.routing_fit in ('underpowered', 'overpowered', 'mismatched') group by coalesce(r.workspace_scope, 'unknown'), m.model, m.role, m.routing_fit having count(*) >= 2 order by supporting_run_count desc;"
run_query "model_routing" "$model_query" "routing_mismatch_count" "$model_query"

defect_query="select coalesce(r.workspace_scope, 'unknown') as workspace_scope, concat(coalesce(v.review_type, 'unknown'), '/', coalesce(nullif(v.defects, ''), 'defect')) as pattern_key, count(*) as supporting_run_count, count(*) as metric_value from run_reviews v left join agent_runs r on r.run_id = v.run_id where v.defects is not null and v.defects <> '' group by coalesce(r.workspace_scope, 'unknown'), v.review_type, v.defects having count(*) >= 2 order by supporting_run_count desc;"
run_query "repeat_defect" "$defect_query" "repeat_defect_count" "$defect_query"

echo
if [ "$record" = "--record" ]; then
  dolt add .
  if [ -n "$(dolt diff --staged --name-only)" ]; then
    dolt commit -m "Record learning recommendations"
  fi
  echo "Recorded proposed recommendations in learning_recommendations."
else
  echo "Dry run only. Re-run with --record to upsert proposed recommendations."
fi
