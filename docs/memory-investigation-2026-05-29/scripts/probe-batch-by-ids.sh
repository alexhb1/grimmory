#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd curl
require_cmd docker
require_cmd jq

VERIFY_ID="${VERIFY_ID:-V13-batch-by-ids}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
APP_URL="${APP_URL:-http://127.0.0.1:6060}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
APP_CONTAINER="${APP_CONTAINER:-}"
DB_CONTAINER="${DB_CONTAINER:-}"
BATCH_SIZES="${BATCH_SIZES:-50,500,1500,5000,10000,50000}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"

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
batch_sizes=$BATCH_SIZES
sample_interval=$SAMPLE_INTERVAL
EOF

TOKEN="$(auth_token "$APP_URL" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime-token.txt"

run_detached_step 010-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' batch-by-ids"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/010-sample-loop.pid")"
trap 'kill_tree "$SAMPLE_PID"' EXIT

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-batch-by-ids"

mkdir -p "$ARTIFACT_DIR/samples/batch-ids"
printf 'timestamp_utc\tbatch_size\tids_count\tquery_chars\tstatus\ttime_total_s\tbytes\tgzip_bytes\tapp_rss_before\tapp_rss_after\tdb_rss_before\tdb_rss_after\tbooks\n' >"$ARTIFACT_DIR/samples/batch-results.tsv"

IFS=',' read -r -a sizes <<<"$BATCH_SIZES"
for raw_size in "${sizes[@]}"; do
  size="$(echo "$raw_size" | tr -dc '0-9')"
  [[ -n "$size" ]] || continue

  ids_file="$ARTIFACT_DIR/samples/batch-ids/ids-${size}.txt"
  csv_file="$ARTIFACT_DIR/samples/batch-ids/ids-${size}.csv"
  docker exec "$DB_CONTAINER" mariadb -ugrimmory -pgrimmory -N -B grimmory -e \
    "select id from book where deleted is null or deleted = false order by id limit ${size};" >"$ids_file"
  paste -sd, "$ids_file" >"$csv_file"

  ids_count="$(wc -l <"$ids_file" | tr -d ' ')"
  ids_csv="$(cat "$csv_file")"
  query_chars="${#ids_csv}"
  url="$APP_URL/api/v1/books/batch?withDescription=false&ids=$ids_csv"

  before_app="$(container_memory_bytes "$APP_CONTAINER")"
  before_db="$(container_memory_bytes "$DB_CONTAINER")"
  probe_endpoint "batch-${size}" GET "$url" "$TOKEN" "$APP_CONTAINER" "$DB_CONTAINER"
  after_app="$(container_memory_bytes "$APP_CONTAINER")"
  after_db="$(container_memory_bytes "$DB_CONTAINER")"

  row="$(tail -n 1 "$ARTIFACT_DIR/samples/request-results.tsv")"
  status="$(printf '%s\n' "$row" | awk -F '\t' '{print $5}')"
  time_total="$(printf '%s\n' "$row" | awk -F '\t' '{print $6}')"
  bytes="$(printf '%s\n' "$row" | awk -F '\t' '{print $7}')"
  gzip_bytes="$(printf '%s\n' "$row" | awk -F '\t' '{print $8}')"
  books="$(printf '%s\n' "$row" | awk -F '\t' '{print $13}')"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(ts_utc)" "$size" "$ids_count" "$query_chars" "$status" "$time_total" "$bytes" "$gzip_bytes" "$before_app" "$after_app" "$before_db" "$after_db" "$books" \
    >>"$ARTIFACT_DIR/samples/batch-results.tsv"

  sleep 5
done

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-batch-by-ids"
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"

{
  echo "# Batch By IDs Summary"
  echo
  echo '```text'
  cat "$ARTIFACT_DIR/samples/batch-results.tsv"
  echo '```'
} >"$ARTIFACT_DIR/summaries/batch-by-ids-summary.md"

{
  echo "# Run Notes"
  echo
  echo "- Verification ID: $VERIFY_ID"
  echo "- Evidence grade: A when run against exact user-facing image."
  echo "- App URL: $APP_URL"
  echo "- Batch sizes: $BATCH_SIZES"
  echo "- Result: batch-by-IDs probe completed; see samples/batch-results.tsv and samples/request-results.tsv."
  echo "- Artifacts: $ARTIFACT_DIR"
  echo "- Commands: $ARTIFACT_DIR/commands"
  echo "- Raw samples: $ARTIFACT_DIR/samples"
  echo "- Logs: $ARTIFACT_DIR/logs"
} >"$ARTIFACT_DIR/notes.md"

printf '%s\n' "$ARTIFACT_DIR"
