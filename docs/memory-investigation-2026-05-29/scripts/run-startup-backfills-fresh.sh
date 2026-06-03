#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd rg

VERIFY_ID="${VERIFY_ID:-V32-startup-backfills-fresh}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
BOOK_FIXTURE_DIR="${BOOK_FIXTURE_DIR:-/home/alex/Projects/book-apps-benchmark/books/books_10K}"
TARGET_COUNT="${TARGET_COUNT:-10000}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6220}"
DB_PORT="${DB_PORT:-3520}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-3600}"
STARTUP_BACKFILL_TIMEOUT_SECONDS="${STARTUP_BACKFILL_TIMEOUT_SECONDS:-3600}"
COPY_FIXTURES_TO_CONTAINER="${COPY_FIXTURES_TO_CONTAINER:-0}"

[[ -d "$BOOK_FIXTURE_DIR" ]] || die "BOOK_FIXTURE_DIR must point to an existing directory"
[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"

export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
book_fixture_dir=$BOOK_FIXTURE_DIR
target_count=$TARGET_COUNT
grimmory_image=$GRIMMORY_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
sample_interval=$SAMPLE_INTERVAL
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
startup_backfill_timeout_seconds=$STARTUP_BACKFILL_TIMEOUT_SECONDS
copy_fixtures_to_container=$COPY_FIXTURES_TO_CONTAINER
EOF

COMPOSE_PROJECT="grimmorymemv32fresh$(date -u +%Y%m%d%H%M%S)"
BOOKS_VOLUME_YAML="      - ${BOOK_FIXTURE_DIR}:/books:ro"
if [[ "$COPY_FIXTURES_TO_CONTAINER" == "1" ]]; then
  BOOKS_VOLUME_YAML=""
fi
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
      docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stdout.log" 2>"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stderr.log" || true
      printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.exit"
    fi
  fi
}
trap cleanup EXIT

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
${BOOKS_VOLUME_YAML}
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

prepare_book_fixtures "$APP_CONTAINER" "$BOOK_FIXTURE_DIR" "$TARGET_COUNT" "$COPY_FIXTURES_TO_CONTAINER"

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' startup-backfills-fresh"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"
run_step 030-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Startup Backfill Verification Library",
  "paths": [
    { "path": "/books" }
  ],
  "watch": false,
  "formatPriority": ["EPUB", "PDF", "CBX", "FB2", "MOBI", "AZW3", "AUDIOBOOK"],
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
  if [[ -n "$count" && "$count" -ge "$TARGET_COUNT" ]]; then
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    die "Timed out waiting for $TARGET_COUNT imported books; current=$count"
  fi
  sleep 5
done

sleep 20
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-import-idle"

run_step 050-query-before-backfill bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'book_files', count(*) from book_file
union all select 'app_migrations', count(*) from app_migration;
\""

run_step 060-delete-heavy-app-migrations bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory grimmory -e \"
delete from app_migration
where migration_key in (
  'populateFileSizes',
  'populateMetadataScores_v2',
  'populateFileHashesV2',
  'populateSearchText',
  'generateCoverHash'
);
\""

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-startup-backfill-restart"
run_step 070-restart-app docker restart "$APP_CONTAINER"

startup_start="$(date +%s)"
while true; do
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-startup-backfills"
  docker logs "$APP_CONTAINER" --since 30m >"$ARTIFACT_DIR/logs/startup-backfills.log" 2>"$ARTIFACT_DIR/logs/startup-backfills.stderr.log" || true
  completed=0
  rg -q "Migration 'populateFileSizes' executed successfully" "$ARTIFACT_DIR/logs/startup-backfills.log" && completed=$((completed + 1))
  rg -q "Migration 'populateMetadataScores_v2' applied" "$ARTIFACT_DIR/logs/startup-backfills.log" && completed=$((completed + 1))
  rg -q "Migration 'populateFileHashesV2' applied" "$ARTIFACT_DIR/logs/startup-backfills.log" && completed=$((completed + 1))
  rg -q "Completed migration 'populateSearchText'" "$ARTIFACT_DIR/logs/startup-backfills.log" && completed=$((completed + 1))
  rg -q "Completed migration 'generateCoverHash'" "$ARTIFACT_DIR/logs/startup-backfills.log" && completed=$((completed + 1))
  if (( completed >= 5 )) && curl -fsS "http://127.0.0.1:${APP_PORT}/api/v1/healthcheck" >/dev/null 2>&1; then
    break
  fi
  if (( $(date +%s) - startup_start >= STARTUP_BACKFILL_TIMEOUT_SECONDS )); then
    die "Timed out waiting for startup backfill migrations; completed markers=$completed"
  fi
  sleep 5
done

sleep 30
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-startup-backfills-idle"

run_step 080-query-after-backfill bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'book_files', count(*) from book_file
union all select 'app_migrations', count(*) from app_migration;
\""

collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
kill_tree "$SAMPLE_PID"
SAMPLE_PID=""
run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down
run_step 095-process-audit bash -lc "pgrep -af '[s]ample_loop|[g]rimmorymemv32fresh' || true"
run_step 096-docker-ps-final bash -lc "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort"
CLEANED_UP=1

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Image: ${GRIMMORY_IMAGE}
- Digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Dataset: ${BOOK_FIXTURE_DIR}
- Imported target count: ${TARGET_COUNT}
- Result: imported fresh 10K library, deleted startup migration markers, restarted app, and waited for startup backfills.
- Artifacts: ${ARTIFACT_DIR}
EOF

printf '%s\n' "$ARTIFACT_DIR"
