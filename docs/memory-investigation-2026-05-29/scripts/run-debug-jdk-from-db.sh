#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq

VERIFY_ID="${VERIFY_ID:-V00-debug-jdk-from-db}"
SOURCE_DB_DIR="${SOURCE_DB_DIR:-}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
JDK_IMAGE="${JDK_IMAGE:-eclipse-temurin:25-jdk-alpine}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6260}"
DB_PORT="${DB_PORT:-3566}"
MYSQL_USER="${MYSQL_USER:-grimmory}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-grimmory}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"

[[ -d "$SOURCE_DB_DIR" ]] || die "SOURCE_DB_DIR must point to an existing database directory"

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
export ARTIFACT_DIR MYSQL_USER MYSQL_PASSWORD MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/app"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_db_dir=$SOURCE_DB_DIR
grimmory_image=$GRIMMORY_IMAGE
jdk_image=$JDK_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
EOF

COMPOSE_PROJECT="grimmorydbg$(date -u +%Y%m%d%H%M%S)"
export COMPOSE_PROJECT

run_step 001-pull-app docker pull "$GRIMMORY_IMAGE"
run_step 002-pull-jdk docker pull "$JDK_IMAGE"
run_step 003-pull-db docker pull "$DB_IMAGE"

{
  printf 'app_source=%s\n' "$(docker_digest "$GRIMMORY_IMAGE")"
  printf 'jdk=%s\n' "$(docker_digest "$JDK_IMAGE")"
  printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")"
} >"$ARTIFACT_DIR/docker/image-digests.txt"

run_step 010-copy-db cp -a "$SOURCE_DB_DIR/." "$ARTIFACT_DIR/runtime/mysql/"

SOURCE_CONTAINER="extract-$(date -u +%Y%m%d%H%M%S)-$$"
run_step 020-create-extract-container docker create --name "$SOURCE_CONTAINER" "$GRIMMORY_IMAGE"
run_step 021-copy-app-jar docker cp "$SOURCE_CONTAINER:/app/app.jar" "$ARTIFACT_DIR/runtime/app/app.jar"
run_step 022-remove-extract-container docker rm "$SOURCE_CONTAINER"

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

run_step 030-compose-up docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" up -d

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

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "debug-ready"
docker exec "$APP_CONTAINER" jcmd 1 GC.heap_info >"$ARTIFACT_DIR/samples/heap-info-ready.txt" 2>"$ARTIFACT_DIR/samples/heap-info-ready.stderr" || true
docker exec "$APP_CONTAINER" jcmd 1 VM.native_memory summary >"$ARTIFACT_DIR/samples/nmt-summary-ready.txt" 2>"$ARTIFACT_DIR/samples/nmt-summary-ready.stderr" || true
docker exec "$APP_CONTAINER" jcmd 1 GC.class_histogram >"$ARTIFACT_DIR/samples/class-histogram-ready.txt" 2>"$ARTIFACT_DIR/samples/class-histogram-ready.stderr" || true
db_counts "$DB_CONTAINER" >"$ARTIFACT_DIR/samples/db-counts.tsv" || true
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"

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
- Source DB dir: ${SOURCE_DB_DIR}
- Git commit: $(git rev-parse HEAD)
- App URL: http://127.0.0.1:${APP_PORT}
- Result: debug JDK app ready with NMT enabled
- Artifacts: ${ARTIFACT_DIR}
- Follow-up: run endpoint probes and JFR against this app before cleanup
EOF

printf '%s\n' "$ARTIFACT_DIR"
