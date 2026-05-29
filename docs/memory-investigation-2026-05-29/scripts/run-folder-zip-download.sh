#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd dd
require_cmd sha256sum

VERIFY_ID="${VERIFY_ID:-V27-folder-zip-download}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6180}"
DB_PORT="${DB_PORT:-3480}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
TRACK_COUNT="${TRACK_COUNT:-2}"
TRACK_SIZE_MB="${TRACK_SIZE_MB:-64}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-0.25}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-600}"
DOWNLOAD_LIMIT_RATE="${DOWNLOAD_LIMIT_RATE:-16m}"
CONCURRENT_DOWNLOADS="${CONCURRENT_DOWNLOADS:-0}"

[[ "$TRACK_COUNT" =~ ^[0-9]+$ ]] || die "TRACK_COUNT must be numeric"
[[ "$TRACK_SIZE_MB" =~ ^[0-9]+$ ]] || die "TRACK_SIZE_MB must be numeric"
[[ "$CONCURRENT_DOWNLOADS" =~ ^[0-9]+$ ]] || die "CONCURRENT_DOWNLOADS must be numeric"
(( TRACK_COUNT >= 2 )) || die "TRACK_COUNT must be >= 2 to create a folder-based audiobook"
(( TRACK_SIZE_MB > 0 )) || die "TRACK_SIZE_MB must be > 0"

export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/books/Synthetic Audiobook"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
grimmory_image=$GRIMMORY_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
track_count=$TRACK_COUNT
track_size_mb=$TRACK_SIZE_MB
sample_interval=$SAMPLE_INTERVAL
download_limit_rate=$DOWNLOAD_LIMIT_RATE
concurrent_downloads=$CONCURRENT_DOWNLOADS
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
EOF

run_step 000-generate-fixture env \
  FIXTURE_DIR="$ARTIFACT_DIR/runtime/books/Synthetic Audiobook" \
  TRACK_COUNT="$TRACK_COUNT" \
  TRACK_SIZE_MB="$TRACK_SIZE_MB" \
  bash -lc '
set -euo pipefail
mkdir -p "$FIXTURE_DIR"
for i in $(seq -w 1 "$TRACK_COUNT"); do
  dd if=/dev/urandom of="$FIXTURE_DIR/track-${i}.mp3" bs=1M count="$TRACK_SIZE_MB" status=none
done
find "$FIXTURE_DIR" -type f -print0 | sort -z | xargs -0 sha256sum
'

COMPOSE_PROJECT="grimmorymemv27$(date -u +%Y%m%d%H%M%S)"
export COMPOSE_PROJECT

cat >"$ARTIFACT_DIR/docker/compose.yml" <<EOF
services:
  app:
    image: ${GRIMMORY_IMAGE}
    environment:
      USER_ID: "$(id -u)"
      GROUP_ID: "$(id -g)"
      DATABASE_URL: jdbc:mariadb://db:3306/grimmory
      DATABASE_USERNAME: grimmory
      DATABASE_PASSWORD: grimmory
      BOOKLORE_PORT: "6060"
      ALLOWED_ORIGINS: "*"
    ports:
      - "127.0.0.1:${APP_PORT}:6060"
    volumes:
      - ${ARTIFACT_DIR}/runtime/data:/app/data
      - ${ARTIFACT_DIR}/runtime/bookdrop:/bookdrop
      - ${ARTIFACT_DIR}/runtime/books:/books:ro
    depends_on:
      db:
        condition: service_healthy
  db:
    image: ${DB_IMAGE}
    environment:
      PUID: "$(id -u)"
      PGID: "$(id -g)"
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: grimmory
      MYSQL_USER: grimmory
      MYSQL_PASSWORD: grimmory
    ports:
      - "127.0.0.1:${DB_PORT}:3306"
    volumes:
      - ${ARTIFACT_DIR}/runtime/mysql:/config
    healthcheck:
      test: ["CMD", "mariadb-admin", "ping", "-h", "localhost", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 30
EOF

run_step 001-pull-app docker pull "$GRIMMORY_IMAGE"
run_step 002-pull-db docker pull "$DB_IMAGE"
{
  printf 'app=%s\n' "$(docker_digest "$GRIMMORY_IMAGE")"
  printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")"
} >"$ARTIFACT_DIR/docker/image-digests.txt"

run_step 010-compose-up docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" up -d

APP_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" ps -q app)"
DB_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" ps -q db)"
export APP_CONTAINER DB_CONTAINER
cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
compose_project=$COMPOSE_PROJECT
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
app_url=http://127.0.0.1:${APP_PORT}
EOF

if ! wait_http "http://127.0.0.1:${APP_PORT}/api/v1/healthcheck" 240; then
  collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
  die "App healthcheck did not become ready"
fi

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' folder-zip"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"
trap 'kill_tree "$SAMPLE_PID"' EXIT

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"
run_step 030-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Folder ZIP Verification Library",
  "paths": [
    { "path": "/books" }
  ],
  "watch": false,
  "formatPriority": ["AUDIOBOOK"],
  "allowedFormats": ["AUDIOBOOK"],
  "metadataSource": "EMBEDDED",
  "organizationMode": "BOOK_PER_FOLDER"
}
EOF

run_step 040-create-library curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/create-library.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/libraries"

start="$(date +%s)"
while true; do
  count="$(book_count "$DB_CONTAINER" "$MYSQL_ROOT_PASSWORD")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-import"
  if [[ -n "$count" && "$count" -ge 1 ]]; then
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    die "Timed out waiting for folder audiobook import"
  fi
  sleep 2
done

sleep 10
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-import-idle"

run_step 050-query-book bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select b.id, bf.id, bf.file_name, bf.file_sub_path, bf.is_folder_based, bf.file_size_kb, bf.book_type
from book b
join book_file bf on bf.book_id = b.id
where bf.is_book = true
order by b.id
limit 5;
\""

BOOK_ID="$(awk 'NR==1{print $1}' "$ARTIFACT_DIR/commands/050-query-book.stdout.log")"
[[ -n "$BOOK_ID" ]] || die "Could not determine imported book id"
printf 'book_id=%s\n' "$BOOK_ID" >>"$ARTIFACT_DIR/manifest.env"

mkdir -p "$ARTIFACT_DIR/samples/downloads"
printf 'timestamp_utc\tname\turl\tstatus\ttime_total_s\tbytes\tapp_rss_before\tapp_rss_after\tdb_rss_before\tdb_rss_after\tbooks\n' >"$ARTIFACT_DIR/samples/download-results.tsv"

download_probe() {
  local name="$1"
  local url="$2"
  local body="$ARTIFACT_DIR/samples/downloads/${name}.zip"
  local headers="$ARTIFACT_DIR/samples/downloads/${name}.headers.txt"
  local meta="$ARTIFACT_DIR/samples/downloads/${name}.meta.txt"
  local stderr="$ARTIFACT_DIR/samples/downloads/${name}.stderr.log"
  local before_app before_db after_app after_db books status time_total bytes
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-${name}"
  before_app="$(container_memory_bytes "$APP_CONTAINER")"
  before_db="$(container_memory_bytes "$DB_CONTAINER")"
  curl -sS \
    --limit-rate "$DOWNLOAD_LIMIT_RATE" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Accept-Encoding: identity' \
    -D "$headers" \
    -o "$body" \
    -w 'http_status=%{http_code}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' \
    "$url" >"$meta" 2>"$stderr" || true
  after_app="$(container_memory_bytes "$APP_CONTAINER")"
  after_db="$(container_memory_bytes "$DB_CONTAINER")"
  books="$(book_count "$DB_CONTAINER")"
  status="$(awk -F= '/^http_status=/{print $2}' "$meta")"
  time_total="$(awk -F= '/^time_total=/{print $2}' "$meta")"
  bytes="$(wc -c <"$body" | tr -d ' ')"
  sha256sum "$body" >>"$ARTIFACT_DIR/samples/sha256sums.txt"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$name" "$url" "$status" "$time_total" "$bytes" "$before_app" "$after_app" "$before_db" "$after_db" "$books" >>"$ARTIFACT_DIR/samples/download-results.tsv"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-${name}"
}

download_probe folder-download "http://127.0.0.1:${APP_PORT}/api/v1/books/${BOOK_ID}/download"
sleep 15

if (( CONCURRENT_DOWNLOADS > 1 )); then
  mkdir -p "$ARTIFACT_DIR/samples/downloads/concurrent"
  printf 'timestamp_utc\tclient\tstatus\texit_code\ttime_total_s\tbytes\tapp_rss_before\tapp_rss_after\tdb_rss_before\tdb_rss_after\tbooks\n' >"$ARTIFACT_DIR/samples/concurrent-download-results.tsv"

  concurrent_url="http://127.0.0.1:${APP_PORT}/api/v1/books/${BOOK_ID}/download"
  before_app="$(container_memory_bytes "$APP_CONTAINER")"
  before_db="$(container_memory_bytes "$DB_CONTAINER")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-concurrent-folder-downloads"

  pids=()
  for i in $(seq 1 "$CONCURRENT_DOWNLOADS"); do
    name="concurrent-folder-download-${i}"
    body="$ARTIFACT_DIR/samples/downloads/concurrent/${name}.zip"
    headers="$ARTIFACT_DIR/samples/downloads/concurrent/${name}.headers.txt"
    stdout="$ARTIFACT_DIR/commands/060-${name}.stdout.log"
    stderr="$ARTIFACT_DIR/commands/060-${name}.stderr.log"
    exit_file="$ARTIFACT_DIR/commands/060-${name}.exit"
    cmd_file="$ARTIFACT_DIR/commands/060-${name}.cmd"
    printf '%q ' curl -sS --limit-rate "$DOWNLOAD_LIMIT_RATE" -H "Authorization: Bearer <token-from-runtime/access-token.txt>" -H 'Accept-Encoding: identity' -D "$headers" -o "$body" -w 'http_status=%{http_code}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' "$concurrent_url" >"$cmd_file"
    printf '\n' >>"$cmd_file"
    (
      set +e
      curl -sS \
        --limit-rate "$DOWNLOAD_LIMIT_RATE" \
        -H "Authorization: Bearer $TOKEN" \
        -H 'Accept-Encoding: identity' \
        -D "$headers" \
        -o "$body" \
        -w 'http_status=%{http_code}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' \
        "$concurrent_url" >"$stdout" 2>"$stderr"
      printf '%s\n' "$?" >"$exit_file"
    ) &
    pids+=("$!")
  done

  for pid in "${pids[@]}"; do
    wait "$pid" || true
  done

  after_app="$(container_memory_bytes "$APP_CONTAINER")"
  after_db="$(container_memory_bytes "$DB_CONTAINER")"
  books="$(book_count "$DB_CONTAINER")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-concurrent-folder-downloads"

  for i in $(seq 1 "$CONCURRENT_DOWNLOADS"); do
    name="concurrent-folder-download-${i}"
    body="$ARTIFACT_DIR/samples/downloads/concurrent/${name}.zip"
    stdout="$ARTIFACT_DIR/commands/060-${name}.stdout.log"
    exit_file="$ARTIFACT_DIR/commands/060-${name}.exit"
    status="$(awk -F= '/^http_status=/{print $2}' "$stdout" 2>/dev/null || true)"
    time_total="$(awk -F= '/^time_total=/{print $2}' "$stdout" 2>/dev/null || true)"
    if [[ -f "$body" ]]; then
      bytes="$(wc -c <"$body" | tr -d ' ')"
      sha256sum "$body" >>"$ARTIFACT_DIR/samples/sha256sums.txt"
    else
      bytes="0"
    fi
    exit_code="$(cat "$exit_file" 2>/dev/null || true)"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$i" "$status" "$exit_code" "$time_total" "$bytes" "$before_app" "$after_app" "$before_db" "$after_db" "$books" >>"$ARTIFACT_DIR/samples/concurrent-download-results.tsv"
  done

  sleep 15
fi

download_probe download-all "http://127.0.0.1:${APP_PORT}/api/v1/books/${BOOK_ID}/download-all"
sleep 30
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-download-idle"

collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
kill_tree "$SAMPLE_PID"
SAMPLE_PID=""
run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down
run_step 095-process-audit bash -lc "pgrep -af '[s]ample_loop|[g]rimmorymemv27' || true"
run_step 096-docker-ps-final bash -lc "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort"
cp "$ARTIFACT_DIR/commands/096-docker-ps-final.stdout.log" "$ARTIFACT_DIR/docker/ps-final.txt"

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Image: ${GRIMMORY_IMAGE}
- Digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Git commit: $(git rev-parse HEAD)
- Fixture: ${TRACK_COUNT} random MP3-named tracks x ${TRACK_SIZE_MB} MiB each
- Download rate limit: ${DOWNLOAD_LIMIT_RATE}
- Concurrent folder downloads: ${CONCURRENT_DOWNLOADS}
- Book ID: ${BOOK_ID}
- Browser connected: false
- Result: folder download and download-all probes completed; see samples/download-results.tsv and samples/docker-stats.tsv.
- Artifacts: ${ARTIFACT_DIR}
- Commands: ${ARTIFACT_DIR}/commands
- Raw samples: ${ARTIFACT_DIR}/samples
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
