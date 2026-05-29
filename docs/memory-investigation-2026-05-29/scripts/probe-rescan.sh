#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd curl
require_cmd docker
require_cmd jq

VERIFY_ID="${VERIFY_ID:-V07-rescan}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
APP_URL="${APP_URL:-http://127.0.0.1:6060}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
APP_CONTAINER="${APP_CONTAINER:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
LIBRARY_ID="${LIBRARY_ID:-1}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
RESCAN_TIMEOUT_SECONDS="${RESCAN_TIMEOUT_SECONDS:-1800}"
POST_IDLE_SECONDS="${POST_IDLE_SECONDS:-60}"

[[ -n "$APP_CONTAINER" ]] || die "APP_CONTAINER is required"
[[ -n "$DB_CONTAINER" ]] || die "DB_CONTAINER is required"

export ARTIFACT_DIR
ensure_artifact_dirs "$ARTIFACT_DIR"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
app_url=$APP_URL
admin_user=$ADMIN_USER
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
library_id=$LIBRARY_ID
sample_interval=$SAMPLE_INTERVAL
rescan_timeout_seconds=$RESCAN_TIMEOUT_SECONDS
post_idle_seconds=$POST_IDLE_SECONDS
EOF

TOKEN="$(auth_token "$APP_URL" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime-token.txt"

run_detached_step 010-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' rescan"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/010-sample-loop.pid")"
trap 'kill_tree "$SAMPLE_PID"' EXIT

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-rescan"

run_step 020-trigger-rescan curl -fsS -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  "$APP_URL/api/v1/libraries/${LIBRARY_ID}/refresh"

start="$(date +%s)"
while true; do
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-rescan"
  docker logs "$APP_CONTAINER" --since 30m >"$ARTIFACT_DIR/logs/app-rescan-tail.log" 2>"$ARTIFACT_DIR/logs/app-rescan-tail.stderr.log" || true
  if rg -q "Finished refreshing library|Parsing task completed|Completed background scan" "$ARTIFACT_DIR/logs/app-rescan-tail.log"; then
    ledger rescan complete "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$(book_count "$DB_CONTAINER")" "completion-log-observed"
    break
  fi
  if rg -q "Error while parsing library books|Unexpected error during library scan|Library path .* not accessible" "$ARTIFACT_DIR/logs/app-rescan-tail.log"; then
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    die "Rescan error observed in app logs"
  fi
  if (( $(date +%s) - start >= RESCAN_TIMEOUT_SECONDS )); then
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    die "Timed out waiting for rescan completion"
  fi
  sleep 5
done

sleep "$POST_IDLE_SECONDS"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-rescan-idle"
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"

{
  echo "# Rescan Summary"
  echo
  echo "- App URL: $APP_URL"
  echo "- Library ID: $LIBRARY_ID"
  echo "- Artifact directory: $ARTIFACT_DIR"
  echo
  echo '```text'
  tail -20 "$ARTIFACT_DIR/run-ledger.tsv"
  echo '```'
} >"$ARTIFACT_DIR/summaries/rescan-summary.md"

{
  echo "# Run Notes"
  echo
  echo "- Verification ID: $VERIFY_ID"
  echo "- Evidence grade: A when run against exact user-facing image."
  echo "- App URL: $APP_URL"
  echo "- Library ID: $LIBRARY_ID"
  echo "- Result: rescan completed; see samples/docker-stats.tsv and logs/app-rescan-tail.log."
  echo "- Artifacts: $ARTIFACT_DIR"
  echo "- Commands: $ARTIFACT_DIR/commands"
  echo "- Raw samples: $ARTIFACT_DIR/samples"
  echo "- Logs: $ARTIFACT_DIR/logs"
} >"$ARTIFACT_DIR/notes.md"

printf '%s\n' "$ARTIFACT_DIR"
