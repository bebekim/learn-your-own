#!/bin/sh
set -eu

repo=${1:-.}
outbox=${2:-"$repo/.vcscore/lyo-outbox.ndjson"}
db=${3:-"$repo/.agent-learning/learning.sqlite"}

exec node "$repo/src/cli.ts" telemetry consume \
  --outbox "$outbox" \
  --db "$db" \
  --follow
