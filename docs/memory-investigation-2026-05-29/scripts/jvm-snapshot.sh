#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_env ARTIFACT_DIR
require_env APP_CONTAINER

LABEL="${LABEL:-snapshot}"
ensure_artifact_dirs "$ARTIFACT_DIR"

docker exec "$APP_CONTAINER" jcmd 1 GC.heap_info >"$ARTIFACT_DIR/samples/heap-info-${LABEL}.txt" 2>"$ARTIFACT_DIR/samples/heap-info-${LABEL}.stderr" || true
docker exec "$APP_CONTAINER" jcmd 1 VM.native_memory summary >"$ARTIFACT_DIR/samples/nmt-summary-${LABEL}.txt" 2>"$ARTIFACT_DIR/samples/nmt-summary-${LABEL}.stderr" || true
docker exec "$APP_CONTAINER" jcmd 1 GC.class_histogram >"$ARTIFACT_DIR/samples/class-histogram-${LABEL}.txt" 2>"$ARTIFACT_DIR/samples/class-histogram-${LABEL}.stderr" || true
