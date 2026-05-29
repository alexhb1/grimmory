#!/usr/bin/env bash
set -euo pipefail

ts_utc() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

slug_ts() {
  date -u +"%Y%m%dT%H%M%SZ"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "Missing required env var: $name"
}

init_artifact_dir() {
  local verify_id="${1:-manual}"
  local root="${MEMORY_RUN_ROOT:-$PWD/.memory-runs}"
  mkdir -p "$root"
  local dir="$root/run-$(slug_ts)-$verify_id"
  ensure_artifact_dirs "$dir"
  printf '%s\n' "$dir"
}

ensure_artifact_dirs() {
  local dir="$1"
  mkdir -p "$dir/commands" "$dir/docker" "$dir/logs" "$dir/pids" "$dir/samples/responses" "$dir/summaries"
}

append_manifest() {
  require_env ARTIFACT_DIR
  ensure_artifact_dirs "$ARTIFACT_DIR"
  {
    printf 'timestamp_utc=%s\n' "$(ts_utc)"
    printf 'git_branch=%s\n' "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    printf 'git_commit=%s\n' "$(git rev-parse HEAD 2>/dev/null || true)"
    printf 'git_status_short<<EOF\n'
    git status --short 2>/dev/null || true
    printf 'EOF\n'
  } >>"$ARTIFACT_DIR/manifest.env"
}

run_step() {
  require_env ARTIFACT_DIR
  local name="$1"
  shift
  mkdir -p "$ARTIFACT_DIR/commands"
  printf '%q ' "$@" >"$ARTIFACT_DIR/commands/${name}.cmd"
  printf '\n' >>"$ARTIFACT_DIR/commands/${name}.cmd"
  "$@" >"$ARTIFACT_DIR/commands/${name}.stdout.log" 2>"$ARTIFACT_DIR/commands/${name}.stderr.log"
  local status=$?
  printf '%s\n' "$status" >"$ARTIFACT_DIR/commands/${name}.exit"
  return "$status"
}

run_detached_step() {
  require_env ARTIFACT_DIR
  local name="$1"
  shift
  mkdir -p "$ARTIFACT_DIR/commands" "$ARTIFACT_DIR/pids"
  printf '%q ' "$@" >"$ARTIFACT_DIR/commands/${name}.cmd"
  printf '\n' >>"$ARTIFACT_DIR/commands/${name}.cmd"
  (
    set +e
    "$@" >"$ARTIFACT_DIR/commands/${name}.stdout.log" 2>"$ARTIFACT_DIR/commands/${name}.stderr.log"
    printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/${name}.exit"
  ) &
  local pid="$!"
  printf '%s\n' "$pid" >"$ARTIFACT_DIR/pids/${name}.pid"
  disown "$pid" 2>/dev/null || true
}

kill_tree() {
  local pid="${1:-}"
  [[ -n "$pid" ]] || return 0
  pkill -TERM -P "$pid" 2>/dev/null || true
  kill "$pid" 2>/dev/null || true
}

write_ledger_header() {
  require_env ARTIFACT_DIR
  if [[ ! -f "$ARTIFACT_DIR/run-ledger.tsv" ]]; then
    printf 'timestamp_utc\tstep\tstatus\tapp_rss_bytes\tdb_rss_bytes\tbooks\tnote\n' >"$ARTIFACT_DIR/run-ledger.tsv"
  fi
}

ledger() {
  require_env ARTIFACT_DIR
  local step="${1:-unknown}"
  local status="${2:-unknown}"
  local app_rss="${3:-}"
  local db_rss="${4:-}"
  local books="${5:-}"
  local note="${6:-}"
  write_ledger_header
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$step" "$status" "$app_rss" "$db_rss" "$books" "$note" >>"$ARTIFACT_DIR/run-ledger.tsv"
}

container_memory_bytes() {
  local container="$1"
  docker exec "$container" sh -c 'cat /sys/fs/cgroup/memory.current 2>/dev/null || cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null || true' 2>/dev/null | tr -dc '0-9'
}

container_pids() {
  local container="$1"
  docker inspect "$container" --format '{{.State.Pid}}' 2>/dev/null || true
}

docker_digest() {
  local image="$1"
  docker image inspect "$image" --format '{{index .RepoDigests 0}}' 2>/dev/null || docker image inspect "$image" --format '{{.Id}}' 2>/dev/null || true
}

wait_http() {
  local url="$1"
  local timeout="${2:-180}"
  local start
  start="$(date +%s)"
  while true; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if (( $(date +%s) - start >= timeout )); then
      return 1
    fi
    sleep 2
  done
}

auth_token() {
  local base_url="$1"
  local username="${2:-admin}"
  local password="${3:-admin123}"
  curl -fsS -H 'Content-Type: application/json' \
    -d "{\"username\":\"${username}\",\"password\":\"${password}\"}" \
    "$base_url/api/v1/auth/login" | jq -r '.accessToken'
}

setup_admin_if_needed() {
  local base_url="$1"
  local username="${2:-admin}"
  local password="${3:-admin123}"
  local status
  status="$(curl -fsS "$base_url/api/v1/setup/status" | jq -r '.data // .result // .value // empty')"
  if [[ "$status" == "false" || -z "$status" ]]; then
    curl -fsS -H 'Content-Type: application/json' \
      -d "{\"username\":\"${username}\",\"email\":\"admin@example.test\",\"name\":\"Admin\",\"password\":\"${password}\"}" \
      "$base_url/api/v1/setup" >/dev/null
  fi
}

db_counts() {
  local db_container="$1"
  local username="${MYSQL_USER:-grimmory}"
  local password="${MYSQL_PASSWORD:-grimmory}"
  docker exec "$db_container" mariadb "-u${username}" "-p${password}" -N -B grimmory -e \
    "select 'book', count(*) from book union all select 'book_file', count(*) from book_file union all select 'book_metadata', count(*) from book_metadata union all select 'library', count(*) from library union all select 'users', count(*) from users;" 2>/dev/null || true
}

book_count() {
  local db_container="$1"
  local username="${MYSQL_USER:-grimmory}"
  local password="${MYSQL_PASSWORD:-grimmory}"
  docker exec "$db_container" mariadb "-u${username}" "-p${password}" -N -B grimmory -e "select count(*) from book;" 2>/dev/null | tr -dc '0-9' || true
}

sample_once() {
  require_env ARTIFACT_DIR
  local app_container="$1"
  local db_container="$2"
  local note="${3:-}"
  local app_rss db_rss books
  app_rss="$(container_memory_bytes "$app_container")"
  db_rss="$(container_memory_bytes "$db_container")"
  books="$(book_count "$db_container" "${MYSQL_ROOT_PASSWORD:-grimmory}")"
  if [[ ! -f "$ARTIFACT_DIR/samples/docker-stats.tsv" ]]; then
    printf 'timestamp_utc\tapp_rss_bytes\tdb_rss_bytes\tapp_pid\tdb_pid\tbooks\tnote\n' >"$ARTIFACT_DIR/samples/docker-stats.tsv"
  fi
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$app_rss" "$db_rss" "$(container_pids "$app_container")" "$(container_pids "$db_container")" "$books" "$note" >>"$ARTIFACT_DIR/samples/docker-stats.tsv"
  ledger sample ok "$app_rss" "$db_rss" "$books" "$note"
}

sample_loop() {
  local app_container="$1"
  local db_container="$2"
  local interval="${3:-5}"
  local note="${4:-loop}"
  while true; do
    sample_once "$app_container" "$db_container" "$note" || true
    sleep "$interval"
  done
}

collect_container_evidence() {
  require_env ARTIFACT_DIR
  local app_container="$1"
  local db_container="$2"
  docker inspect "$app_container" >"$ARTIFACT_DIR/docker/inspect-app.json" 2>/dev/null || true
  docker inspect "$db_container" >"$ARTIFACT_DIR/docker/inspect-db.json" 2>/dev/null || true
  {
    echo "app_container=$app_container"
    docker inspect "$app_container" --format 'restart_count={{.RestartCount}} oom_killed={{.State.OOMKilled}} status={{.State.Status}} exit_code={{.State.ExitCode}}' 2>/dev/null || true
    echo "db_container=$db_container"
    docker inspect "$db_container" --format 'restart_count={{.RestartCount}} oom_killed={{.State.OOMKilled}} status={{.State.Status}} exit_code={{.State.ExitCode}}' 2>/dev/null || true
  } >"$ARTIFACT_DIR/docker/container-state-final.txt"
  docker logs "$app_container" >"$ARTIFACT_DIR/logs/app.log" 2>"$ARTIFACT_DIR/logs/app.stderr.log" || true
  docker logs "$db_container" >"$ARTIFACT_DIR/logs/db.log" 2>"$ARTIFACT_DIR/logs/db.stderr.log" || true
  db_counts "$db_container" "${MYSQL_ROOT_PASSWORD:-grimmory}" >"$ARTIFACT_DIR/samples/db-counts.tsv" || true
  find "$ARTIFACT_DIR" -type f \( -name '*.jfr' -o -name '*.hprof' -o -name '*.log' -o -name '*.body' -o -name '*.gz' \) -print0 \
    | sort -z \
    | xargs -0 -r sha256sum >"$ARTIFACT_DIR/samples/sha256sums.txt"
}

probe_endpoint() {
  require_env ARTIFACT_DIR
  local name="$1"
  local method="$2"
  local url="$3"
  local token="$4"
  local app_container="${5:-}"
  local db_container="${6:-}"
  local body_file="$ARTIFACT_DIR/samples/responses/${name}.body"
  local headers_file="$ARTIFACT_DIR/samples/responses/${name}.headers.txt"
  local meta_file="$ARTIFACT_DIR/samples/responses/${name}.meta.txt"
  local curl_config="$ARTIFACT_DIR/samples/responses/${name}.curl.conf"
  local before_app="" before_db="" after_app="" after_db="" books="" gzip_bytes=""
  [[ -n "$app_container" ]] && before_app="$(container_memory_bytes "$app_container")"
  [[ -n "$db_container" ]] && before_db="$(container_memory_bytes "$db_container")"
  mkdir -p "$ARTIFACT_DIR/samples/responses"
  : >"$body_file"
  {
    printf 'silent\n'
    printf 'show-error\n'
    printf 'request = "%s"\n' "$method"
    printf 'url = "%s"\n' "$url"
    printf 'header = "Authorization: Bearer %s"\n' "$token"
    printf 'header = "Accept-Encoding: identity"\n'
    printf 'dump-header = "%s"\n' "$headers_file"
    printf 'output = "%s"\n' "$body_file"
    printf 'write-out = "http_status=%%{http_code}\\ntime_total=%%{time_total}\\nsize_download=%%{size_download}\\n"\n'
  } >"$curl_config"
  curl --config "$curl_config" >"$meta_file" 2>"$ARTIFACT_DIR/samples/responses/${name}.curl.stderr" || true
  [[ -n "$app_container" ]] && after_app="$(container_memory_bytes "$app_container")"
  [[ -n "$db_container" ]] && after_db="$(container_memory_bytes "$db_container")"
  [[ -n "$db_container" ]] && books="$(book_count "$db_container" "${MYSQL_ROOT_PASSWORD:-grimmory}")"
  sha256sum "$body_file" >>"$ARTIFACT_DIR/samples/sha256sums.txt"
  if command -v gzip >/dev/null 2>&1; then
    gzip_bytes="$(gzip -c "$body_file" | wc -c | tr -d ' ')"
  fi
  local bytes http_status time_total
  bytes="$(wc -c <"$body_file" | tr -d ' ')"
  if [[ ! -f "$ARTIFACT_DIR/samples/request-results.tsv" ]]; then
    printf 'timestamp_utc\tname\tmethod\turl\tstatus\ttime_total_s\tbytes\tgzip_bytes\tapp_rss_before\tapp_rss_after\tdb_rss_before\tdb_rss_after\tbooks\n' >"$ARTIFACT_DIR/samples/request-results.tsv"
  fi
  http_status="$(awk -F= '/^http_status=/{print $2}' "$meta_file")"
  time_total="$(awk -F= '/^time_total=/{print $2}' "$meta_file")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$name" "$method" "$url" "$http_status" "$time_total" "$bytes" "$gzip_bytes" "$before_app" "$after_app" "$before_db" "$after_db" "$books" >>"$ARTIFACT_DIR/samples/request-results.tsv"
}
