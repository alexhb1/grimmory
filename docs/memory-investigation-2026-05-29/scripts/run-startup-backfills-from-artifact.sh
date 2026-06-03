#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd rg

SOURCE_RUN_DIR="${SOURCE_RUN_DIR:-}"
VERIFY_ID="${VERIFY_ID:-V32-startup-backfills-from-artifact}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
STARTUP_BACKFILL_TIMEOUT_SECONDS="${STARTUP_BACKFILL_TIMEOUT_SECONDS:-3600}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
APP_URL="${APP_URL:-}"

[[ -n "$SOURCE_RUN_DIR" ]] || die "SOURCE_RUN_DIR is required"
[[ -d "$SOURCE_RUN_DIR" ]] || die "SOURCE_RUN_DIR must exist: $SOURCE_RUN_DIR"
[[ -f "$SOURCE_RUN_DIR/docker/compose.yml" ]] || die "Missing source compose file"

export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime"
append_manifest

COMPOSE_PROJECT="grimmorymemv32$(date -u +%Y%m%d%H%M%S)"
SOURCE_COMPOSE="$SOURCE_RUN_DIR/docker/compose.yml"
if [[ -z "$APP_URL" && -f "$SOURCE_RUN_DIR/manifest.env" ]]; then
  APP_URL="$(awk -F= '/^app_url=/{print $2}' "$SOURCE_RUN_DIR/manifest.env" | tail -1)"
fi
APP_URL="${APP_URL:-http://127.0.0.1:6214}"
APP_CONTAINER=""
DB_CONTAINER=""
SAMPLE_PID=""
CLEANED_UP=0

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_run_dir=$SOURCE_RUN_DIR
source_compose=$SOURCE_COMPOSE
app_url=$APP_URL
compose_project=$COMPOSE_PROJECT
sample_interval=$SAMPLE_INTERVAL
startup_backfill_timeout_seconds=$STARTUP_BACKFILL_TIMEOUT_SECONDS
EOF

cleanup() {
  set +e
  [[ -n "$SAMPLE_PID" ]] && kill_tree "$SAMPLE_PID"
  if [[ "$CLEANED_UP" != "1" ]]; then
    if [[ -n "$APP_CONTAINER" && -n "$DB_CONTAINER" ]]; then
      collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
    fi
    docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE_COMPOSE" down >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stdout.log" 2>"$ARTIFACT_DIR/commands/999-cleanup-compose-down.stderr.log" || true
    printf '%s\n' "$?" >"$ARTIFACT_DIR/commands/999-cleanup-compose-down.exit"
  fi
}
trap cleanup EXIT

run_step 010-compose-up docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE_COMPOSE" up -d

APP_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE_COMPOSE" ps -q app)"
DB_CONTAINER="$(docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE_COMPOSE" ps -q db)"
export APP_CONTAINER DB_CONTAINER
cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
app_container=$APP_CONTAINER
db_container=$DB_CONTAINER
EOF

if ! wait_http "$APP_URL/api/v1/healthcheck" 240; then
  die "App healthcheck did not become ready"
fi

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' startup-backfills"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-delete-migrations"

run_step 030-query-before bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'book_files', count(*) from book_file
union all select 'app_migrations', count(*) from app_migration;
\""

run_step 040-delete-heavy-app-migrations bash -lc "
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
run_step 050-restart-app docker restart "$APP_CONTAINER"

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
  if (( completed >= 5 )) && curl -fsS "$APP_URL/api/v1/healthcheck" >/dev/null 2>&1; then
    break
  fi
  if (( $(date +%s) - startup_start >= STARTUP_BACKFILL_TIMEOUT_SECONDS )); then
    die "Timed out waiting for startup backfill migrations; completed markers=$completed"
  fi
  sleep 5
done

sleep 30
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-startup-backfills-idle"

run_step 060-query-after bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'book_files', count(*) from book_file
union all select 'app_migrations', count(*) from app_migration;
\""

collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
kill_tree "$SAMPLE_PID"
SAMPLE_PID=""
run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$SOURCE_COMPOSE" down
run_step 095-process-audit bash -lc "pgrep -af '[s]ample_loop|[g]rimmorymemv32' || true"
run_step 096-docker-ps-final bash -lc "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort"
CLEANED_UP=1

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Source run directory: ${SOURCE_RUN_DIR}
- Startup backfill timeout: ${STARTUP_BACKFILL_TIMEOUT_SECONDS}s
- Result: startup backfill migrations completed after deleting migration markers.
- Artifacts: ${ARTIFACT_DIR}
EOF

printf '%s\n' "$ARTIFACT_DIR"
