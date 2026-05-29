#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd sha256sum

VERIFY_ID="${VERIFY_ID:-V23-recommendation-task}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
SOURCE_BOOK_DIR="${SOURCE_BOOK_DIR:-/home/alex/Projects/book-apps-benchmark/books/books_10K}"
SUBSET_COUNT="${SUBSET_COUNT:-1000}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6200}"
DB_PORT="${DB_PORT:-3500}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-1200}"
TASK_TIMEOUT_SECONDS="${TASK_TIMEOUT_SECONDS:-1800}"

[[ -d "$SOURCE_BOOK_DIR" ]] || die "SOURCE_BOOK_DIR must point to an existing directory"
[[ "$SUBSET_COUNT" =~ ^[0-9]+$ ]] || die "SUBSET_COUNT must be numeric"
(( SUBSET_COUNT > 0 )) || die "SUBSET_COUNT must be > 0"

export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/books"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_book_dir=$SOURCE_BOOK_DIR
subset_count=$SUBSET_COUNT
grimmory_image=$GRIMMORY_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
sample_interval=$SAMPLE_INTERVAL
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
task_timeout_seconds=$TASK_TIMEOUT_SECONDS
EOF

COMPOSE_PROJECT="grimmorymemv23$(date -u +%Y%m%d%H%M%S)"
export COMPOSE_PROJECT
APP_CONTAINER=""
DB_CONTAINER=""
SAMPLE_PID=""
CLEANED_UP=0

cleanup() {
  set +e
  [[ -n "$SAMPLE_PID" ]] && kill_tree "$SAMPLE_PID"
  if [[ "$CLEANED_UP" != "1" ]]; then
    if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
      collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    fi
    if [[ -f "$ARTIFACT_DIR/docker/compose.yml" ]]; then
      docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stdout.log" 2>"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stderr.log"
      printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.exit"
    fi
  fi
}
trap cleanup EXIT

run_step 000-build-subset env \
  SOURCE_BOOK_DIR="$SOURCE_BOOK_DIR" \
  TARGET_BOOK_DIR="$ARTIFACT_DIR/runtime/books" \
  SUBSET_COUNT="$SUBSET_COUNT" \
  bash -lc '
set -euo pipefail
list_file="$TARGET_BOOK_DIR/source-files.list0"
find "$SOURCE_BOOK_DIR" -type f -name "*.epub" -print0 | sort -z > "$list_file"
count=0
while IFS= read -r -d "" src; do
  count=$((count + 1))
  target="$TARGET_BOOK_DIR/book-$(printf "%05d" "$count").epub"
  ln "$src" "$target" 2>/dev/null || cp "$src" "$target"
  if [ "$count" -ge "$SUBSET_COUNT" ]; then
    break
  fi
done < "$list_file"
[ "$count" -eq "$SUBSET_COUNT" ] || { echo "Only prepared $count files" >&2; exit 1; }
find "$TARGET_BOOK_DIR" -maxdepth 1 -type f -name "*.epub" -print0 | sort -z | xargs -0 sha256sum
'

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
  die "App healthcheck did not become ready"
fi

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' recommendation-task"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"
run_step 030-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Recommendation Verification Library",
  "paths": [
    { "path": "/books" }
  ],
  "watch": false,
  "formatPriority": ["EPUB"],
  "allowedFormats": ["EPUB"],
  "metadataSource": "EMBEDDED",
  "organizationMode": "BOOK_PER_FILE"
}
EOF

run_step 040-create-library curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/create-library.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/libraries"

start="$(date +%s)"
while true; do
  count="$(book_count "$DB_CONTAINER")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-import"
  if [[ -n "$count" && "$count" -ge "$SUBSET_COUNT" ]]; then
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    die "Timed out waiting for $SUBSET_COUNT imported books; current=$count"
  fi
  sleep 5
done

sleep 15
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-import-idle"

cat >"$ARTIFACT_DIR/runtime/start-task.json" <<'EOF'
{
  "taskType": "UPDATE_BOOK_RECOMMENDATIONS",
  "options": null
}
EOF

run_step 050-start-recommendation-task curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/start-task.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/tasks/start"

TASK_ID="$(jq -r '.taskId // empty' "$ARTIFACT_DIR/commands/050-start-recommendation-task.stdout.log")"
[[ -n "$TASK_ID" ]] || die "Could not parse recommendation task id"
printf 'task_id=%s\n' "$TASK_ID" >>"$ARTIFACT_DIR/manifest.env"

printf 'timestamp_utc\tstatus\tprogress\tmessage\tapp_rss_bytes\tdb_rss_bytes\tbooks\n' >"$ARTIFACT_DIR/samples/task-status.tsv"
task_start="$(date +%s)"
while true; do
  row="$(docker exec "$DB_CONTAINER" mariadb -ugrimmory -pgrimmory -N -B grimmory -e "select status, coalesce(progress_percentage,''), coalesce(message,'') from tasks where id = '${TASK_ID}'" 2>/dev/null || true)"
  status="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $1}')"
  progress="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $2}')"
  message="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $3}')"
  app_rss="$(container_memory_bytes "$APP_CONTAINER")"
  db_rss="$(container_memory_bytes "$DB_CONTAINER")"
  books="$(book_count "$DB_CONTAINER")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$status" "$progress" "$message" "$app_rss" "$db_rss" "$books" >>"$ARTIFACT_DIR/samples/task-status.tsv"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-recommendation-${status:-unknown}"
  if [[ "$status" == "COMPLETED" || "$status" == "FAILED" || "$status" == "CANCELLED" ]]; then
    break
  fi
  if (( $(date +%s) - task_start >= TASK_TIMEOUT_SECONDS )); then
    die "Timed out waiting for recommendation task $TASK_ID; status=$status progress=$progress"
  fi
  sleep 5
done

run_step 060-query-recommendation-results bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'embedding_vector_not_null', count(*) from book_metadata where embedding_vector is not null
union all select 'similar_books_not_null', count(*) from book where similar_books_json is not null
union all select 'task_status_completed', count(*) from tasks where id = '${TASK_ID}' and status = 'COMPLETED';
\""

sleep 15
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-task-idle"
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
kill_tree "$SAMPLE_PID"
SAMPLE_PID=""
run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down
run_step 095-process-audit bash -lc "pgrep -af '[s]ample_loop|[g]rimmorymemv23' || true"
run_step 096-docker-ps-final bash -lc "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort"
cp "$ARTIFACT_DIR/commands/096-docker-ps-final.stdout.log" "$ARTIFACT_DIR/docker/ps-final.txt"
CLEANED_UP=1

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Image: ${GRIMMORY_IMAGE}
- Digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Git commit: $(git rev-parse HEAD)
- Source book dir: ${SOURCE_BOOK_DIR}
- Subset count: ${SUBSET_COUNT}
- Task ID: ${TASK_ID}
- Browser connected: false
- Result: recommendation task reached status ${status:-unknown}; see samples/task-status.tsv and samples/docker-stats.tsv.
- Artifacts: ${ARTIFACT_DIR}
- Commands: ${ARTIFACT_DIR}/commands
- Raw samples: ${ARTIFACT_DIR}/samples
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
