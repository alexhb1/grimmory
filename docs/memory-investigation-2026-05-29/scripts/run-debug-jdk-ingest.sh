#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq

VERIFY_ID="${VERIFY_ID:-V09-debug-jdk-ingest}"
BOOK_FIXTURE_DIR="${BOOK_FIXTURE_DIR:-}"
TARGET_COUNT="${TARGET_COUNT:-0}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
JDK_IMAGE="${JDK_IMAGE:-eclipse-temurin:25-jdk-alpine}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6280}"
DB_PORT="${DB_PORT:-3580}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
MYSQL_USER="${MYSQL_USER:-grimmory}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-5}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-7200}"
POST_TARGET_SECONDS="${POST_TARGET_SECONDS:-30}"
JFR_NAME="${JFR_NAME:-ingest_debug}"
JFR_FILE="${JFR_FILE:-jfr-${VERIFY_ID}.jfr}"
JFR_CONTAINER_PATH="/tmp/${JFR_FILE}"

[[ -d "$BOOK_FIXTURE_DIR" ]] || die "BOOK_FIXTURE_DIR must point to an existing directory"
[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
export ARTIFACT_DIR MYSQL_ROOT_PASSWORD MYSQL_USER MYSQL_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/app"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
grimmory_image=$GRIMMORY_IMAGE
jdk_image=$JDK_IMAGE
db_image=$DB_IMAGE
book_fixture_dir=$BOOK_FIXTURE_DIR
target_count=$TARGET_COUNT
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
sample_interval=$SAMPLE_INTERVAL
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
post_target_seconds=$POST_TARGET_SECONDS
jfr_name=$JFR_NAME
jfr_file=$JFR_FILE
jfr_container_path=$JFR_CONTAINER_PATH
EOF

COMPOSE_PROJECT="grimmorydbgimport$(date -u +%Y%m%d%H%M%S)"
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

run_optional_view() {
  local name="$1"
  local view="$2"
  run_step "$name" sh -c "docker exec '$APP_CONTAINER' jfr view --width 180 '$view' '$JFR_CONTAINER_PATH' || true"
}

run_step 001-pull-app docker pull "$GRIMMORY_IMAGE"
run_step 002-pull-jdk docker pull "$JDK_IMAGE"
run_step 003-pull-db docker pull "$DB_IMAGE"

{
  printf 'app_source=%s\n' "$(docker_digest "$GRIMMORY_IMAGE")"
  printf 'jdk=%s\n' "$(docker_digest "$JDK_IMAGE")"
  printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")"
} >"$ARTIFACT_DIR/docker/image-digests.txt"

SOURCE_CONTAINER="extract-$(date -u +%Y%m%d%H%M%S)-$$"
run_step 010-create-extract-container docker create --name "$SOURCE_CONTAINER" "$GRIMMORY_IMAGE"
run_step 011-copy-app-jar docker cp "$SOURCE_CONTAINER:/app/app.jar" "$ARTIFACT_DIR/runtime/app/app.jar"
run_step 012-remove-extract-container docker rm "$SOURCE_CONTAINER"

cat >"$ARTIFACT_DIR/docker/compose.yml" <<EOF
services:
  app:
    image: ${JDK_IMAGE}
    user: "0:0"
    working_dir: /app
    command: >
      sh -c "apk add --no-cache libstdc++ libgcc libarchive >/tmp/apk.log &&
      ln -sf /usr/lib/libarchive.so.13 /usr/lib/libarchive.so &&
      java
      -XX:+UseShenandoahGC
      -XX:ShenandoahGCHeuristics=compact
      -XX:+UseCompactObjectHeaders
      -XX:MaxRAMPercentage=60.0
      -XX:InitialRAMPercentage=8.0
      -XX:+ExitOnOutOfMemoryError
      -XX:+HeapDumpOnOutOfMemoryError
      -XX:HeapDumpPath=/tmp/heapdump.hprof
      -XX:MaxMetaspaceSize=256m
      -XX:ReservedCodeCacheSize=48m
      -Xss512k
      -XX:CICompilerCount=2
      -XX:+UnlockExperimentalVMOptions
      -XX:+UseStringDeduplication
      -XX:ShenandoahUncommitDelay=5000
      -XX:ShenandoahGuaranteedGCInterval=30000
      -XX:MaxDirectMemorySize=256m
      -XX:NativeMemoryTracking=summary
      --enable-native-access=ALL-UNNAMED
      --enable-preview
      -jar /app/app.jar"
    environment:
      DATABASE_URL: jdbc:mariadb://db:3306/grimmory
      DATABASE_USERNAME: ${MYSQL_USER}
      DATABASE_PASSWORD: ${MYSQL_PASSWORD}
      BOOKLORE_PORT: "6060"
      ALLOWED_ORIGINS: "*"
    ports:
      - "127.0.0.1:${APP_PORT}:6060"
    volumes:
      - ${ARTIFACT_DIR}/runtime/app/app.jar:/app/app.jar:ro
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
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
    ports:
      - "127.0.0.1:${DB_PORT}:3306"
    volumes:
      - ${ARTIFACT_DIR}/runtime/mysql:/config
    healthcheck:
      test: ["CMD", "mariadb-admin", "ping", "-h", "localhost", "-u${MYSQL_USER}", "-p${MYSQL_PASSWORD}"]
      interval: 5s
      timeout: 5s
      retries: 30
EOF

run_step 020-compose-up docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" up -d

APP_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" ps -q app)"
DB_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" ps -q db)"
export APP_CONTAINER DB_CONTAINER
cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
compose_project=$COMPOSE_PROJECT
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
app_url=http://127.0.0.1:${APP_PORT}
EOF

if ! wait_http "http://127.0.0.1:${APP_PORT}/api/v1/healthcheck" 300; then
  collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
  die "Debug app healthcheck did not become ready"
fi

run_detached_step 030-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' MYSQL_USER='$MYSQL_USER' MYSQL_PASSWORD='$MYSQL_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' debug-ingest"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/030-sample-loop.pid")"

sleep 1
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"
run_step 040-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

run_step 050-pre-gc docker exec "$APP_CONTAINER" jcmd 1 GC.run
run_step 051-pre-snapshot env ARTIFACT_DIR="$ARTIFACT_DIR" APP_CONTAINER="$APP_CONTAINER" LABEL=pre "$SCRIPT_DIR/jvm-snapshot.sh"

run_step 060-jfr-start docker exec "$APP_CONTAINER" jcmd 1 JFR.start \
  "name=$JFR_NAME" \
  settings=profile \
  exceptions=all \
  allocation-profiling=high \
  gc=detailed \
  method-profiling=high \
  disk=true \
  "filename=$JFR_CONTAINER_PATH"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Debug JDK Ingest Verification Library",
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

run_step 070-create-library curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/create-library.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/libraries"

start="$(date +%s)"
while true; do
  count="$(book_count "$DB_CONTAINER")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-import"
  if [[ -n "$count" && "$count" -ge "$TARGET_COUNT" ]]; then
    ledger import complete "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$count" "target-count-reached"
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    ledger import timeout "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$count" "timeout"
    die "Timed out waiting for $TARGET_COUNT books; current=$count"
  fi
  sleep 10
done

sleep "$POST_TARGET_SECONDS"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-target-${POST_TARGET_SECONDS}s"

run_step 080-jfr-stop docker exec "$APP_CONTAINER" jcmd 1 JFR.stop "name=$JFR_NAME"
run_step 081-copy-jfr docker cp "$APP_CONTAINER:$JFR_CONTAINER_PATH" "$ARTIFACT_DIR/samples/$JFR_FILE"

run_step 090-post-gc docker exec "$APP_CONTAINER" jcmd 1 GC.run
run_step 091-post-snapshot env ARTIFACT_DIR="$ARTIFACT_DIR" APP_CONTAINER="$APP_CONTAINER" LABEL=post "$SCRIPT_DIR/jvm-snapshot.sh"

run_step 100-jfr-summary docker exec "$APP_CONTAINER" jfr summary "$JFR_CONTAINER_PATH"
run_optional_view 101-jfr-events-by-count events-by-count
run_optional_view 102-jfr-allocation-by-class allocation-by-class
run_optional_view 103-jfr-allocation-by-site allocation-by-site
run_optional_view 104-jfr-hot-methods hot-methods
run_optional_view 105-jfr-exception-count exception-count
run_optional_view 106-jfr-exception-by-type exception-by-type
run_optional_view 107-jfr-exception-by-site exception-by-site
run_optional_view 108-jfr-exception-by-message exception-by-message
run_optional_view 109-jfr-gc gc
run_optional_view 110-jfr-gc-pauses gc-pauses
run_optional_view 111-jfr-native-memory-committed native-memory-committed

mkdir -p "$ARTIFACT_DIR/summaries"
cp "$ARTIFACT_DIR/commands/100-jfr-summary.stdout.log" "$ARTIFACT_DIR/summaries/jfr-summary.txt"
cp "$ARTIFACT_DIR/commands/101-jfr-events-by-count.stdout.log" "$ARTIFACT_DIR/summaries/jfr-events-by-count.txt"
cp "$ARTIFACT_DIR/commands/102-jfr-allocation-by-class.stdout.log" "$ARTIFACT_DIR/summaries/jfr-allocation-by-class.txt"
cp "$ARTIFACT_DIR/commands/103-jfr-allocation-by-site.stdout.log" "$ARTIFACT_DIR/summaries/jfr-allocation-by-site.txt"
cp "$ARTIFACT_DIR/commands/104-jfr-hot-methods.stdout.log" "$ARTIFACT_DIR/summaries/jfr-hot-methods.txt"
cp "$ARTIFACT_DIR/commands/105-jfr-exception-count.stdout.log" "$ARTIFACT_DIR/summaries/jfr-exception-count.txt"
cp "$ARTIFACT_DIR/commands/106-jfr-exception-by-type.stdout.log" "$ARTIFACT_DIR/summaries/jfr-exception-by-type.txt"
cp "$ARTIFACT_DIR/commands/107-jfr-exception-by-site.stdout.log" "$ARTIFACT_DIR/summaries/jfr-exception-by-site.txt"
cp "$ARTIFACT_DIR/commands/108-jfr-exception-by-message.stdout.log" "$ARTIFACT_DIR/summaries/jfr-exception-by-message.txt"
cp "$ARTIFACT_DIR/commands/109-jfr-gc.stdout.log" "$ARTIFACT_DIR/summaries/jfr-gc.txt"
cp "$ARTIFACT_DIR/commands/110-jfr-gc-pauses.stdout.log" "$ARTIFACT_DIR/summaries/jfr-gc-pauses.txt"
cp "$ARTIFACT_DIR/commands/111-jfr-native-memory-committed.stdout.log" "$ARTIFACT_DIR/summaries/jfr-native-memory-committed.txt"

collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
grep -c 'TOC_INVALID' "$ARTIFACT_DIR/logs/app.log" >"$ARTIFACT_DIR/summaries/toc-invalid-count.txt" 2>/dev/null || true
grep -c 'Processing file:' "$ARTIFACT_DIR/logs/app.log" >"$ARTIFACT_DIR/summaries/processing-file-count.txt" 2>/dev/null || true
grep -c 'No cover image found' "$ARTIFACT_DIR/logs/app.log" >"$ARTIFACT_DIR/summaries/no-cover-count.txt" 2>/dev/null || true
run_step 990-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down
CLEANED_UP=1
kill_tree "$SAMPLE_PID"

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: B
- Image source: ${GRIMMORY_IMAGE}
- Image source digest: $(grep '^app_source=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- JDK image: ${JDK_IMAGE}
- JDK digest: $(grep '^jdk=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Git commit: $(git rev-parse HEAD)
- Dataset: ${BOOK_FIXTURE_DIR}
- Dataset file count: $(find "$BOOK_FIXTURE_DIR" -type f | wc -l | tr -d ' ')
- Target count: ${TARGET_COUNT}
- Java options: production nightly JVM flags plus NativeMemoryTracking=summary; app jar extracted from the nightly image.
- JFR settings: profile with exceptions=all, allocation-profiling=high, gc=detailed, method-profiling=high.
- Container memory limits: none explicit.
- End time: $(ts_utc)
- Result: imported ${TARGET_COUNT} target books or more under debug JDK instrumentation.
- Evidence summary: see samples/docker-stats.tsv, samples/db-counts.tsv, samples/nmt-summary-pre.txt, samples/nmt-summary-post.txt, summaries/*.txt, logs/app.log.
- JFR: samples/${JFR_FILE}
- Artifacts: ${ARTIFACT_DIR}
- Commands: ${ARTIFACT_DIR}/commands
- Raw samples: ${ARTIFACT_DIR}/samples
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
