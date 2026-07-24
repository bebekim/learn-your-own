#!/bin/zsh
# Full learning loop for a task: two baseline runs, learn across prior runs,
# one treatment run with delivered lessons, then compare.
# Usage: run-loop.sh <task-dir> <learn-run-dirs-csv>
set -euo pipefail

TASK_DIR="$1"
LEARN_RUNS="$2"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "=== S1"
node src/cli.ts pipeline run --plan "$TASK_DIR/plan.json" --runs-root "$TASK_DIR/runs" | tee /tmp/lyo-s1.json
S1=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/lyo-s1.json','utf8')).runDir")

echo "=== S2"
node src/cli.ts pipeline run --plan "$TASK_DIR/plan.json" --runs-root "$TASK_DIR/runs" | tee /tmp/lyo-s2.json
S2=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/lyo-s2.json','utf8')).runDir")

echo "=== LEARN ($LEARN_RUNS,$S1,$S2)"
node src/cli.ts pipeline learn \
  --run "$LEARN_RUNS,$S1,$S2" \
  --judge-model anthropic/claude-sonnet-5 \
  --library "$TASK_DIR/lessons" | tee /tmp/lyo-learn3.json

echo "=== S3 (with lessons)"
node src/cli.ts pipeline run --plan "$TASK_DIR/plan.json" --runs-root "$TASK_DIR/runs" --lessons "$TASK_DIR/lessons" | tee /tmp/lyo-s3.json
S3=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/lyo-s3.json','utf8')).runDir")

echo "=== COMPARE S1 vs S3"
node src/cli.ts pipeline compare --baseline "$S1" --treatment "$S3"
