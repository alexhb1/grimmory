#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl

VERIFY_ID="${VERIFY_ID:-V40-huge-idle-baseline}"
SOURCE_ARTIFACT_DIR="${SOURCE_ARTIFACT_DIR:-}"
SOURCE_DB_DIR="${SOURCE_DB_DIR:-}"
SOURCE_DATA_DIR="${SOURCE_DATA_DIR:-}"
TARGET_COUNT="${TARGET_COUNT:-50000}"
RUN_MODE="${RUN_MODE:-exact}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
JDK_IMAGE="${JDK_IMAGE:-eclipse-temurin:25-jdk-alpine}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6360}"
DB_PORT="${DB_PORT:-3666}"
MYSQL_USER="${MYSQL_USER:-grimmory}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-grimmory}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-10}"
STABILIZE_SECONDS="${STABILIZE_SECONDS:-60}"
IDLE_DURATION_SECONDS="${IDLE_DURATION_SECONDS:-1800}"
APP_MEMORY_LIMIT="${APP_MEMORY_LIMIT:-}"
KEEP_CONTAINERS="${KEEP_CONTAINERS:-0}"
FORCE_GC_SNAPSHOT="${FORCE_GC_SNAPSHOT:-1}"
JAVA_TOOL_OPTIONS_OVERRIDE="${JAVA_TOOL_OPTIONS_OVERRIDE:-}"

[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"
[[ "$RUN_MODE" == "exact" || "$RUN_MODE" == "debug-jdk" ]] || die "RUN_MODE must be exact or debug-jdk"

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
sample_interval=$SAMPLE_INTERVAL
stabilize_seconds=$STABILIZE_SECONDS
idle_duration_seconds=$IDLE_DURATION_SECONDS
app_memory_limit=${APP_MEMORY_LIMIT:-none}
keep_containers=$KEEP_CONTAINERS
force_gc_snapshot=$FORCE_GC_SNAPSHOT
java_tool_options_override=${JAVA_TOOL_OPTIONS_OVERRIDE:-image-default}
EOF

COMPOSE_PROJECT="grimmoryidle$(date -u +%Y%m%d%H%M%S)"
export COMPOSE_PROJECT

APP_CONTAINER=""
DB_CONTAINER=""
SAMPLE_PID=""
CLI_STATS_PID=""
COLLECTED_EVIDENCE=0

copy_source_runtime() {
  run_step 010-copy-db cp -a "$SOURCE_DB_DIR/." "$ARTIFACT_DIR/runtime/mysql/"
  if [[ -n "$SOURCE_DATA_DIR" ]]; then
    run_step 011-copy-data cp -a "$SOURCE_DATA_DIR/." "$ARTIFACT_DIR/runtime/data/"
  fi
}

extract_app_jar_for_debug() {
  local source_container="extract-idle-$(date -u +%Y%m%d%H%M%S)-$$"
  run_step 020-create-extract-container docker create --name "$source_container" "$GRIMMORY_IMAGE"
  run_step 021-copy-app-jar docker cp "$source_container:/app/app.jar" "$ARTIFACT_DIR/runtime/app/app.jar"
  run_step 022-remove-extract-container docker rm "$source_container"
}

write_compose_file() {
  local app_image="$GRIMMORY_IMAGE"
  local app_user_yaml=""
  local app_workdir_yaml=""
  local app_command_yaml=""
  local app_volumes_extra=""
  local app_memory_limit_yaml=""
  local java_options_yaml=""
  local debug_java_options

  if [[ -n "$APP_MEMORY_LIMIT" ]]; then
    app_memory_limit_yaml="    mem_limit: ${APP_MEMORY_LIMIT}"
  fi

  if [[ -n "$JAVA_TOOL_OPTIONS_OVERRIDE" && "$RUN_MODE" == "exact" ]]; then
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
${app_memory_limit_yaml}
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
}

wait_for_book_count() {
  local timeout="${1:-300}"
  local start count
  start="$(date +%s)"
  while true; do
    count="$(book_count "$DB_CONTAINER")"
    if [[ -n "$count" && "$count" -ge "$TARGET_COUNT" ]]; then
      printf '%s\n' "$count"
      return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      printf '%s\n' "${count:-0}"
      return 1
    fi
    sleep 5
  done
}

docker_cli_stats_loop() {
  local interval="$1"
  printf 'timestamp_utc\tname\tmem_usage\tmem_percent\tcpu_percent\tpids\n' >"$ARTIFACT_DIR/samples/docker-stats-cli.tsv"
  while true; do
    docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}\t{{.PIDs}}" "$APP_CONTAINER" "$DB_CONTAINER" \
      | awk -v ts="$(ts_utc)" -F '\t' '{print ts "\t" $0}' >>"$ARTIFACT_DIR/samples/docker-stats-cli.tsv" 2>/dev/null || true
    sleep "$interval"
  done
}

capture_jvm_snapshot() {
  local label="$1"
  local jcmd_path
  if [[ -z "$APP_CONTAINER" ]]; then
    return 0
  fi
  jcmd_path="$(docker exec "$APP_CONTAINER" sh -lc 'command -v jcmd 2>/dev/null || test -x /opt/java/openjdk/bin/jcmd && printf "%s\n" /opt/java/openjdk/bin/jcmd' 2>/dev/null | head -n 1 || true)"
  if [[ -z "$jcmd_path" ]]; then
    printf 'jcmd unavailable in this container\n' >"$ARTIFACT_DIR/samples/jvm-snapshot-${label}.txt"
    return 0
  fi
  printf '%s\n' "$jcmd_path" >"$ARTIFACT_DIR/samples/jcmd-path-${label}.txt"
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.heap_info >"$ARTIFACT_DIR/samples/heap-info-${label}.txt" 2>"$ARTIFACT_DIR/samples/heap-info-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 VM.native_memory summary >"$ARTIFACT_DIR/samples/nmt-summary-${label}.txt" 2>"$ARTIFACT_DIR/samples/nmt-summary-${label}.stderr" || true
  docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.class_histogram >"$ARTIFACT_DIR/samples/class-histogram-${label}.txt" 2>"$ARTIFACT_DIR/samples/class-histogram-${label}.stderr" || true
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

write_idle_summary() {
  local samples="$ARTIFACT_DIR/samples/docker-stats.tsv"
  [[ -f "$samples" ]] || return 0
  awk -F '\t' '
    BEGIN {
      print "metric\tbytes\tgib"
    }
    NR > 1 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/ {
      rows++
      if (rows == 1) {
        first_app=$2
        first_db=$3
      }
      last_app=$2
      last_db=$3
      if ($7 ~ /idle/ || $7 ~ /stabilize/ || $7 ~ /ready/) {
        if (idle_rows == 0) {
          idle_first_app=$2
          idle_first_db=$3
        }
        idle_rows++
        idle_last_app=$2
        idle_last_db=$3
        if ($2 > idle_peak_app) idle_peak_app=$2
        if ($3 > idle_peak_db) idle_peak_db=$3
      }
      if ($2 > peak_app) peak_app=$2
      if ($3 > peak_db) peak_db=$3
    }
    END {
      print "first_app_rss\t" first_app "\t" first_app/1024/1024/1024
      print "first_db_rss\t" first_db "\t" first_db/1024/1024/1024
      print "last_app_rss\t" last_app "\t" last_app/1024/1024/1024
      print "last_db_rss\t" last_db "\t" last_db/1024/1024/1024
      print "peak_app_rss\t" peak_app "\t" peak_app/1024/1024/1024
      print "peak_db_rss\t" peak_db "\t" peak_db/1024/1024/1024
      print "idle_first_app_rss\t" idle_first_app "\t" idle_first_app/1024/1024/1024
      print "idle_first_db_rss\t" idle_first_db "\t" idle_first_db/1024/1024/1024
      print "idle_last_app_rss\t" idle_last_app "\t" idle_last_app/1024/1024/1024
      print "idle_last_db_rss\t" idle_last_db "\t" idle_last_db/1024/1024/1024
      print "idle_peak_app_rss\t" idle_peak_app "\t" idle_peak_app/1024/1024/1024
      print "idle_peak_db_rss\t" idle_peak_db "\t" idle_peak_db/1024/1024/1024
    }
  ' "$samples" >"$ARTIFACT_DIR/summaries/idle-rss-summary.tsv"
}

collect_once() {
  if [[ "$COLLECTED_EVIDENCE" == "1" ]]; then
    return 0
  fi
  COLLECTED_EVIDENCE=1
  if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "final-collect" || true
    db_counts "$DB_CONTAINER" >"$ARTIFACT_DIR/samples/db-counts.tsv" || true
    collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER" || true
  fi
  write_idle_summary || true
}

cleanup() {
  local status=$?
  set +e
  [[ -n "$SAMPLE_PID" ]] && kill_tree "$SAMPLE_PID"
  [[ -n "$CLI_STATS_PID" ]] && kill_tree "$CLI_STATS_PID"
  collect_once
  if [[ "$KEEP_CONTAINERS" != "1" && -f "$ARTIFACT_DIR/docker/compose.yml" ]]; then
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
run_step 003-pull-db docker pull "$DB_IMAGE"

{
  printf 'app=%s\n' "$(docker_digest "$GRIMMORY_IMAGE")"
  if [[ "$RUN_MODE" == "debug-jdk" ]]; then
    printf 'jdk=%s\n' "$(docker_digest "$JDK_IMAGE")"
  fi
  printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")"
} >"$ARTIFACT_DIR/docker/image-digests.txt"

copy_source_runtime
if [[ "$RUN_MODE" == "debug-jdk" ]]; then
  extract_app_jar_for_debug
fi
write_compose_file

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

if ! wait_http "http://127.0.0.1:${APP_PORT}/api/v1/healthcheck" 360; then
  die "App healthcheck did not become ready"
fi

actual_count="$(wait_for_book_count 300)" || {
  ledger verify-db-count failed "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" "$actual_count" "expected-$TARGET_COUNT"
  die "DB has ${actual_count:-0} books, expected at least $TARGET_COUNT"
}

printf 'actual_book_count=%s\n' "$actual_count" >>"$ARTIFACT_DIR/manifest.env"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "ready"
capture_jvm_snapshot "ready"
capture_memory_snapshots "ready"

run_detached_step 040-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_USER='$MYSQL_USER' MYSQL_PASSWORD='$MYSQL_PASSWORD' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' idle"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/040-sample-loop.pid")"
docker_cli_stats_loop "$SAMPLE_INTERVAL" &
CLI_STATS_PID="$!"
printf '%s\n' "$CLI_STATS_PID" >"$ARTIFACT_DIR/pids/041-docker-cli-stats.pid"

sleep "$STABILIZE_SECONDS"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-stabilize"
capture_jvm_snapshot "post-stabilize"
capture_memory_snapshots "post-stabilize"

sleep "$IDLE_DURATION_SECONDS"
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-idle"
capture_jvm_snapshot "post-idle"
capture_memory_snapshots "post-idle"

if [[ "$FORCE_GC_SNAPSHOT" == "1" ]]; then
  jcmd_path="$(docker exec "$APP_CONTAINER" sh -lc 'command -v jcmd 2>/dev/null || test -x /opt/java/openjdk/bin/jcmd && printf "%s\n" /opt/java/openjdk/bin/jcmd' 2>/dev/null | head -n 1 || true)"
  if [[ -n "$jcmd_path" ]]; then
    docker exec "$APP_CONTAINER" "$jcmd_path" 1 GC.run >"$ARTIFACT_DIR/samples/gc-run-post-idle.txt" 2>"$ARTIFACT_DIR/samples/gc-run-post-idle.stderr" || true
    sleep 5
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-idle-forced-gc"
    capture_jvm_snapshot "post-idle-forced-gc"
    capture_memory_snapshots "post-idle-forced-gc"
  fi
fi

collect_once

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A for exact-image idle RSS, B for debug-JDK JVM attribution.
- Run mode: ${RUN_MODE}
- Image: ${GRIMMORY_IMAGE}
- Image digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Source artifact: ${SOURCE_ARTIFACT_DIR:-none}
- Source DB dir: ${SOURCE_DB_DIR}
- Git commit: $(git rev-parse HEAD)
- Target book count: ${TARGET_COUNT}
- Actual book count: ${actual_count}
- Idle duration: ${IDLE_DURATION_SECONDS}s after ${STABILIZE_SECONDS}s stabilization.
- Sample interval: ${SAMPLE_INTERVAL}s.
- Browser connected: false.
- Endpoint workload during idle: healthcheck only before sampling, then no intentional frontend/API traffic.
- Container memory limit: app ${APP_MEMORY_LIMIT:-none}.
- JVM snapshots: see samples/heap-info-*.txt, samples/nmt-summary-*.txt, and samples/class-histogram-*.txt when RUN_MODE=debug-jdk.
- Container memory snapshots: see samples/proc/* for cgroup memory.stat and process status snapshots.
- RSS summary: ${ARTIFACT_DIR}/summaries/idle-rss-summary.tsv
- Raw samples: ${ARTIFACT_DIR}/samples/docker-stats.tsv and ${ARTIFACT_DIR}/samples/docker-stats-cli.tsv
- Logs: ${ARTIFACT_DIR}/logs
- Artifacts: ${ARTIFACT_DIR}
EOF

printf '%s\n' "$ARTIFACT_DIR"
