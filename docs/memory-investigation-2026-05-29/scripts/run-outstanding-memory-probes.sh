#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

require_cmd docker
require_cmd curl
require_cmd jq
require_cmd python3
require_cmd sha256sum

VERIFY_ID="${VERIFY_ID:-V30-outstanding-memory-probes}"
ARTIFACT_DIR="${ARTIFACT_DIR:-$(init_artifact_dir "$VERIFY_ID")}"
SOURCE_BOOK_DIR="${SOURCE_BOOK_DIR:-/home/alex/Projects/book-apps-benchmark/books/books_10K}"
SUBSET_COUNT="${SUBSET_COUNT:-2000}"
BOOKDROP_COUNT="${BOOKDROP_COUNT:-500}"
GRIMMORY_IMAGE="${GRIMMORY_IMAGE:-ghcr.io/grimmory-tools/grimmory:nightly}"
DB_IMAGE="${DB_IMAGE:-lscr.io/linuxserver/mariadb:11.4.8}"
APP_PORT="${APP_PORT:-6210}"
DB_PORT="${DB_PORT:-3510}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-grimmory}"
SAMPLE_INTERVAL="${SAMPLE_INTERVAL:-1}"
IMPORT_TIMEOUT_SECONDS="${IMPORT_TIMEOUT_SECONDS:-2400}"
TASK_TIMEOUT_SECONDS="${TASK_TIMEOUT_SECONDS:-3600}"
BOOKDROP_TIMEOUT_SECONDS="${BOOKDROP_TIMEOUT_SECONDS:-1800}"
STARTUP_BACKFILL_TIMEOUT_SECONDS="${STARTUP_BACKFILL_TIMEOUT_SECONDS:-1800}"
CBZ_LARGE_ENTRY_MB="${CBZ_LARGE_ENTRY_MB:-64}"
PDF_PAGES="${PDF_PAGES:-40}"
RUN_METADATA_APPLY="${RUN_METADATA_APPLY:-1}"
RUN_METADATA_REVIEW="${RUN_METADATA_REVIEW:-1}"

[[ -d "$SOURCE_BOOK_DIR" ]] || die "SOURCE_BOOK_DIR must point to an existing directory"
[[ "$SUBSET_COUNT" =~ ^[0-9]+$ ]] || die "SUBSET_COUNT must be numeric"
[[ "$BOOKDROP_COUNT" =~ ^[0-9]+$ ]] || die "BOOKDROP_COUNT must be numeric"
[[ "$CBZ_LARGE_ENTRY_MB" =~ ^[0-9]+$ ]] || die "CBZ_LARGE_ENTRY_MB must be numeric"
[[ "$PDF_PAGES" =~ ^[0-9]+$ ]] || die "PDF_PAGES must be numeric"
(( SUBSET_COUNT > 0 )) || die "SUBSET_COUNT must be > 0"
(( BOOKDROP_COUNT >= 0 )) || die "BOOKDROP_COUNT must be >= 0"

export ARTIFACT_DIR MYSQL_ROOT_PASSWORD
ensure_artifact_dirs "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/runtime/data" "$ARTIFACT_DIR/runtime/bookdrop" "$ARTIFACT_DIR/runtime/mysql" "$ARTIFACT_DIR/runtime/books" "$ARTIFACT_DIR/runtime/bookdrop-payload"
append_manifest

cat >>"$ARTIFACT_DIR/manifest.env" <<EOF
verification_id=$VERIFY_ID
source_book_dir=$SOURCE_BOOK_DIR
subset_count=$SUBSET_COUNT
bookdrop_count=$BOOKDROP_COUNT
grimmory_image=$GRIMMORY_IMAGE
db_image=$DB_IMAGE
app_port=$APP_PORT
db_port=$DB_PORT
admin_user=$ADMIN_USER
sample_interval=$SAMPLE_INTERVAL
import_timeout_seconds=$IMPORT_TIMEOUT_SECONDS
task_timeout_seconds=$TASK_TIMEOUT_SECONDS
bookdrop_timeout_seconds=$BOOKDROP_TIMEOUT_SECONDS
startup_backfill_timeout_seconds=$STARTUP_BACKFILL_TIMEOUT_SECONDS
cbz_large_entry_mb=$CBZ_LARGE_ENTRY_MB
pdf_pages=$PDF_PAGES
run_metadata_apply=$RUN_METADATA_APPLY
run_metadata_review=$RUN_METADATA_REVIEW
EOF

COMPOSE_PROJECT="grimmorymemv30$(date -u +%Y%m%d%H%M%S)"
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

run_step 000-build-fixtures env \
  SOURCE_BOOK_DIR="$SOURCE_BOOK_DIR" \
  TARGET_BOOK_DIR="$ARTIFACT_DIR/runtime/books" \
  BOOKDROP_PAYLOAD_DIR="$ARTIFACT_DIR/runtime/bookdrop-payload" \
  SUBSET_COUNT="$SUBSET_COUNT" \
  BOOKDROP_COUNT="$BOOKDROP_COUNT" \
  CBZ_LARGE_ENTRY_MB="$CBZ_LARGE_ENTRY_MB" \
  PDF_PAGES="$PDF_PAGES" \
  python3 - <<'PY'
import binascii
import os
import shutil
import struct
import textwrap
import zlib
import zipfile
from pathlib import Path

source = Path(os.environ["SOURCE_BOOK_DIR"])
target = Path(os.environ["TARGET_BOOK_DIR"])
bookdrop = Path(os.environ["BOOKDROP_PAYLOAD_DIR"])
subset_count = int(os.environ["SUBSET_COUNT"])
bookdrop_count = int(os.environ["BOOKDROP_COUNT"])
large_mb = int(os.environ["CBZ_LARGE_ENTRY_MB"])
pdf_pages = int(os.environ["PDF_PAGES"])
target.mkdir(parents=True, exist_ok=True)
bookdrop.mkdir(parents=True, exist_ok=True)

epubs = sorted(source.rglob("*.epub"))
if len(epubs) < subset_count:
    raise SystemExit(f"Only {len(epubs)} EPUBs available; need {subset_count}")

def link_or_copy(src: Path, dst: Path):
    if dst.exists():
        dst.unlink()
    try:
        os.link(src, dst)
    except OSError:
        shutil.copy2(src, dst)

for idx, src in enumerate(epubs[:subset_count], 1):
    link_or_copy(src, target / f"bench-{idx:05d}.epub")

for idx, src in enumerate(epubs[:bookdrop_count], 1):
    link_or_copy(src, bookdrop / f"bookdrop-{idx:05d}.epub")

def png_bytes(width=1, height=1, rgb=(120, 140, 180)):
    def chunk(kind, data):
        return (
            struct.pack(">I", len(data))
            + kind
            + data
            + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)
        )
    raw = b"".join(b"\x00" + bytes(rgb) * width for _ in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )

def write_pdf(path: Path, pages: int):
    objects = []
    font_obj = 3 + pages * 2
    kids = []
    for page in range(pages):
        page_obj = 3 + page * 2
        content_obj = page_obj + 1
        kids.append(f"{page_obj} 0 R")
        text = f"BT /F1 24 Tf 72 720 Td (Synthetic PDF page {page + 1}) Tj ET".encode()
        objects.append((page_obj, f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 {font_obj} 0 R >> >> /Contents {content_obj} 0 R >>".encode()))
        objects.append((content_obj, b"<< /Length " + str(len(text)).encode() + b" >>\nstream\n" + text + b"\nendstream"))
    objects.insert(0, (1, b"<< /Type /Catalog /Pages 2 0 R >>"))
    objects.insert(1, (2, f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {pages} >>".encode()))
    objects.append((font_obj, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"))
    objects.sort(key=lambda item: item[0])
    data = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = {0: 0}
    for obj_id, body in objects:
        offsets[obj_id] = len(data)
        data.extend(f"{obj_id} 0 obj\n".encode())
        data.extend(body)
        data.extend(b"\nendobj\n")
    xref_offset = len(data)
    max_obj = max(offsets)
    data.extend(f"xref\n0 {max_obj + 1}\n".encode())
    data.extend(b"0000000000 65535 f \n")
    for obj_id in range(1, max_obj + 1):
        data.extend(f"{offsets[obj_id]:010d} 00000 n \n".encode())
    data.extend(f"trailer\n<< /Size {max_obj + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode())
    path.write_bytes(data)

write_pdf(target / "synthetic-reader.pdf", pdf_pages)

with zipfile.ZipFile(target / "synthetic-large-cover.cbz", "w", compression=zipfile.ZIP_STORED) as zf:
    zf.writestr("001-large-invalid-cover.jpg", os.urandom(large_mb * 1024 * 1024))
    zf.writestr("002-valid-page.png", png_bytes(1, 1))
    zf.writestr(
        "ComicInfo.xml",
        textwrap.dedent(
            """\
            <?xml version="1.0" encoding="UTF-8"?>
            <ComicInfo>
              <Title>Synthetic Large Cover Comic</Title>
              <Series>Memory Probe</Series>
              <PageCount>2</PageCount>
            </ComicInfo>
            """
        ),
    )

for path in sorted(target.rglob("*")) + sorted(bookdrop.rglob("*")):
    if path.is_file():
        print(f"{path}\t{path.stat().st_size}")
PY

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
      - ${ARTIFACT_DIR}/runtime/books:/books
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

run_detached_step 020-sample-loop bash -c "source '$SCRIPT_DIR/common.sh'; ARTIFACT_DIR='$ARTIFACT_DIR' MYSQL_ROOT_PASSWORD='$MYSQL_ROOT_PASSWORD' sample_loop '$APP_CONTAINER' '$DB_CONTAINER' '$SAMPLE_INTERVAL' outstanding-probes"
SAMPLE_PID="$(cat "$ARTIFACT_DIR/pids/020-sample-loop.pid")"

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-setup"
run_step 030-setup-admin bash -c "source '$SCRIPT_DIR/common.sh'; setup_admin_if_needed 'http://127.0.0.1:${APP_PORT}' '$ADMIN_USER' '$ADMIN_PASSWORD'"
TOKEN="$(auth_token "http://127.0.0.1:${APP_PORT}" "$ADMIN_USER" "$ADMIN_PASSWORD")"
printf '%s\n' "$TOKEN" >"$ARTIFACT_DIR/runtime/access-token.txt"
chmod 600 "$ARTIFACT_DIR/runtime/access-token.txt"

cat >"$ARTIFACT_DIR/runtime/disable-bookdrop-metadata.json" <<'EOF'
[
  { "name": "METADATA_DOWNLOAD_ON_BOOKDROP", "value": false }
]
EOF

run_step 035-disable-bookdrop-metadata curl -fsS -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/disable-bookdrop-metadata.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/settings"

cat >"$ARTIFACT_DIR/runtime/create-library.json" <<'EOF'
{
  "name": "Outstanding Memory Probe Library",
  "paths": [
    { "path": "/books" }
  ],
  "watch": false,
  "formatPriority": ["EPUB", "PDF", "CBX"],
  "allowedFormats": ["EPUB", "PDF", "CBX"],
  "metadataSource": "EMBEDDED",
  "organizationMode": "BOOK_PER_FILE"
}
EOF

run_step 040-create-library curl -fsS \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d @"$ARTIFACT_DIR/runtime/create-library.json" \
  "http://127.0.0.1:${APP_PORT}/api/v1/libraries"

EXPECTED_BOOKS=$((SUBSET_COUNT + 2))
start="$(date +%s)"
while true; do
  count="$(book_count "$DB_CONTAINER")"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-import"
  if [[ -n "$count" && "$count" -ge "$EXPECTED_BOOKS" ]]; then
    break
  fi
  if (( $(date +%s) - start >= IMPORT_TIMEOUT_SECONDS )); then
    die "Timed out waiting for $EXPECTED_BOOKS imported books; current=$count"
  fi
  sleep 5
done

sleep 15
sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-import-idle"

run_step 050-query-ids bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select b.id, bf.book_type, bf.file_name
from book b join book_file bf on bf.book_id = b.id and bf.is_book = 1
order by b.id;
\""

EPUB_ID="$(awk -F'\t' '$2=="EPUB"{print $1; exit}' "$ARTIFACT_DIR/commands/050-query-ids.stdout.log")"
PDF_ID="$(awk -F'\t' '$2=="PDF"{print $1; exit}' "$ARTIFACT_DIR/commands/050-query-ids.stdout.log")"
CBX_ID="$(awk -F'\t' '$2=="CBX"{print $1; exit}' "$ARTIFACT_DIR/commands/050-query-ids.stdout.log")"
[[ -n "$EPUB_ID" ]] || die "Could not find EPUB book id"
[[ -n "$PDF_ID" ]] || die "Could not find PDF book id"
[[ -n "$CBX_ID" ]] || die "Could not find CBX book id"
printf 'epub_id=%s\npdf_id=%s\ncbx_id=%s\n' "$EPUB_ID" "$PDF_ID" "$CBX_ID" >>"$ARTIFACT_DIR/manifest.env"

mkdir -p "$ARTIFACT_DIR/samples/operations"
printf 'timestamp_utc\tname\tmethod\turl\tstatus\ttime_total_s\tbytes\tgzip_bytes\tapp_rss_before\tapp_rss_after\tdb_rss_before\tdb_rss_after\tbooks\n' >"$ARTIFACT_DIR/samples/operation-results.tsv"

operation_probe() {
  local name="$1"
  local method="$2"
  local url="$3"
  local data_file="${4:-}"
  local extra_header="${5:-}"
  local header_args=()
  local body="$ARTIFACT_DIR/samples/operations/${name}.body"
  local headers="$ARTIFACT_DIR/samples/operations/${name}.headers.txt"
  local meta="$ARTIFACT_DIR/samples/operations/${name}.meta.txt"
  local stderr="$ARTIFACT_DIR/samples/operations/${name}.stderr.log"
  local before_app before_db after_app after_db books status time_total bytes gzip_bytes
  if [[ -n "$extra_header" ]]; then
    header_args=(-H "$extra_header")
  fi
  before_app="$(container_memory_bytes "$APP_CONTAINER")"
  before_db="$(container_memory_bytes "$DB_CONTAINER")"
  if [[ -n "$data_file" ]]; then
    curl -sS -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Content-Type: application/json' \
      -H 'Accept-Encoding: identity' \
      "${header_args[@]}" \
      -d @"$data_file" \
      -D "$headers" \
      -o "$body" \
      -w 'http_status=%{http_code}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' \
      "$url" >"$meta" 2>"$stderr" || true
  else
    curl -sS -X "$method" \
      -H "Authorization: Bearer $TOKEN" \
      -H 'Accept-Encoding: identity' \
      "${header_args[@]}" \
      -D "$headers" \
      -o "$body" \
      -w 'http_status=%{http_code}\ntime_total=%{time_total}\nsize_download=%{size_download}\n' \
      "$url" >"$meta" 2>"$stderr" || true
  fi
  after_app="$(container_memory_bytes "$APP_CONTAINER")"
  after_db="$(container_memory_bytes "$DB_CONTAINER")"
  books="$(book_count "$DB_CONTAINER")"
  status="$(awk -F= '/^http_status=/{print $2}' "$meta")"
  time_total="$(awk -F= '/^time_total=/{print $2}' "$meta")"
  bytes="$(wc -c <"$body" | tr -d ' ')"
  gzip_bytes="$(gzip -c "$body" | wc -c | tr -d ' ')"
  sha256sum "$body" >>"$ARTIFACT_DIR/samples/sha256sums.txt"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$(ts_utc)" "$name" "$method" "$url" "$status" "$time_total" "$bytes" "$gzip_bytes" "$before_app" "$after_app" "$before_db" "$after_db" "$books" \
    >>"$ARTIFACT_DIR/samples/operation-results.tsv"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "post-${name}"
}

cat >"$ARTIFACT_DIR/runtime/duplicates.json" <<EOF
{
  "libraryId": 1,
  "matchByIsbn": true,
  "matchByExternalId": true,
  "matchByTitleAuthor": true,
  "matchByDirectory": true,
  "matchByFilename": true
}
EOF

cat >"$ARTIFACT_DIR/runtime/metadata-refresh-apply.json" <<'EOF'
{
  "taskType": "REFRESH_METADATA_MANUAL",
  "options": {
    "refreshType": "LIBRARY",
    "libraryId": 1,
    "refreshOptions": {
      "libraryId": 1,
      "refreshCovers": false,
      "mergeCategories": false,
      "reviewBeforeApply": false,
      "replaceMode": "REPLACE_MISSING",
      "fieldOptions": {},
      "enabledFields": {
        "title": false, "subtitle": false, "description": false, "authors": false,
        "publisher": false, "publishedDate": false, "seriesName": false,
        "seriesNumber": false, "seriesTotal": false, "isbn13": false, "isbn10": false,
        "language": false, "categories": false, "cover": false, "pageCount": false,
        "asin": false, "goodreadsId": false, "comicvineId": false, "hardcoverId": false,
        "hardcoverBookId": false, "googleId": false, "lubimyczytacId": false,
        "amazonRating": false, "amazonReviewCount": false, "goodreadsRating": false,
        "goodreadsReviewCount": false, "hardcoverRating": false, "hardcoverReviewCount": false,
        "lubimyczytacRating": false, "ranobedbId": false, "ranobedbRating": false,
        "audibleId": false, "audibleRating": false, "audibleReviewCount": false,
        "moods": false, "tags": false
      }
    }
  }
}
EOF

sed 's/"reviewBeforeApply": false/"reviewBeforeApply": true/' "$ARTIFACT_DIR/runtime/metadata-refresh-apply.json" >"$ARTIFACT_DIR/runtime/metadata-refresh-review.json"

cat >"$ARTIFACT_DIR/runtime/library-rescan-metadata.json" <<'EOF'
{
  "taskType": "REFRESH_LIBRARY_METADATA",
  "options": {
    "updateMetadataFromFiles": true,
    "metadataReplaceMode": "REPLACE_MISSING"
  }
}
EOF

cat >"$ARTIFACT_DIR/runtime/recommendations.json" <<'EOF'
{
  "taskType": "UPDATE_BOOK_RECOMMENDATIONS",
  "options": null
}
EOF

cat >"$ARTIFACT_DIR/runtime/bookdrop-scan.json" <<'EOF'
{
  "taskType": "BOOKDROP_PERIODIC_SCANNING",
  "options": null
}
EOF

printf 'timestamp_utc\ttask_name\ttask_id\tstatus\tprogress\tmessage\tapp_rss_bytes\tdb_rss_bytes\tbooks\n' >"$ARTIFACT_DIR/samples/task-status.tsv"

start_task() {
  local task_name="$1"
  local json_file="$2"
  local response="$ARTIFACT_DIR/samples/operations/${task_name}-start.body"
  operation_probe "${task_name}-start" POST "http://127.0.0.1:${APP_PORT}/api/v1/tasks/start" "$json_file"
  jq -r '.taskId // empty' "$response"
}

wait_task() {
  local task_name="$1"
  local task_id="$2"
  local timeout_seconds="${3:-$TASK_TIMEOUT_SECONDS}"
  local start_ts status progress message app_rss db_rss books row
  start_ts="$(date +%s)"
  while true; do
    row="$(docker exec "$DB_CONTAINER" mariadb -ugrimmory -pgrimmory -N -B grimmory -e "select status, coalesce(progress_percentage,''), coalesce(message,'') from tasks where id = '${task_id}'" 2>/dev/null || true)"
    status="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $1}')"
    progress="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $2}')"
    message="$(printf '%s\n' "$row" | awk -F'\t' 'NR==1{print $3}')"
    app_rss="$(container_memory_bytes "$APP_CONTAINER")"
    db_rss="$(container_memory_bytes "$DB_CONTAINER")"
    books="$(book_count "$DB_CONTAINER")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "$task_name" "$task_id" "$status" "$progress" "$message" "$app_rss" "$db_rss" "$books" >>"$ARTIFACT_DIR/samples/task-status.tsv"
    sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-${task_name}-${status:-unknown}"
    if [[ "$status" == "COMPLETED" || "$status" == "FAILED" || "$status" == "CANCELLED" ]]; then
      break
    fi
    if (( $(date +%s) - start_ts >= timeout_seconds )); then
      die "Timed out waiting for task $task_name/$task_id; status=$status progress=$progress"
    fi
    sleep 5
  done
}

operation_probe content-epub-full GET "http://127.0.0.1:${APP_PORT}/api/v1/books/${EPUB_ID}/content"
operation_probe content-epub-range GET "http://127.0.0.1:${APP_PORT}/api/v1/books/${EPUB_ID}/content" "" "Range: bytes=0-1048575"
operation_probe content-pdf-full GET "http://127.0.0.1:${APP_PORT}/api/v1/books/${PDF_ID}/content"
operation_probe media-cover GET "http://127.0.0.1:${APP_PORT}/api/v1/media/book/${EPUB_ID}/cover"
operation_probe media-thumbnail GET "http://127.0.0.1:${APP_PORT}/api/v1/media/book/${EPUB_ID}/thumbnail"
operation_probe epub-info GET "http://127.0.0.1:${APP_PORT}/api/v1/epub/${EPUB_ID}/info"
EPUB_PATH="$(jq -r '.spine[0].href // (.manifest[] | select((.mediaType // "") | test("html|xhtml")) | .href) // empty' "$ARTIFACT_DIR/samples/operations/epub-info.body" | head -1)"
if [[ -n "$EPUB_PATH" ]]; then
  printf 'epub_stream_path=%s\n' "$EPUB_PATH" >>"$ARTIFACT_DIR/manifest.env"
  operation_probe epub-file GET "http://127.0.0.1:${APP_PORT}/api/v1/epub/${EPUB_ID}/file/${EPUB_PATH}"
fi
operation_probe pdf-info GET "http://127.0.0.1:${APP_PORT}/api/v1/pdf/${PDF_ID}/info"
operation_probe pdf-pages GET "http://127.0.0.1:${APP_PORT}/api/v1/pdf/${PDF_ID}/pages"
operation_probe cbx-pages GET "http://127.0.0.1:${APP_PORT}/api/v1/cbx/${CBX_ID}/pages"
operation_probe cbx-page-info GET "http://127.0.0.1:${APP_PORT}/api/v1/cbx/${CBX_ID}/page-info"
operation_probe cbx-page-dimensions GET "http://127.0.0.1:${APP_PORT}/api/v1/cbx/${CBX_ID}/page-dimensions"
operation_probe cbx-page-image GET "http://127.0.0.1:${APP_PORT}/api/v1/media/book/${CBX_ID}/cbx/pages/1"
operation_probe duplicates POST "http://127.0.0.1:${APP_PORT}/api/v1/books/duplicates" "$ARTIFACT_DIR/runtime/duplicates.json"
operation_probe sidecar-export-all POST "http://127.0.0.1:${APP_PORT}/api/v1/libraries/1/sidecar/export-all"
operation_probe sidecar-import-all POST "http://127.0.0.1:${APP_PORT}/api/v1/libraries/1/sidecar/import-all"

if [[ "$RUN_METADATA_APPLY" == "1" ]]; then
  METADATA_APPLY_TASK_ID="$(start_task metadata-refresh-apply "$ARTIFACT_DIR/runtime/metadata-refresh-apply.json")"
  printf 'metadata_apply_task_id=%s\n' "$METADATA_APPLY_TASK_ID" >>"$ARTIFACT_DIR/manifest.env"
  wait_task metadata-refresh-apply "$METADATA_APPLY_TASK_ID"
fi

if [[ "$RUN_METADATA_REVIEW" == "1" ]]; then
  METADATA_REVIEW_TASK_ID="$(start_task metadata-refresh-review "$ARTIFACT_DIR/runtime/metadata-refresh-review.json")"
  printf 'metadata_review_task_id=%s\n' "$METADATA_REVIEW_TASK_ID" >>"$ARTIFACT_DIR/manifest.env"
  wait_task metadata-refresh-review "$METADATA_REVIEW_TASK_ID"

  operation_probe book-reviews-list GET "http://127.0.0.1:${APP_PORT}/api/v1/reviews/book/${EPUB_ID}"
fi

run_step 060-copy-bookdrop-payload bash -lc "cp -a '$ARTIFACT_DIR/runtime/bookdrop-payload/.' '$ARTIFACT_DIR/runtime/bookdrop/'"
BOOKDROP_TASK_ID="$(start_task bookdrop-periodic-scan "$ARTIFACT_DIR/runtime/bookdrop-scan.json")"
printf 'bookdrop_scan_task_id=%s\n' "$BOOKDROP_TASK_ID" >>"$ARTIFACT_DIR/manifest.env"
wait_task bookdrop-periodic-scan "$BOOKDROP_TASK_ID" 300

printf 'timestamp_utc\tpending_count\ttotal_count\tapp_rss_bytes\tdb_rss_bytes\n' >"$ARTIFACT_DIR/samples/bookdrop-status.tsv"
bookdrop_start="$(date +%s)"
while true; do
  pending="$(docker exec "$DB_CONTAINER" mariadb -ugrimmory -pgrimmory -N -B grimmory -e "select count(*) from bookdrop_file where status = 'PENDING_REVIEW';" 2>/dev/null | tr -dc '0-9' || true)"
  total="$(docker exec "$DB_CONTAINER" mariadb -ugrimmory -pgrimmory -N -B grimmory -e "select count(*) from bookdrop_file;" 2>/dev/null | tr -dc '0-9' || true)"
  printf '%s\t%s\t%s\t%s\t%s\n' "$(ts_utc)" "${pending:-0}" "${total:-0}" "$(container_memory_bytes "$APP_CONTAINER")" "$(container_memory_bytes "$DB_CONTAINER")" >>"$ARTIFACT_DIR/samples/bookdrop-status.tsv"
  sample_once "$APP_CONTAINER" "$DB_CONTAINER" "poll-bookdrop-${total:-0}"
  if [[ -n "$total" && "$total" -ge "$BOOKDROP_COUNT" ]]; then
    break
  fi
  if (( $(date +%s) - bookdrop_start >= BOOKDROP_TIMEOUT_SECONDS )); then
    die "Timed out waiting for bookdrop files; total=${total:-0}, expected=$BOOKDROP_COUNT"
  fi
  sleep 5
done
operation_probe bookdrop-files-page GET "http://127.0.0.1:${APP_PORT}/api/v1/bookdrop/files?status=pending&page=0&size=50"

RECOMMENDATION_TASK_ID="$(start_task contention-recommendations "$ARTIFACT_DIR/runtime/recommendations.json")"
printf 'contention_recommendation_task_id=%s\n' "$RECOMMENDATION_TASK_ID" >>"$ARTIFACT_DIR/manifest.env"
LIBRARY_RESCAN_TASK_ID="$(start_task contention-library-rescan "$ARTIFACT_DIR/runtime/library-rescan-metadata.json")"
printf 'contention_library_rescan_task_id=%s\n' "$LIBRARY_RESCAN_TASK_ID" >>"$ARTIFACT_DIR/manifest.env"
wait_task contention-recommendations "$RECOMMENDATION_TASK_ID"
wait_task contention-library-rescan "$LIBRARY_RESCAN_TASK_ID"

run_step 070-query-post-operations bash -lc "
docker exec '$DB_CONTAINER' mariadb -ugrimmory -pgrimmory -N -B grimmory -e \"
select 'books', count(*) from book
union all select 'bookdrop_files', count(*) from bookdrop_file
union all select 'metadata_fetch_jobs', count(*) from metadata_fetch_jobs
union all select 'metadata_fetch_proposals', count(*) from metadata_fetch_proposals
union all select 'sidecar_json_book_files', count(*) from book_file where file_name like '%.json';
\""

sample_once "$APP_CONTAINER" "$DB_CONTAINER" "pre-startup-backfill-restart"
run_step 080-delete-heavy-app-migrations bash -lc "
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

run_step 081-restart-app docker restart "$APP_CONTAINER"
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
collect_container_evidence "$APP_CONTAINER" "$DB_CONTAINER"
kill_tree "$SAMPLE_PID"
SAMPLE_PID=""
run_step 090-compose-down docker compose -p "$COMPOSE_PROJECT" -f "$ARTIFACT_DIR/docker/compose.yml" down
run_step 095-process-audit bash -lc "pgrep -af '[s]ample_loop|[g]rimmorymemv30' || true"
run_step 096-docker-ps-final bash -lc "docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sort"
cp "$ARTIFACT_DIR/commands/096-docker-ps-final.stdout.log" "$ARTIFACT_DIR/docker/ps-final.txt"
CLEANED_UP=1

cat >"$ARTIFACT_DIR/notes.md" <<EOF
# Run Notes

- Verification ID: ${VERIFY_ID}
- Evidence grade: A
- Image: ${GRIMMORY_IMAGE}
- Digest: $(grep '^app=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Database image: ${DB_IMAGE}
- Database digest: $(grep '^db=' "$ARTIFACT_DIR/docker/image-digests.txt" | cut -d= -f2-)
- Git commit: $(git rev-parse HEAD)
- Imported benchmark EPUB subset: ${SUBSET_COUNT}
- Bookdrop payload count: ${BOOKDROP_COUNT}
- Synthetic CBZ large first entry: ${CBZ_LARGE_ENTRY_MB} MiB
- Synthetic PDF pages: ${PDF_PAGES}
- EPUB ID: ${EPUB_ID}
- PDF ID: ${PDF_ID}
- CBX ID: ${CBX_ID}
- Result: outstanding memory probes completed; inspect samples/operation-results.tsv, samples/task-status.tsv, samples/bookdrop-status.tsv, samples/docker-stats.tsv, and logs/startup-backfills.log.
- Artifacts: ${ARTIFACT_DIR}
- Commands: ${ARTIFACT_DIR}/commands
- Raw samples: ${ARTIFACT_DIR}/samples
- Logs: ${ARTIFACT_DIR}/logs
EOF

printf '%s\n' "$ARTIFACT_DIR"
