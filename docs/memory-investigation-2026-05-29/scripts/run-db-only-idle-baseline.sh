#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker

VERIFY_ID="${VERIFY_ID:-V41-db-only-idle-50k}"
SOURCE_ARTIFACT_DIR="${SOURCE_ARTIFACT_DIR:-}"
SOURCE_DB_DIR="${SOURCE_DB_DIR:-}"
TARGET_COUNT="${TARGET_COUNT:-50000}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
DB_PORT="${DB_PORT:-3706}"
MYSQL_USER="${MYSQL_USER:-grimmory}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-grimmory}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-10}"
IDLE_DURATION_SECONDS="${IDLE_DURATION_SECONDS:-600}"

[[ "$TARGET_COUNT" =~ ^[0-9]+$ ]] || die "TARGET_COUNT must be numeric"
(( TARGET_COUNT > 0 )) || die "TARGET_COUNT must be > 0"

if [[ -n "$SOURCE_ARTIFACT_DIR" ]]; then
  SOURCE_DB_DIR="${SOURCE_DB_DIR:-$SOURCE_ARTIFACT_DIR/runtime/mysql}"
fi

[[ -d "$SOURCE_DB_DIR" ]] || die "SOURCE_DB_DIR must point to an existing MariaDB /config directory"

ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
export ARTIFACT_DIR MYSQL_USER MYSQL_PASSWORD MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/samples/proc"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_artifact_dir=$SOURCE_ARTIFACT_DIR
source_db_dir=$SOURCE_DB_DIR
target_count=$TARGET_COUNT
db_image=$DB_IMAGE
db_port=$DB_PORT
sample_interval=$SAMPLE_INTERVAL
idle_duration_seconds=$IDLE_DURATION_SECONDS
EOF

COMPOSE_PROJECT="grimmorydbidle$(date -u +%Y%m%d%H%M%S)"
DB_CONTAINER=""
SAMPLE_PID=""
CLI_STATS_PID=""
COLLECTED_EVIDENCE=0

db_sample_once() {
  local note="${1:-db-idle}"
  local db_rss books
  db_rss="$(container_memory_bytes "$DB_CONTAINER")"
  books="$(book_count "$DB_CONTAINER")"
  if [[ ! -f "$ARTIFACT_DIR/samples/db-only-docker-stats.tsv" ]]; then
    printf 'timestamp_utc\tdb_rss_bytes\tdb_pid\tbooks\tnote\n' >"$ARTIFACT_DIR/samples/db-only-docker-stats.tsv"
  fi
  printf '%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$db_rss" "$(container_pids "$DB_CONTAINER")" "$books" "$note" >>"$ARTIFACT_DIR/samples/db-only-docker-stats.tsv"
}

db_sample_loop() {
  while true; do
    db_sample_once "db-idle" || true
    sleep "$SAMPLE_INTERVAL"
  done
}

docker_cli_stats_loop() {
  printf 'timestamp_utc\tname\tmem_usage\tmem_percent\tcpu_percent\tpids\n' >"$ARTIFACT_DIR/samples/docker-stats-cli.tsv"
  while true; do
    docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.CPUPerc}}\t{{.PIDs}}" "$DB_CONTAINER" \
      | awk -v ts="$(ts_utc)" -F '\t' '{print ts "\t" $0}' >>"$ARTIFACT_DIR/samples/docker-stats-cli.tsv" 2>/dev/null || true
    sleep "$SAMPLE_INTERVAL"
  done
}

capture_db_memory_snapshot() {
  local label="$1"
  docker exec "$DB_CONTAINER" sh -lc '
    printf "# memory.current\n"
    cat /sys/fs/cgroup/memory.current 2>/dev/null || true
    printf "\n# memory.stat\n"
    cat /sys/fs/cgroup/memory.stat 2>/dev/null || true
    printf "\n# process-list\n"
    ps -eo pid,ppid,user,comm,args 2>/dev/null || true
    for p in $(pgrep -f "mariadbd|mysqld" || true); do
      printf "\n# proc-status pid=%s\n" "$p"
      cat "/proc/$p/status" 2>/dev/null || true
    done
  ' >"$ARTIFACT_DIR/samples/proc/db-memory-${label}.txt" 2>"$ARTIFACT_DIR/samples/proc/db-memory-${label}.stderr" || true
}

write_db_summary() {
  local samples="$ARTIFACT_DIR/samples/db-only-docker-stats.tsv"
  [[ -f "$samples" ]] || return 0
  awk -F '\t' '
    BEGIN { print "metric\tbytes\tgib" }
    NR > 1 && $2 ~ /^[0-9]+$/ {
      rows++
      if (rows == 1) first=$2
      last=$2
      if ($2 > peak) peak=$2
    }
    END {
      print "first_db_rss\t" first "\t" first/1024/1024/1024
      print "last_db_rss\t" last "\t" last/1024/1024/1024
      print "peak_db_rss\t" peak "\t" peak/1024/1024/1024
    }
  ' "$samples" >"$ARTIFACT_DIR/summaries/db-only-rss-summary.tsv"
}

collect_once() {
  if [[ "$COLLECTED_EVIDENCE" == "1" ]]; then
    return 0
  fi
  COLLECTED_EVIDENCE=1
  if [[ -n "$DB_CONTAINER" ]]; then
    db_sample_once "final-collect" || true
    capture_db_memory_snapshot "final"
    docker inspect "$DB_CONTAINER" >"$ARTIFACT_DIR/docker/inspect-db.json" 2>/dev/null || true
    docker logs "$DB_CONTAINER" >"$ARTIFACT_DIR/logs/db.log" 2>"$ARTIFACT_DIR/logs/db.stderr.log" || true
    db_counts "$DB_CONTAINER" >"$ARTIFACT_DIR/samples/db-counts.tsv" || true
    {
      echo "db_container=$DB_CONTAINER"
      docker inspect "$DB_CONTAINER" --format 'restart_count={{.RestartCount}} oom_killed={{.State.OOMKilled}} status={{.State.Status}} exit_code={{.State.ExitCode}}' 2>/dev/null || true
    } >"$ARTIFACT_DIR/docker/container-state-final.txt"
  fi
  write_db_summary || true
}

cleanup() {
  local status=$?
  set +e
  [[ -n "$SAMPLE_PID" ]] && kill_tree "$SAMPLE_PID"
  [[ -n "$CLI_STATS_PID" ]] && kill_tree "$CLI_STATS_PID"
  collect_once
  if [[ -f "$ARTIFACT_DIR/docker/compose.yml" ]]; then
    docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down >"$ARTIFACT_DIR/commands/999-compose-down.stdout.log" 2>"$ARTIFACT_DIR/commands/999-compose-down.stderr.log"
    printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/999-compose-down.exit"
  fi
  exit "$status"
}
trap cleanup EXIT

run_step 001-pull-db docker pull "$DB_IMAGE"
printf 'db=%s\n' "$(docker_digest "$DB_IMAGE")" >"$ARTIFACT_DIR/docker/image-digests.txt"
run_step 010-copy-db cp -a "$SOURCE_DB_DIR/." "$ARTIFACT_DIR/runtime/mysql/"

cat >"$ARTIFACT_DIR/docker/compose.yml" <<EOF
services:
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
DB_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" ps -q db)"
export DB_CONTAINER

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
compose_project=$COMPOSE_PROJECT
db_container=$DB_CONTAINER
EOF

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

db_sample_once "ready"
capture_db_memory_snapshot "ready"

db_sample_loop &
SAMPLE_PID="$!"
printf '%s\n' "$SAMPLE_PID" >"$ARTIFACT_DIR/pids/010-db-sample-loop.pid"
docker_cli_stats_loop &
CLI_STATS_PID="$!"
printf '%s\n' "$CLI_STATS_PID" >"$ARTIFACT_DIR/pids/011-docker-cli-stats.pid"

sleep "$IDLE_DURATION_SECONDS"
db_sample_once "post-idle"
capture_db_memory_snapshot "post-idle"
collect_once

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A for MariaDB sidecar idle attribution.
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Source DB dir: ${SOURCE_DB_DIR}
- Target book count: ${TARGET_COUNT}
- Actual book count: ${actual_count}
- Idle duration: ${IDLE_DURATION_SECONDS}s.
- Sample interval: ${SAMPLE_INTERVAL}s.
- App container: none.
- RSS summary: ${ARTIFACT_DIR}/summaries/db-only-rss-summary.tsv
- Raw samples: ${ARTIFACT_DIR}/samples/db-only-docker-stats.tsv
- Container memory snapshots: ${ARTIFACT_DIR}/samples/proc
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
