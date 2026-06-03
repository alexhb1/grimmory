#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd node

VERIFY_ID="${VERIFY_ID:-V42-huge-browser-idle-50k}"
SOURCE_ARTIFACT_DIR="${SOURCE_ARTIFACT_DIR:-}"
SOURCE_DB_DIR="${SOURCE_DB_DIR:-}"
SOURCE_DATA_DIR="${SOURCE_DATA_DIR:-}"
TARGET_COUNT="${TARGET_COUNT:-50000}"
RUN_MODE="${RUN_MODE:-exact}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
JDK_IMAGE="${JDK_IMAGE:-eclipse-temurin:25-jdk-alpine}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6400}"
DB_PORT="${DB_PORT:-3716}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_USER="${MYSQL_USER:-grimmory}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-grimmory}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-5}"
BROWSER_ROUTE="${BROWSER_ROUTE:-/all-books?view=grid&fmode=and}"
BROWSER_DURATION_MS="${BROWSER_DURATION_MS:-300000}"
BROWSER_MEMORY_SAMPLE_INTERVAL_MS="${BROWSER_MEMORY_SAMPLE_INTERVAL_MS:-5000}"
BROWSER_CLIENTS="${BROWSER_CLIENTS:-1}"
BROWSER_START_SPACING_SECONDS="${BROWSER_START_SPACING_SECONDS:-2}"
BROWSER_WAIT_GRACE_SECONDS="${BROWSER_WAIT_GRACE_SECONDS:-300}"
TAKE_HEAP_SNAPSHOT="${TAKE_HEAP_SNAPSHOT:-}"
POST_BROWSER_IDLE_SECONDS="${POST_BROWSER_IDLE_SECONDS:-120}"
JAVA_TOOL_OPTIONS_OVERRIDE="${JAVA_TOOL_OPTIONS_OVERRIDE:-}"
FORCE_GC_AFTER_BROWSER="${FORCE_GC_AFTER_BROWSER:-0}"
POST_GC_SETTLE_SECONDS="${POST_GC_SETTLE_SECONDS:-30}"

[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
[[ "$BROWSER_CLIENTS" =~ ^[0-9]+$ ]] || die "BROWSER_CLIENTS must be numeric"
[[ "$BROWSER_START_SPACING_SECONDS" =~ ^[0-9]+$ ]] || die "BROWSER_START_SPACING_SECONDS must be numeric"
[[ "$BROWSER_WAIT_GRACE_SECONDS" =~ ^[0-9]+$ ]] || die "BROWSER_WAIT_GRACE_SECONDS must be numeric"
[[ "$POST_GC_SETTLE_SECONDS" =~ ^[0-9]+$ ]] || die "POST_GC_SETTLE_SECONDS must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"
(( BROWSER_CLIENTS > 0 )) || die "BROWSER_CLIENTS must be > 0"
[[ "$RUN_MODE" == "exact" || "$RUN_MODE" == "debug-jdk" ]] || die "RUN_MODE must be exact or debug-jdk"

if [[ -z "$TAKE_HEAP_SNAPSHOT" ]]; then
  if (( BROWSER_CLIENTS == 1 )); then
    TAKE_HEAP_SNAPSHOT=1
  else
    TAKE_HEAP_SNAPSHOT=0
  fi
fi

if [[ -n "$SOURCE_ARTIFACT_DIR" ]]; then
  SOURCE_DB_DIR="${SOURCE_DB_DIR:-$SOURCE_ARTIFACT_DIR/runtime/mysql}"
  SOURCE_DATA_DIR="${SOURCE_DATA_DIR:-$SOURCE_ARTIFACT_DIR/runtime/data}"
fi

[[ -d "$SOURCE_DB_DIR" ]] || die "SOURCE_DB_DIR must point to an existing MariaDB /config directory"
if [[ -n "$SOURCE_DATA_DIR" && ! -d "$SOURCE_DATA_DIR" ]]; then
  die "SOURCE_DATA_DIR was set but does not exist: $SOURCE_DATA_DIR"
fi

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
export ARTIFACT_DIR MYSQL_USER MYSQL_PASSWORD MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/app"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_artifact_dir=$SOURCE_ARTIFACT_DIR
source_db_dir=$SOURCE_DB_DIR
source_data_dir=$SOURCE_DATA_DIR
target_count=$TARGET_COUNT
run_mode=$RUN_MODE
grimmory_image=$GRIMMORY_IMAGE
jdk_image=$JDK_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
sample_interval=$SAMPLE_INTERVAL
browser_route=$BROWSER_ROUTE
browser_duration_ms=$BROWSER_DURATION_MS
browser_memory_sample_interval_ms=$BROWSER_MEMORY_SAMPLE_INTERVAL_MS
browser_clients=$BROWSER_CLIENTS
browser_start_spacing_seconds=$BROWSER_START_SPACING_SECONDS
browser_wait_grace_seconds=$BROWSER_WAIT_GRACE_SECONDS
take_heap_snapshot=$TAKE_HEAP_SNAPSHOT
post_browser_idle_seconds=$POST_BROWSER_IDLE_SECONDS
java_tool_options_override=${JAVA_TOOL_OPTIONS_OVERRIDE:-image-default}
force_gc_after_browser=$FORCE_GC_AFTER_BROWSER
post_gc_settle_seconds=$POST_GC_SETTLE_SECONDS
EOF

COMPOSE_PROJECT="grimmorybrowseridle$(date -u +%Y%m%d%H%M%S)"
APP_CONTAINER=""
DB_CONTAINER=""
SAMPLE_PID=""
CLI_STATS_PID=""
COLLECTED_EVIDENCE=0
declare -a BROWSER_STEP_NAMES=()
declare -a BROWSER_PIDS=()
declare -a BROWSER_ARTIFACT_DIRS=()

extract_app_jar_for_debug() {
  local source_container="extract-browser-idle-$(date -u +%Y%m%d%H%M%S)-$$"
  run_step 003-create-extract-container docker create --name "$source_container" "$GRIMMORY_IMAGE"
  run_step 004-copy-app-jar docker cp "$source_container:/app/app.jar" "$ARTIFACT_DIR/runtime/app/app.jar"
  run_step 005-remove-extract-container docker rm "$source_container"
}

capture_jvm_snapshot() {
  local label="$1"
  local jcmd_path
  [[ -n "$APP_CONTAINER" ]] || return 0
  jcmd_path="$(docker exec "$APP_CONTAINER" sh -lc 'command -v jcmd 2>/dev/null || test -x /opt/java/openjdk/bin/jcmd && printf "%s\n" /opt/java/openjdk/bin/jcmd' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$jcmd_path" ]]; then
    printf 'jcmd unavailable in this container\n' >"$ARTIFACT_DIR/samples/jvm-snapshot-${label}.txt"
    return 0
  fi

  printf '%s\n' "$jcmd_path" >"$ARTIFACT_DIR/samples/jcmd-path-${label}.txt"
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 help >"$ARTIFACT_DIR/samples/jcmd-help-${label}.txt" 2>"$ARTIFACT_DIR/samples/jcmd-help-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 VM.flags >"$ARTIFACT_DIR/samples/vm-flags-${label}.txt" 2>"$ARTIFACT_DIR/samples/vm-flags-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.heap_info >"$ARTIFACT_DIR/samples/heap-info-${label}.txt" 2>"$ARTIFACT_DIR/samples/heap-info-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 VM.native_memory summary >"$ARTIFACT_DIR/samples/nmt-summary-${label}.txt" 2>"$ARTIFACT_DIR/samples/nmt-summary-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.class_histogram >"$ARTIFACT_DIR/samples/class-histogram-${label}.txt" 2>"$ARTIFACT_DIR/samples/class-histogram-${label}.stderr" || true
}

force_gc_and_snapshot() {
  local label="$1"
  local jcmd_path
  [[ -n "$APP_CONTAINER" ]] || return 0
  jcmd_path="$(docker exec "$APP_CONTAINER" sh -lc 'command -v jcmd 2>/dev/null || test -x /opt/java/openjdk/bin/jcmd && printf "%s\n" /opt/java/openjdk/bin/jcmd' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$jcmd_path" ]]; then
    printf 'jcmd unavailable in this container\n' >"$ARTIFACT_DIR/samples/gc-run-${label}.txt"
    return 0
  fi

  docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.run >"$ARTIFACT_DIR/samples/gc-run-${label}.txt" 2>"$ARTIFACT_DIR/samples/gc-run-${label}.stderr" || true
  sleep "$POST_GC_SETTLE_SECONDS"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "$label"
  capture_jvm_snapshot "$label"
  capture_memory_snapshots "$label"
}

capture_container_memory_snapshot() {
  local label="$1"
  local target="$2"
  local container="$3"
  mkdir -p "$ARTIFACT_DIR/samples/proc"
  docker exec "$container" sh -lc '
    printf "# memory.current\n"
    cat /sys/fs/cgroup/memory.current 2>/dev/null || true
    printf "\n# memory.stat\n"
    cat /sys/fs/cgroup/memory.stat 2>/dev/null || true
    printf "\n# proc-status-pid-1\n"
    cat /proc/1/status 2>/dev/null || true
    printf "\n# process-list\n"
    ps -eo pid,ppid,user,comm,args 2>/dev/null || true
  ' >"$ARTIFACT_DIR/samples/proc/${target}-memory-${label}.txt" 2>"$ARTIFACT_DIR/samples/proc/${target}-memory-${label}.stderr" || true
}

capture_memory_snapshots() {
  local label="$1"
  [[ -n "$APP_CONTAINER" ]] && capture_container_memory_snapshot "$label" app "$APP_CONTAINER"
  [[ -n "$DB_CONTAINER" ]] && capture_container_memory_snapshot "$label" db "$DB_CONTAINER"
}

docker_cli_stats_loop() {
  printf 'timestamp_utc\tname\tmem_usage\tmem_percent\tcpu_percent\tpids\n' >"$ARTIFACT_DIR/samples/docker-stats-cli.tsv"
  while true; do
    docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}\t{{.PIDs}}" "$APP_CONTAINER" "$DB_CONTAINER" \
      | awk -v ts="$(ts_utc)" -F '\t' '{print ts "\t" $0}' >>"$ARTIFACT_DIR/samples/docker-stats-cli.tsv" 2>/dev/null || true
    sleep "$SAMPLE_INTERVAL"
  done
}

write_browser_idle_summary() {
  local samples="$ARTIFACT_DIR/samples/docker-stats.tsv"
  [[ -f "$samples" ]] || return 0
  awk -F '\t' '
    BEGIN { print "metric\tbytes\tgib" }
    NR > 1 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ {
      rows++
      if (rows == 1) {
        first_app=$2
        first_db=$3
      }
      last_app=$2
      last_db=$3
      if ($2 > peak_app) peak_app=$2
      if ($3 > peak_db) peak_db=$3
      if ($7 ~ /browser/) {
        if (browser_rows == 0) {
          browser_first_app=$2
          browser_first_db=$3
        }
        browser_rows++
        browser_last_app=$2
        browser_last_db=$3
        if ($2 > browser_peak_app) browser_peak_app=$2
        if ($3 > browser_peak_db) browser_peak_db=$3
      }
    }
    END {
      print "first_app_rss\t" first_app "\t" first_app/1024/1024/1024
      print "first_db_rss\t" first_db "\t" first_db/1024/1024/1024
      print "last_app_rss\t" last_app "\t" last_app/1024/1024/1024
      print "last_db_rss\t" last_db "\t" last_db/1024/1024/1024
      print "peak_app_rss\t" peak_app "\t" peak_app/1024/1024/1024
      print "peak_db_rss\t" peak_db "\t" peak_db/1024/1024/1024
      print "browser_first_app_rss\t" browser_first_app "\t" browser_first_app/1024/1024/1024
      print "browser_last_app_rss\t" browser_last_app "\t" browser_last_app/1024/1024/1024
      print "browser_peak_app_rss\t" browser_peak_app "\t" browser_peak_app/1024/1024/1024
      print "browser_peak_db_rss\t" browser_peak_db "\t" browser_peak_db/1024/1024/1024
    }
  ' "$samples" >"$ARTIFACT_DIR/summaries/browser-idle-rss-summary.tsv"
}

write_browser_clients_summary() {
  local output="$ARTIFACT_DIR/summaries/browser-clients-summary.tsv"
  printf 'client\texit_status\trequest_count\tresponse_count\tbooks_endpoint_request_count\tbooks_endpoint_response_count\tfirst_books_endpoint_elapsed_ms\tapp_books_request_count\tfilter_option_request_count\tbrowser_used_heap_bytes\theap_snapshot_bytes\tartifact_dir\n' >"$output"

  local index client_name client_artifact step_name exit_file exit_status summary_file
  for index in "${!BROWSER_ARTIFACT_DIRS[@]}"; do
    client_name="$(printf 'client-%02d' "$((index + 1))")"
    client_artifact="${BROWSER_ARTIFACT_DIRS[$index]}"
    step_name="${BROWSER_STEP_NAMES[$index]}"
    exit_file="$ARTIFACT_DIR/commands/${step_name}.exit"
    exit_status="missing"
    [[ -f "$exit_file" ]] && exit_status="$(tr -dc '0-9' <"$exit_file")"
    summary_file="$client_artifact/summaries/browser-summary.json"

    if [[ -f "$summary_file" ]]; then
      jq -r \
        --arg client "$client_name" \
        --arg exit_status "$exit_status" \
        --arg artifact "$client_artifact" \
        '[
          $client,
          $exit_status,
          (.requestCount // ""),
          (.responseCount // ""),
          (.booksEndpointRequestCount // ""),
          (.booksEndpointResponseCount // ""),
          (.firstBooksEndpointElapsedMs // ""),
          (.appBooksRequestCount // ""),
          (.filterOptionRequestCount // ""),
          (.metrics.memory.usedJSHeapSize // ""),
          (.heapSnapshot.bytes // ""),
          $artifact
        ] | @tsv' "$summary_file" >>"$output" || \
        printf '%s\t%s\t\t\t\t\t\t\t\t\t\t%s\n' "$client_name" "$exit_status" "$client_artifact" >>"$output"
    else
      printf '%s\t%s\t\t\t\t\t\t\t\t\t\t%s\n' "$client_name" "$exit_status" "$client_artifact" >>"$output"
    fi
  done
}

collect_once() {
  if [[ "$COLLECTED_EVIDENCE" == "1" ]]; then
    return 0
  fi
  COLLECTED_EVIDENCE=1
  if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "final-collect" || true
    capture_memory_snapshots "final"
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER" || true
  fi
  write_browser_idle_summary || true
  write_browser_clients_summary || true
}

cleanup() {
  local status=$?
  set +e
  [[ -n "$SAMPLE_PID" ]] && kill_tree "$SAMPLE_PID"
  [[ -n "$CLI_STATS_PID" ]] && kill_tree "$CLI_STATS_PID"
  for browser_pid in "${BROWSER_PIDS[@]}"; do
    kill_tree "$browser_pid"
  done
  collect_once
  if [[ -f "$ARTIFACT_DIR/docker/compose.yml" ]]; then
    docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down >"$ARTIFACT_DIR/commands/999-compose-down.stdout.log" 2>"$ARTIFACT_DIR/commands/999-compose-down.stderr.log"
    printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/999-compose-down.exit"
  fi
  exit "$status"
}
trap cleanup EXIT

run_step 001-pull-app docker pull "$GRIMMORY_IMAGE"
if [[ "$RUN_MODE" == "debug-jdk" ]]; then
  run_step 002-pull-jdk docker pull "$JDK_IMAGE"
fi
run_step 006-pull-db docker pull "$DB_IMAGE"
{
  printf 'app=%s\n' "$(docker_digest "$GRIMMORY_IMAGE")"
  if [[ "$RUN_MODE" == "debug-jdk" ]]; then
    printf 'jdk=%s\n' "$(docker_digest "$JDK_IMAGE")"
  fi
  printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")"
} >"$ARTIFACT_DIR/docker/image-digests.txt"

run_step 010-copy-db cp -a "$SOURCE_DB_DIR/." "$ARTIFACT_DIR/runtime/mysql/"
if [[ -n "$SOURCE_DATA_DIR" ]]; then
  run_step 011-copy-data cp -a "$SOURCE_DATA_DIR/." "$ARTIFACT_DIR/runtime/data/"
fi
if [[ "$RUN_MODE" == "debug-jdk" ]]; then
  extract_app_jar_for_debug
fi

app_image="$GRIMMORY_IMAGE"
app_user_yaml=""
app_workdir_yaml=""
app_command_yaml=""
app_volumes_extra=""
java_options_yaml=""

if [[ "$RUN_MODE" == "exact" && -n "$JAVA_TOOL_OPTIONS_OVERRIDE" ]]; then
  java_options_yaml="      JAVA_TOOL_OPTIONS: >-
        ${JAVA_TOOL_OPTIONS_OVERRIDE}"
fi

if [[ "$RUN_MODE" == "debug-jdk" ]]; then
  app_image="$JDK_IMAGE"
  app_user_yaml='    user: "0:0"'
  app_workdir_yaml='    working_dir: /app'
  debug_java_options="${JAVA_TOOL_OPTIONS_OVERRIDE:-"-XX:+UseShenandoahGC -XX:ShenandoahGCHeuristics=compact -XX:+UseCompactObjectHeaders -XX:MaxRAMPercentage=60.0 -XX:InitialRAMPercentage=8.0 -XX:+ExitOnOutOfMemoryError -XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/heapdump.hprof -XX:MaxMetaspaceSize=256m -XX:ReservedCodeCacheSize=48m -Xss512k -XX:CICompilerCount=2 -XX:+UnlockExperimentalVMOptions -XX:+UseStringDeduplication -XX:ShenandoahUncommitDelay=5000 -XX:ShenandoahGuaranteedGCInterval=30000 -XX:MaxDirectMemorySize=256m -XX:NativeMemoryTracking=summary --enable-native-access=ALL-UNNAMED --enable-preview"}"
  app_command_yaml='    command: >
      sh -c "apk add --no-cache libstdc++ libgcc libarchive >/tmp/apk.log &&
      ln -sf /usr/lib/libarchive.so.13 /usr/lib/libarchive.so &&
      java
      '"$debug_java_options"'
      -jar /app/app.jar"'
  app_volumes_extra="      - ${ARTIFACT_DIR}/runtime/app/app.jar:/app/app.jar:ro"
fi

cat >"$ARTIFACT_DIR/docker/compose.yml" <<EOF
services:
  app:
    image: ${app_image}
${app_user_yaml}
${app_workdir_yaml}
${app_command_yaml}
    environment:
      USER_ID: "$(id -u)"
      GROUP_ID: "$(id -g)"
      DATABASE_URL: jdbc:mariadb://db:3306/grimmory
      DATABASE_USERNAME: ${MYSQL_USER}
      DATABASE_PASSWORD: ${MYSQL_PASSWORD}
      BOOKLORE_PORT: "6060"
      ALLOWED_ORIGINS: "*"
${java_options_yaml}
    ports:
      - "127.0.0.1:${APP_PORT}:6060"
    volumes:
      - ${ARTIFACT_DIR}/runtime/data:/app/data
      - ${ARTIFACT_DIR}/runtime/bookdrop:/bookdrop
${app_volumes_extra}
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

if ! wait_http "http://127.0.0.1:${APP_PORT}/api/v1/healthcheck" 360; then
  die "App healthcheck did not become ready"
fi

actual_count=""
start="$(date +%s)"
while true; do
  actual_count="$(book_count "$DB_CONTAINER")"
  if [[ -n "$actual_count" && "$actual_count" -ge "$TARGET_COUNT" ]]; then
    break
  fi
  if (( $(date +%s) - start >= 300 )); then
    die "DB has ${actual_count:-0} books, expected at least $TARGET_COUNT"
  fi
  sleep 5
done
printf 'actual_book_count=%s\n' "$actual_count" >>"$ARTIFACT_DIR/manifest.env"

run_detached_step 030-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_USER='$MYSQL_USER' MYSQL_PASSWORD='$MYSQL_PASSWORD' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' browser-window"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/030-sample-loop.pid")"
docker_cli_stats_loop &
CLI_STATS_PID="$!"
printf '%s\n' "$CLI_STATS_PID" >"$ARTIFACT_DIR/pids/031-docker-cli-stats.pid"

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-browser"
capture_memory_snapshots "pre-browser"
capture_jvm_snapshot "pre-browser"

for client_index in $(seq 1 "$BROWSER_CLIENTS"); do
  client_name="$(printf 'client-%02d' "$client_index")"
  if (( BROWSER_CLIENTS == 1 )); then
    client_artifact="$ARTIFACT_DIR"
    step_name="040-browser-probe"
  else
    client_artifact="$ARTIFACT_DIR/browser-clients/$client_name"
    ensure_artifact_dirs "$client_artifact"
    step_name="040-browser-probe-$client_name"
  fi

  BROWSER_STEP_NAMES+=("$step_name")
  BROWSER_ARTIFACT_DIRS+=("$client_artifact")
  run_detached_step "$step_name" env \
    ARTIFACT_DIR="$client_artifact" \
    APP_URL="http://127.0.0.1:${APP_PORT}" \
    ADMIN_USER="$ADMIN_USER" \
    ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    DURATION_MS="$BROWSER_DURATION_MS" \
    MEMORY_SAMPLE_INTERVAL_MS="$BROWSER_MEMORY_SAMPLE_INTERVAL_MS" \
    ROUTE="$BROWSER_ROUTE" \
    TAKE_HEAP_SNAPSHOT="$TAKE_HEAP_SNAPSHOT" \
    node "$SCRIPT_DIR/browser-probe.mjs"
  BROWSER_PIDS+=("$(cat "$ARTIFACT_DIR/pids/${step_name}.pid")")

  if (( client_index < BROWSER_CLIENTS && BROWSER_START_SPACING_SECONDS > 0 )); then
    sleep "$BROWSER_START_SPACING_SECONDS"
  fi
done

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "browser-probes-started"

browser_deadline=$(( $(date +%s) + (BROWSER_DURATION_MS / 1000) + BROWSER_WAIT_GRACE_SECONDS ))
while true; do
  remaining=0
  for step_name in "${BROWSER_STEP_NAMES[@]}"; do
    if [[ ! -f "$ARTIFACT_DIR/commands/${step_name}.exit" ]]; then
      remaining=$((remaining + 1))
    fi
  done
  if (( remaining == 0 )); then
    break
  fi
  if (( $(date +%s) >= browser_deadline )); then
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "browser-probes-timeout"
    for browser_pid in "${BROWSER_PIDS[@]}"; do
      kill_tree "$browser_pid"
    done
    die "Timed out waiting for $remaining browser probe(s); see $ARTIFACT_DIR/commands"
  fi
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "waiting-browser-probes"
  sleep 10
done

browser_failures=0
for step_name in "${BROWSER_STEP_NAMES[@]}"; do
  exit_file="$ARTIFACT_DIR/commands/${step_name}.exit"
  status="$(tr -dc '0-9' <"$exit_file")"
  if [[ "$status" != "0" ]]; then
    browser_failures=$((browser_failures + 1))
  fi
done
write_browser_clients_summary
if (( browser_failures > 0 )); then
  die "$browser_failures browser probe(s) failed; see $ARTIFACT_DIR/summaries/browser-clients-summary.tsv"
fi

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-browser-closed"
capture_memory_snapshots "post-browser-closed"
capture_jvm_snapshot "post-browser-closed"

sleep "$POST_BROWSER_IDLE_SECONDS"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-browser-idle"
capture_memory_snapshots "post-browser-idle"
capture_jvm_snapshot "post-browser-idle"
if [[ "$FORCE_GC_AFTER_BROWSER" == "1" ]]; then
  force_gc_and_snapshot "post-browser-forced-gc"
fi
collect_once

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A for exact-image backend RSS and browser network evidence; B for debug-JDK JVM attribution when RUN_MODE=debug-jdk.
- Run mode: ${RUN_MODE}
- Image: ${GRIMMORY_IMAGE}
- Image digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- JDK image: ${JDK_IMAGE}
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Source DB dir: ${SOURCE_DB_DIR}
- Target book count: ${TARGET_COUNT}
- Actual book count: ${actual_count}
- Browser route: ${BROWSER_ROUTE}
- Browser clients: ${BROWSER_CLIENTS}
- Browser start spacing: ${BROWSER_START_SPACING_SECONDS}s.
- Browser duration: ${BROWSER_DURATION_MS}ms.
- Browser heap snapshot: ${TAKE_HEAP_SNAPSHOT}
- Post-browser idle: ${POST_BROWSER_IDLE_SECONDS}s.
- Force GC after browser: ${FORCE_GC_AFTER_BROWSER}
- JVM snapshots: samples/heap-info-*.txt, samples/nmt-summary-*.txt, samples/class-histogram-*.txt, and samples/vm-flags-*.txt when jcmd is available.
- RSS summary: ${ARTIFACT_DIR}/summaries/browser-idle-rss-summary.tsv
- Browser client summary: ${ARTIFACT_DIR}/summaries/browser-clients-summary.tsv
- Browser summary: ${ARTIFACT_DIR}/summaries/browser-summary.json for single-client runs, or ${ARTIFACT_DIR}/browser-clients/client-*/summaries/browser-summary.json for multi-client runs.
- Raw samples: ${ARTIFACT_DIR}/samples/docker-stats.tsv and browser samples under the client artifact directories.
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
