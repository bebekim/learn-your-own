#!/bin/sh
set -eu

repo=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
host=${LYO_TELEMETRY_HOST:-127.0.0.1}
port=${LYO_TELEMETRY_PORT:-8788}
db=${LYO_TELEMETRY_DB:-"$repo/.agent-learning/learning.sqlite"}
state_dir="$repo/.agent-learning"
pid_file="$state_dir/telemetry-server.pid"
log_file="$state_dir/telemetry-server.log"
health_url="http://$host:$port/health"

mkdir -p "$state_dir"

if curl -fsS --max-time 1 "$health_url" >/dev/null 2>&1; then
  echo "Lyo telemetry server already running at $health_url"
  exit 0
fi

if [ -f "$pid_file" ]; then
  old_pid=$(sed -n '1p' "$pid_file")
  if kill -0 "$old_pid" 2>/dev/null; then
    echo "Lyo server process $old_pid is starting; try again shortly"
    exit 0
  fi
  rm -f "$pid_file"
fi

nohup node "$repo/src/cli.ts" telemetry serve \
  --db "$db" \
  --host "$host" \
  --port "$port" \
  >>"$log_file" 2>&1 &
pid=$!
echo "$pid" >"$pid_file"

for _ in 1 2 3 4 5; do
  if curl -fsS --max-time 1 "$health_url" >/dev/null 2>&1; then
    echo "Started Lyo telemetry server at $health_url (pid $pid)"
    exit 0
  fi
  sleep 1
done

echo "Lyo telemetry server did not become ready; see $log_file" >&2
exit 1
