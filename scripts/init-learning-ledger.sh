#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 5 ]; then
  echo "Usage: scripts/init-learning-ledger.sh /path/to/workspace <scope> [dominant_stacks] [guardrail_packs] [notes]" >&2
  exit 1
fi

template_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
workspace="$(cd "$1" && pwd)"
scope="$2"
dominant_stacks="${3:-}"
guardrail_packs="${4:-}"
notes="${5:-}"
ledger_dir="$workspace/.agent-learning/ledger"
schema="$template_root/templates/.agent-learning/schema.sql"

if ! command -v dolt >/dev/null 2>&1; then
  echo "dolt is required but was not found on PATH" >&2
  exit 1
fi

mkdir -p "$ledger_dir"

cd "$ledger_dir"
if [ ! -d ".dolt" ]; then
  dolt init --name "Agent Learning Ledger" --email "agent-learning@local"
fi

if ! dolt config --local --get user.name >/dev/null 2>&1; then
  dolt config --local --add user.name "Agent Learning Ledger"
fi

if ! dolt config --local --get user.email >/dev/null 2>&1; then
  dolt config --local --add user.email "agent-learning@local"
fi

dolt sql < "$schema"

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

workspace_sql="$(sql_escape "$workspace")"
scope_sql="$(sql_escape "$scope")"
stacks_sql="$(sql_escape "$dominant_stacks")"
guards_sql="$(sql_escape "$guardrail_packs")"
notes_sql="$(sql_escape "$notes")"

dolt sql -q "replace into workspace_profiles (workspace_scope, workspace_path, dominant_stacks, guardrail_packs, notes, updated_at) values ('$scope_sql', '$workspace_sql', '$stacks_sql', '$guards_sql', '$notes_sql', current_timestamp);"

dolt add .
if [ -n "$(dolt diff --staged --name-only)" ]; then
  dolt commit -m "Initialize agent learning ledger for $scope"
fi

echo "Initialized Dolt learning ledger:"
echo "$ledger_dir"
