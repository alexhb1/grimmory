#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd node
require_cmd docker

VERIFY_ID="${VERIFY_ID:-V00-browser-startup}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
APP_URL="${APP_URL:-http://127.0.0.1:6060}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
APP_CONTAINER="${APP_CONTAINER:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
DURATION_MS="${DURATION_MS:-15000}"
ROUTE="${ROUTE:-/}"
TAKE_HEAP_SNAPSHOT="${TAKE_HEAP_SNAPSHOT:-0}"

export ARTIFACT_DIR
ensure_artifact_dirs "$ARTIFACT_DIR"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
app_url=$APP_URL
admin_user=$ADMIN_USER
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
sample_interval=$SAMPLE_INTERVAL
duration_ms=$DURATION_MS
route=$ROUTE
take_heap_snapshot=$TAKE_HEAP_SNAPSHOT
EOF

if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
  run_detached_step 010-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' browser"
  SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/010-sample-loop.pid")"
  trap 'kill_tree "$SAMPLE_PID"' EXIT
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-browser"
fi

run_step 020-browser-probe env \
  ARTIFACT_DIR="$ARTIFACT_DIR" \
  APP_URL="$APP_URL" \
  ADMIN_USER="$ADMIN_USER" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  DURATION_MS="$DURATION_MS" \
  ROUTE="$ROUTE" \
  TAKE_HEAP_SNAPSHOT="$TAKE_HEAP_SNAPSHOT" \
  node "$SCRIPT_DIR/browser-probe.mjs"

if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-browser"
  collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
fi

{
  echo "# Run Notes"
  echo
  echo "- Verification ID: $VERIFY_ID"
  echo "- Evidence grade: A when run against the exact user-facing image."
  echo "- App URL: $APP_URL"
  echo "- Route: $ROUTE"
  echo "- Browser duration: ${DURATION_MS}ms"
  echo "- Heap snapshot enabled: $TAKE_HEAP_SNAPSHOT"
  echo "- Result: browser startup probe completed; see summaries/browser-summary.json."
  echo "- Artifacts: $ARTIFACT_DIR"
  echo "- Commands: $ARTIFACT_DIR/commands"
  echo "- Raw samples: $ARTIFACT_DIR/samples"
  echo "- Logs: $ARTIFACT_DIR/logs"
} >"$ARTIFACT_DIR/notes.md"

printf '%s\n' "$ARTIFACT_DIR"
