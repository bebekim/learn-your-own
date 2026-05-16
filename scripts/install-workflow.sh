#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: scripts/install-workflow.sh /path/to/target-repo" >&2
  exit 1
fi

template_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="$(cd "$1" && pwd)"

copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [ -e "$dst" ]; then
    echo "exists: ${dst#$target/}"
    return
  fi
  mkdir -p "$(dirname "$dst")"
  cp "$src" "$dst"
  echo "created: ${dst#$target/}"
}

copy_tree_files() {
  local base="$1"
  find "$base" -type f | while read -r src; do
    case "$src" in
      "$template_root/templates/scaffold/"*) continue ;;
    esac
    rel="${src#$template_root/templates/}"
    copy_if_missing "$src" "$target/$rel"
  done
}

copy_tree_files "$template_root/templates"

if [ -d "$target/.git" ]; then
  exclude="$target/.git/info/exclude"
  touch "$exclude"
  for pattern in ".beads/" ".omx/" ".agent-assets/" ".agent-learning/ledger/" ".beads-credential-key"; do
    if ! grep -qxF "$pattern" "$exclude"; then
      printf '%s\n' "$pattern" >> "$exclude"
    fi
  done
fi

echo
echo "Workflow installed. Next:"
echo "1. Review AGENTS.md and AGENT_LOOP.md."
echo "2. Add repo-specific docs under docs/."
echo "3. Initialize Beads if desired: bd init --non-interactive --skip-agents && bd setup codex"
