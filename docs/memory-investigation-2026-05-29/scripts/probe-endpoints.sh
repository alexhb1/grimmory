#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd curl
require_cmd jq

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir V00-endpoint-probe)}"
APP_URL="${APP_URL:-http://127.0.0.1:6060}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
APP_CONTAINER="${APP_CONTAINER:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
CONCURRENCY="${CONCURRENCY:-0}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
export ARTIFACT_DIR
mkdir -p "$ARTIFACT_DIR/samples/responses"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=${VERIFY_ID:-V00-endpoint-probe}
app_url=$APP_URL
admin_user=$ADMIN_USER
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
concurrency=$CONCURRENCY
sample_interval=$SAMPLE_INTERVAL
EOF

TOKEN="$(auth_token "$APP_URL" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime-token.txt"

if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
  run_detached_step 010-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' endpoints"
  SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/010-sample-loop.pid")"
  trap 'kill_tree "$SAMPLE_PID"' EXIT
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-endpoints"
fi

probe_endpoint full-unstripped GET "$APP_URL/api/v1/books?stripForListView=false" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER"
sleep 5
probe_endpoint full-stripped GET "$APP_URL/api/v1/books?stripForListView=true" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER"
sleep 5
probe_endpoint page-50 GET "$APP_URL/api/v1/books/page?page=0&size=50&sort=metadata.title,asc" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER"
sleep 5
probe_endpoint app-books-50 GET "$APP_URL/api/v1/app/books?page=0&size=50&sort=metadata.title,asc" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER" || true
probe_endpoint filter-options GET "$APP_URL/api/v1/app/filter-options" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER" || true

if [[ "$CONCURRENCY" =~ ^[0-9]+$ && "$CONCURRENCY" -gt 0 ]]; then
  mkdir -p "$ARTIFACT_DIR/samples/concurrent"
  if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-concurrent-${CONCURRENCY}"
  fi
  for i in $(seq 1 "$CONCURRENCY"); do
    (
      curl -sS \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Accept-Encoding: identity' \
        -w "client=$i http_status=%{http_code} time_total=%{time_total} size_download=%{size_download}\n" \
        -o "$ARTIFACT_DIR/samples/concurrent/full-unstripped-${i}.body" \
        "$APP_URL/api/v1/books?stripForListView=false" \
        >"$ARTIFACT_DIR/samples/concurrent/full-unstripped-${i}.meta" \
        2>"$ARTIFACT_DIR/samples/concurrent/full-unstripped-${i}.stderr"
    ) &
  done
  wait
  sha256sum "$ARTIFACT_DIR"/samples/concurrent/*.body >>"$ARTIFACT_DIR/samples/sha256sums.txt"
  if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-concurrent-${CONCURRENCY}"
  fi
fi

if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
  collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
fi

{
  echo "# Endpoint Summary"
  echo
  echo "- App URL: $APP_URL"
  echo "- Artifact directory: $ARTIFACT_DIR"
  echo
  echo '```text'
  cat "$ARTIFACT_DIR/samples/request-results.tsv"
  echo '```'
} >"$ARTIFACT_DIR/summaries/endpoint-summary.md"

{
  echo "# Run Notes"
  echo
  echo "- Verification ID: ${VERIFY_ID:-V00-endpoint-probe}"
  echo "- Evidence grade: A when run against the exact user-facing image; otherwise see manifest."
  echo "- App URL: $APP_URL"
  echo "- Concurrency: $CONCURRENCY"
  echo "- Sample interval: ${SAMPLE_INTERVAL}s"
  echo "- Result: endpoint probe completed; interpret using samples/request-results.tsv and samples/docker-stats.tsv."
  echo "- Artifacts: $ARTIFACT_DIR"
  echo "- Commands: $ARTIFACT_DIR/commands"
  echo "- Raw samples: $ARTIFACT_DIR/samples"
  echo "- Logs: $ARTIFACT_DIR/logs"
  echo "- Summary: $ARTIFACT_DIR/summaries/endpoint-summary.md"
} >"$ARTIFACT_DIR/notes.md"

printf '%s\n' "$ARTIFACT_DIR"
