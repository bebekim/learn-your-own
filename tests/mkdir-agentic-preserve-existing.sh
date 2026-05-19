#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

bin="$tmp/bin"
workspace="$tmp/workspace"
repo="$workspace/existing-repo"
log="$tmp/commands.log"

mkdir -p "$bin" "$repo/.agent-learning" "$workspace/.beads" "$workspace/.agent-learning/ledger/.dolt"

cat >"$bin/bd" <<'SH'
#!/usr/bin/env bash
echo "bd $*" >>"$COMMAND_LOG"
case "$1" in
  create)
    echo "created-bead"
    ;;
esac
SH
chmod +x "$bin/bd"

cat >"$bin/dolt" <<'SH'
#!/usr/bin/env bash
echo "dolt $*" >>"$COMMAND_LOG"
case "$1 $2" in
  "config --local")
    exit 0
    ;;
  "diff --staged")
    exit 0
    ;;
esac
exit 0
SH
chmod +x "$bin/dolt"

cat >"$repo/AGENTS.md" <<'EOF'
existing agents instructions
EOF

cat >"$repo/.agent-learning/task-manifest.yaml" <<'EOF'
task:
  bead_id: "existing-bead"
  workspace_scope: "existing-scope"
  repo_path: "/should/not/change"
  beads_path: "/should/not/change"
EOF

before_agents="$(cat "$repo/AGENTS.md")"
before_manifest="$(cat "$repo/.agent-learning/task-manifest.yaml")"

COMMAND_LOG="$log" PATH="$bin:$PATH" \
  "$repo_root/scripts/mkdir-agentic.sh" --workspace "$workspace" --scope test --no-start "$repo" >"$tmp/mkdir-agentic-test.out"

after_agents="$(cat "$repo/AGENTS.md")"
after_manifest="$(cat "$repo/.agent-learning/task-manifest.yaml")"

if [ "$after_agents" != "$before_agents" ]; then
  echo "AGENTS.md was overwritten" >&2
  exit 1
fi

if [ "$after_manifest" != "$before_manifest" ]; then
  echo "Existing task manifest was overwritten" >&2
  exit 1
fi

if grep -q '^bd setup codex' "$log"; then
  echo "bd setup codex ran against an existing Beads workspace" >&2
  exit 1
fi

if grep -q '^bd create ' "$log"; then
  echo "A new Bead was created instead of preserving the existing manifest bead" >&2
  exit 1
fi
