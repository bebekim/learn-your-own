#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: scripts/mkdir-agentic.sh [options] /path/to/new-repo

Create an agent-managed repository folder, install workflow files, create a
shared Bead, write a task manifest, register repo context, and start the run.

Options:
  --workspace PATH        Workspace root. Defaults to the new repo's parent.
  --scope NAME            Workspace scope. Defaults to workspace basename.
  --title TITLE           Initial Bead title.
  --bead-id ID            Reuse an existing Bead instead of creating one.
  --functional-area AREA  Manifest functional area. Default: local-devops.
  --competence-band BAND  core|adjacent|exploratory|outside. Default: exploratory.
  --model MODEL           Planned model. Default: gpt-5.5.
  --reasoning EFFORT      Reasoning effort. Default: medium.
  --expected-tokens N     Expected token estimate. Default: 1000.
  --maximum-tokens N      Maximum token estimate. Default: 4000.
  --no-start              Do not call task-start.sh after manifest creation.
USAGE
}

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
renderer="$script_dir/lib/render-jinja-template.py"

workspace=""
scope=""
title=""
bead_id=""
functional_area="local-devops"
competence_band="exploratory"
model="gpt-5.5"
reasoning_effort="medium"
expected_tokens="1000"
maximum_tokens="4000"
start_run="true"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --workspace)
      workspace="$2"
      shift 2
      ;;
    --scope)
      scope="$2"
      shift 2
      ;;
    --title)
      title="$2"
      shift 2
      ;;
    --bead-id)
      bead_id="$2"
      shift 2
      ;;
    --functional-area)
      functional_area="$2"
      shift 2
      ;;
    --competence-band)
      competence_band="$2"
      shift 2
      ;;
    --model)
      model="$2"
      shift 2
      ;;
    --reasoning)
      reasoning_effort="$2"
      shift 2
      ;;
    --expected-tokens)
      expected_tokens="$2"
      shift 2
      ;;
    --maximum-tokens)
      maximum_tokens="$2"
      shift 2
      ;;
    --no-start)
      start_run="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      if [ "${repo_path:-}" ]; then
        echo "Only one repo path is supported" >&2
        usage
        exit 1
      fi
      repo_path="$1"
      shift
      ;;
  esac
done

if [ -z "${repo_path:-}" ]; then
  usage
  exit 1
fi

repo_path="${repo_path/#\~/$HOME}"
repo_parent="$(dirname "$repo_path")"
mkdir -p "$repo_parent"
repo_parent="$(cd "$repo_parent" && pwd)"
repo_name="$(basename "$repo_path")"
repo_path="$repo_parent/$repo_name"

workspace="${workspace:-$repo_parent}"
workspace="${workspace/#\~/$HOME}"
workspace="$(cd "$workspace" && pwd)"
scope="${scope:-$(basename "$workspace")}"
title="${title:-Initialize $repo_name as an agent-managed repo}"

mkdir -p "$repo_path"
had_agents="false"
if [ -e "$repo_path/AGENTS.md" ]; then
  had_agents="true"
fi

if [ ! -d "$repo_path/.git" ]; then
  git -C "$repo_path" init
fi

"$script_dir/install-workflow.sh" "$repo_path"

if [ ! -d "$workspace/.agent-learning/ledger/.dolt" ]; then
  "$script_dir/init-learning-ledger.sh" "$workspace" "$scope"
fi

if [ ! -d "$workspace/.beads" ]; then
  (cd "$workspace" && bd init --non-interactive --skip-agents)
fi
(cd "$workspace" && bd setup codex)

if [ -z "$bead_id" ]; then
  bead_id="$(cd "$workspace" && bd create --silent --title "$title" --type task --description "Initial agentic setup for $repo_path")"
fi

inherited_agents="- $HOME/AGENTS.md
- $(dirname "$workspace")/AGENTS.md
- $workspace/AGENTS.md
- $repo_path/AGENTS.md"

render_template() {
  local template="$1"
  local output="$2"
  python3 "$renderer" "$template" "$output" \
    --var "repo_name=$repo_name" \
    --var "repo_path=$repo_path" \
    --var "workspace_scope=$scope" \
    --var "beads_path=$workspace" \
    --var "bead_id=$bead_id" \
    --var "inherited_agents=$inherited_agents" \
    --var "functional_area=$functional_area" \
    --var "competence_band=$competence_band" \
    --var "planned_model=$model" \
    --var "reasoning_effort=$reasoning_effort" \
    --var "expected_tokens=$expected_tokens" \
    --var "maximum_tokens=$maximum_tokens"
}

if [ "$had_agents" = "false" ]; then
  render_template "$repo_root/templates/scaffold/AGENTS.md.j2" "$repo_path/AGENTS.md"
fi

manifest_dir="$repo_path/.agent-learning"
manifest="$manifest_dir/task-manifest.yaml"
mkdir -p "$manifest_dir"
render_template "$repo_root/templates/scaffold/task-manifest.yaml.j2" "$manifest"

"$script_dir/register-repo-contexts.sh" "$workspace" "$scope"

if [ "$start_run" = "true" ]; then
  "$script_dir/task-start.sh" "$manifest"
fi

echo
echo "Agentic repo ready:"
echo "  repo: $repo_path"
echo "  workspace: $workspace"
echo "  scope: $scope"
echo "  bead_id: $bead_id"
echo "  manifest: $manifest"
