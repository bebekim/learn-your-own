#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for skill in agent-observer agent-gap-interpreter agent-adaptation-propagator; do
  skill_dir="$repo_root/skills/$skill"
  skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    echo "Missing skill file: skills/$skill/SKILL.md" >&2
    exit 1
  fi

  if ! grep -q "^name: $skill$" "$skill_file"; then
    echo "Skill has wrong name frontmatter: $skill" >&2
    exit 1
  fi

  if ! grep -q '^description: Use when ' "$skill_file"; then
    echo "Skill description must be trigger-focused: $skill" >&2
    exit 1
  fi

  if ! grep -q 'metadata: .*"openclaw"' "$skill_file"; then
    echo "Skill missing OpenClaw metadata: $skill" >&2
    exit 1
  fi

  if [ ! -d "$skill_dir/references" ]; then
    echo "Missing references directory: skills/$skill/references" >&2
    exit 1
  fi
done

grep -q "scripts/task-start.sh" "$repo_root/skills/agent-observer/SKILL.md"
grep -q "scripts/task-finish.sh" "$repo_root/skills/agent-observer/SKILL.md"
grep -q "Do not infer lessons" "$repo_root/skills/agent-observer/SKILL.md"
grep -q "What gap" "$repo_root/skills/agent-gap-interpreter/SKILL.md"
grep -q "approved adaptation" "$repo_root/skills/agent-adaptation-propagator/SKILL.md"
