#!/usr/bin/env bash

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

manifest_values() {
  local manifest="$1"
  shift
  python3 - "$manifest" "$@" <<'PY'
import re
import shlex
import sys

manifest = sys.argv[1]
requested = sys.argv[2:]
values = {}
stack = []


def strip_value(value):
    value = value.strip()
    if not value:
        return ""
    if value[0:1] in ("'", '"') and value[-1:] == value[0]:
        return value[1:-1]
    return value


with open(manifest, encoding="utf-8") as handle:
    for raw in handle:
        line = raw.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        indent = len(line) - len(line.lstrip(" "))
        text = line.strip()

        while stack and stack[-1][0] >= indent:
            stack.pop()

        if text.startswith("- "):
            path = ".".join(item[1] for item in stack)
            item = strip_value(text[2:])
            if item:
                values[path] = f"{values[path]},{item}" if values.get(path) else item
            continue

        match = re.match(r"^([A-Za-z0-9_-]+):(?:\s*(.*))?$", text)
        if not match:
            continue

        key = match.group(1)
        value = strip_value(match.group(2) or "")
        path = ".".join([*(item[1] for item in stack), key])

        if value:
            values[path] = value
        else:
            stack.append((indent, key))

for path in requested:
    env_name = path.upper().replace(".", "_").replace("-", "_")
    print(f"{env_name}={shlex.quote(values.get(path, ''))}")
PY
}

require_value() {
  local name="$1"
  local value="$2"
  if [ -z "$value" ]; then
    echo "Manifest is missing required field: $name" >&2
    exit 1
  fi
}

find_workspace_for_repo() {
  local repo_path="$1"
  local current="$repo_path"
  while [ "$current" != "/" ]; do
    if [ -d "$current/.agent-learning/ledger/.dolt" ]; then
      printf "%s" "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done
  return 1
}

context_id_for() {
  local scope="$1"
  local repo_path="$2"
  printf "%s:%s" "$scope" "$(basename "$repo_path")"
}

repo_family_for() {
  local name="$1"
  case "$name" in
    *-rep-*) printf "%s" "${name%%-rep-*}" ;;
    *) printf "%s" "$name" ;;
  esac
}

beads_workdir_for() {
  local workspace="$1"
  local repo_path="$2"
  local beads_path="$3"

  if [ -n "$beads_path" ]; then
    if [ -d "$beads_path/.beads" ]; then
      printf "%s" "$beads_path"
      return 0
    fi
    if [ -d "$beads_path" ] && [ "$(basename "$beads_path")" = ".beads" ]; then
      printf "%s" "$(dirname "$beads_path")"
      return 0
    fi
  fi

  if [ -d "$workspace/.beads" ]; then
    printf "%s" "$workspace"
    return 0
  fi

  printf "%s" "$repo_path"
}

commit_ledger_if_changed() {
  local message="$1"
  dolt add .
  if [ -n "$(dolt diff --staged --name-only)" ]; then
    dolt commit -m "$message"
  fi
}

csv_first_data_value() {
  tail -n +2 | sed -n '1p' | sed 's/^"//; s/"$//; s/""/"/g'
}
