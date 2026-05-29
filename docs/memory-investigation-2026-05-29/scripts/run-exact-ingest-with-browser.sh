#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd node

VERIFY_ID="${VERIFY_ID:-V10-exact-ingest-with-browser}"
BOOK_FIXTURE_DIR="${BOOK_FIXTURE_DIR:-}"
TARGET_COUNT="${TARGET_COUNT:-0}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6170}"
DB_PORT="${DB_PORT:-3470}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-5}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-7200}"
BROWSER_DURATION_MS="${BROWSER_DURATION_MS:-900000}"
BROWSER_MEMORY_SAMPLE_INTERVAL_MS="${BROWSER_MEMORY_SAMPLE_INTERVAL_MS:-5000}"
BROWSER_ROUTE="${BROWSER_ROUTE:-/}"

[[ -d "$BOOK_FIXTURE_DIR" ]] || die "BOOK_FIXTURE_DIR must point to an existing directory"
[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
grimmory_image=$GRIMMORY_IMAGE
db_image=$DB_IMAGE
book_fixture_dir=$BOOK_FIXTURE_DIR
target_count=$TARGET_COUNT
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
sample_interval=$SAMPLE_INTERVAL
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
browser_duration_ms=$BROWSER_DURATION_MS
browser_memory_sample_interval_ms=$BROWSER_MEMORY_SAMPLE_INTERVAL_MS
browser_route=$BROWSER_ROUTE
EOF

COMPOSE_PROJECT="grimmorymemv10$(date -u +%Y%m%d%H%M%S)"
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
      - ${BOOK_FIXTURE_DIR}:/books:ro
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

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' ingest-with-browser"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"
trap 'kill_tree "$SAMPLE_PID"' EXIT

sleep 1
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"

run_step 030-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

run_detached_step 035-browser-probe env \
  ARTIFACT_DIR="$ARTIFACT_DIR" \
  APP_URL="http://127.0.0.1:${APP_PORT}" \
  ADMIN_USER="$ADMIN_USER" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  DURATION_MS="$BROWSER_DURATION_MS" \
  MEMORY_SAMPLE_INTERVAL_MS="$BROWSER_MEMORY_SAMPLE_INTERVAL_MS" \
  ROUTE="$BROWSER_ROUTE" \
  node "$SCRIPT_DIR/browser-probe.mjs"
BROWSER_PID="$(cat "$ARTIFACT_DIR/pids/035-browser-probe.pid")"

sleep 10
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-import-browser-connected"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Browser Connected Verification Library",
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
  count="$(book_count "$DB_CONTAINER" "$MYSQL_ROOT_PASSWORD")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-import"
  if [[ -n "$count" && "$count" -ge "$TARGET_COUNT" ]]; then
    ledger import complete "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$count" "target-count-reached"
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    ledger import timeout "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$count" "timeout"
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    die "Timed out waiting for $TARGET_COUNT books; current=$count"
  fi
  sleep 10
done

while kill -0 "$BROWSER_PID" 2>/dev/null; do
  if [[ -f "$ARTIFACT_DIR/commands/035-browser-probe.exit" ]]; then
    break
  fi
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "waiting-browser-probe"
  sleep 10
done

sleep 15
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-import-browser-idle"
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"

run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Image: ${GRIMMORY_IMAGE}
- Digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Git commit: $(git rev-parse HEAD)
- Dataset: ${BOOK_FIXTURE_DIR}
- Dataset file count: $(find "$BOOK_FIXTURE_DIR" -type f | wc -l | tr -d ' ')
- Browser connected: true
- Browser duration: ${BROWSER_DURATION_MS}ms
- Java options: production image defaults
- Container memory limits: none explicit
- End time: $(ts_utc)
- Result: imported target count with browser probe running
- Evidence summary: see samples/docker-stats.tsv, samples/db-counts.tsv, samples/browser/websocket.jsonl, samples/browser/memory-samples.jsonl, logs/app.log
- Artifacts: ${ARTIFACT_DIR}
- Commands: ${ARTIFACT_DIR}/commands
- Raw samples: ${ARTIFACT_DIR}/samples
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
