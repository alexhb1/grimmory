#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq

VERIFY_ID="${VERIFY_ID:-V00-debug-endpoint-attribution}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
APP_URL="${APP_URL:-http://127.0.0.1:6260}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
APP_CONTAINER="${APP_CONTAINER:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
CONCURRENCY="${CONCURRENCY:-4}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
JFR_NAME="${JFR_NAME:-memory_debug}"
JFR_FILE="${JFR_FILE:-jfr-${VERIFY_ID}.jfr}"
JFR_CONTAINER_PATH="/tmp/${JFR_FILE}"

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
concurrency=$CONCURRENCY
sample_interval=$SAMPLE_INTERVAL
jfr_name=$JFR_NAME
jfr_file=$JFR_FILE
jfr_container_path=$JFR_CONTAINER_PATH
EOF

run_step 001-pre-gc docker exec "$APP_CONTAINER" jcmd 1 GC.run
run_step 002-pre-snapshot env \
  ARTIFACT_DIR="$ARTIFACT_DIR" \
  APP_CONTAINER="$APP_CONTAINER" \
  LABEL=pre \
  "$SCRIPT_DIR/jvm-snapshot.sh"

run_step 010-jfr-start docker exec "$APP_CONTAINER" jcmd 1 JFR.start \
  "name=$JFR_NAME" \
  settings=profile \
  "filename=$JFR_CONTAINER_PATH"

run_step 020-probe-endpoints env \
  VERIFY_ID="$VERIFY_ID" \
  ARTIFACT_DIR="$ARTIFACT_DIR" \
  APP_URL="$APP_URL" \
  ADMIN_USER="$ADMIN_USER" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  APP_CONTAINER="$APP_CONTAINER" \
  DB_CONTAINER="$DB_CONTAINER" \
  CONCURRENCY="$CONCURRENCY" \
  SAMPLE_INTERVAL="$SAMPLE_INTERVAL" \
  "$SCRIPT_DIR/probe-endpoints.sh"

run_step 030-jfr-stop docker exec "$APP_CONTAINER" jcmd 1 JFR.stop "name=$JFR_NAME"
run_step 031-copy-jfr docker cp "$APP_CONTAINER:$JFR_CONTAINER_PATH" "$ARTIFACT_DIR/samples/$JFR_FILE"

run_step 040-post-gc docker exec "$APP_CONTAINER" jcmd 1 GC.run
run_step 041-post-snapshot env \
  ARTIFACT_DIR="$ARTIFACT_DIR" \
  APP_CONTAINER="$APP_CONTAINER" \
  LABEL=post \
  "$SCRIPT_DIR/jvm-snapshot.sh"

run_step 050-jfr-summary docker exec "$APP_CONTAINER" jfr summary "$JFR_CONTAINER_PATH"
run_step 051-jfr-allocation-by-class docker exec "$APP_CONTAINER" jfr view allocation-by-class "$JFR_CONTAINER_PATH"
run_step 052-jfr-hot-methods docker exec "$APP_CONTAINER" jfr view hot-methods "$JFR_CONTAINER_PATH"

cp "$ARTIFACT_DIR/commands/050-jfr-summary.stdout.log" "$ARTIFACT_DIR/summaries/jfr-summary.txt"
cp "$ARTIFACT_DIR/commands/051-jfr-allocation-by-class.stdout.log" "$ARTIFACT_DIR/summaries/jfr-allocation-by-class.txt"
cp "$ARTIFACT_DIR/commands/052-jfr-hot-methods.stdout.log" "$ARTIFACT_DIR/summaries/jfr-hot-methods.txt"

collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"

{
  echo "# Run Notes"
  echo
  echo "- Verification ID: $VERIFY_ID"
  echo "- Evidence grade: B"
  echo "- App URL: $APP_URL"
  echo "- Artifact directory: $ARTIFACT_DIR"
  echo "- Result: debug endpoint probes and JFR captured."
  echo "- Raw samples: samples/request-results.tsv, samples/docker-stats.tsv, samples/nmt-summary-pre.txt, samples/nmt-summary-post.txt"
  echo "- JFR: samples/$JFR_FILE"
  echo "- Summaries: summaries/jfr-summary.txt, summaries/jfr-allocation-by-class.txt, summaries/jfr-hot-methods.txt"
} >"$ARTIFACT_DIR/notes.md"

printf '%s\n' "$ARTIFACT_DIR"
