#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: scripts/register-repo-contexts.sh /path/to/workspace <scope>" >&2
  exit 1
fi

workspace="$(cd "$1" && pwd)"
scope="$2"
ledger_dir="$workspace/.agent-learning/ledger"

if [ ! -d "$ledger_dir/.dolt" ]; then
  echo "No Dolt learning ledger found at $ledger_dir" >&2
  exit 1
fi

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

repo_family_for() {
  local name="$1"
  case "$name" in
    *-rep-*) printf "%s" "${name%%-rep-*}" ;;
    *) printf "%s" "$name" ;;
  esac
}

stack_for() {
  local repo_path="$1"
  local scope="$2"
  if [ "$scope" = "work" ]; then
    printf "databricks,spark,sql,python"
    return
  fi

  local stacks=()
  [ -f "$repo_path/package.json" ] && stacks+=("typescript")
  [ -f "$repo_path/pyproject.toml" ] || [ -f "$repo_path/requirements.txt" ] && stacks+=("python")
  [ -f "$repo_path/dbt_project.yml" ] && stacks+=("dbt")
  if find "$repo_path" -maxdepth 2 \( -name "*.lisp" -o -name "*.el" -o -name "*.asd" \) -print -quit 2>/dev/null | grep -q .; then
    stacks+=("lisp")
  fi
  if [ "${#stacks[@]}" -eq 0 ]; then
    stacks+=("unknown")
  fi
  local joined
  joined="$(IFS=,; echo "${stacks[*]}")"
  printf "%s" "$joined"
}

guardrail_for() {
  local scope="$1"
  if [ "$scope" = "work" ]; then
    printf "databricks-production,spark-sql,secrets,business-review,read-only-first"
  else
    printf "local-dev,tests,no-spark,personal-projects"
  fi
}

risk_for() {
  local scope="$1"
  if [ "$scope" = "work" ]; then
    printf "medium"
  else
    printf "low"
  fi
}

cd "$ledger_dir"

find "$workspace" -maxdepth 1 -mindepth 1 -type d | sort | while read -r repo_path; do
  name="$(basename "$repo_path")"
  case "$name" in
    .agent-learning|.omx|.sandcastle|.venv|.night-shift|.data-guardrails)
      continue
      ;;
  esac

  if ! git -C "$repo_path" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    continue
  fi

  family="$(repo_family_for "$name")"
  context_id="$scope:$name"
  branch="$(git -C "$repo_path" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  commit="$(git -C "$repo_path" rev-parse HEAD 2>/dev/null || true)"
  base_repo_path=""
  worktree_path=""
  if [ "$name" != "$family" ] && [ -d "$workspace/$family" ]; then
    base_repo_path="$workspace/$family"
    worktree_path="$repo_path"
  fi
  stack="$(stack_for "$repo_path" "$scope")"
  guardrail="$(guardrail_for "$scope")"
  risk="$(risk_for "$scope")"

  dolt sql -q "replace into repo_contexts (context_id, workspace_scope, repo_family, repo_path, worktree_path, base_repo_path, branch, current_commit, dominant_stack, guardrail_pack, environment_risk, updated_at) values ('$(sql_escape "$context_id")', '$(sql_escape "$scope")', '$(sql_escape "$family")', '$(sql_escape "$repo_path")', '$(sql_escape "$worktree_path")', '$(sql_escape "$base_repo_path")', '$(sql_escape "$branch")', '$(sql_escape "$commit")', '$(sql_escape "$stack")', '$(sql_escape "$guardrail")', '$(sql_escape "$risk")', current_timestamp);"
done

dolt add .
if [ -n "$(dolt diff --staged --name-only)" ]; then
  dolt commit -m "Register repo contexts for $scope"
fi

echo "Registered repo contexts for $scope:"
dolt sql -q "select context_id, repo_family, branch, dominant_stack, environment_risk from repo_contexts order by context_id;"
