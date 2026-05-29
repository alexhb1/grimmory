# Grimmory Memory Verification Plan - 2026-05-29

## Purpose

This plan turns the combined memory diagnosis into repeatable verification work. It is designed so an agent can run one finding at a time, collect direct evidence, and fill the blank-verification diagnosis document:

- `docs/memory-use-combined-diagnosis-blank-verification-2026-05-29.md`

The plan is intentionally script-friendly. Each verification item has an ID, a hypothesis, a workload, metrics, expected artifacts, and a decision rule.

## Operating Rules

- Give a scope and rough time estimate before any command expected to run longer than 60 seconds.
- Run long jobs detached and poll them with short commands.
- Keep each verification in its own artifact directory. A verification without a durable artifact directory is not complete.
- Save command stdout, stderr, exit status, and the exact command text to files. Do not rely on terminal scrollback or eventual chat output.
- When launching a whole harness detached with `nohup` or `&`, wrap that driver command so the top-level `driver.cmd`, `driver.stdout.log`, `driver.stderr.log`, and `driver.exit` are also written. Inner `run_step` files are necessary but not a substitute for the top-level driver exit.
- Pin image tags and record image digests.
- Record app container RSS and DB container RSS separately.
- For representative user behavior, prefer the exact production image. For JVM internals, add a debug JDK/NMT run as a second pass.
- Do not treat Docker RSS alone as proof of a Java heap leak.
- Change one variable at a time: dataset size, endpoint variant, browser presence, heap cap, or concurrency.
- When a finding cannot be verified, record the blocker and the next needed instrumentation.
- Preserve raw evidence first, then write summaries. The summary should cite artifact paths, not replace them.
- Use a "no artifact, no claim" standard. A number is not evidence unless the command that produced it, its exit status, raw output, and relevant samples/logs are preserved under `.memory-runs/`.
- Prefer commands that write directly to files inside the artifact directory. Terminal output is acceptable for polling only; do not base final diagnosis on scrollback.
- If credentials or bearer tokens are needed, keep them in `runtime/` files inside the artifact directory and avoid copying secrets into docs. Command files may reference those files instead of embedding tokens.

## Evidence Standard

Every completed verification should produce a minimum evidence packet:

- `manifest.env` with verification ID, date, git commit, images, digests, dataset path, dataset size, host/container limits, app port, credentials used, and Java options.
- `commands/` with one `.cmd`, `.stdout.log`, `.stderr.log`, and `.exit` file per meaningful command or script step.
- a top-level detached driver command file and exit status when the whole run is backgrounded.
- `samples/` with raw time-series measurements, not only final peaks.
- `logs/` with app and DB logs captured before containers are removed.
- `docker/` with compose files, image digests, container inspect JSON, and container restart/OOM status.
- `notes.md` with the human-readable conclusion and links to the raw files that support it.

Evidence grades:

| Grade | Meaning | Use |
|---|---|---|
| A | Exact user-facing image and realistic access path | Needed before calling a finding representative of user experience |
| B | Debug JDK/NMT/JFR run against the same workload | Needed for heap/native/allocation attribution |
| C | Source inspection or static code audit only | Useful for prioritization, not enough to mark runtime impact verified |
| D | Hypothesis with no run or source confirmation | Keep in backlog only |

For most important findings, aim for both Grade A and Grade B evidence: exact image to prove the user-facing behavior, debug JVM to explain why it happens.

## Run Acceptance Gate

A verification run is not complete until these checks pass or the failure is documented as a harness bug:

- the top-level driver command, stdout, stderr, and exit status are saved when the run was detached;
- every evidence-producing step has a saved `.cmd`, `.stdout.log`, `.stderr.log`, and `.exit`;
- all non-zero exits are explained in `notes.md` and are not accidentally treated as confirmed runtime behavior;
- raw samples have headers, timestamps, and enough rows to show the workload window, peak, and post-idle/post-GC state where applicable;
- Docker image digests, final container state, restart counts, and OOM flags are captured before cleanup;
- app and DB logs are captured before containers are removed;
- a final cleanup/process audit is captured for long sampler/profiler runs, preferably from the outer driver after the harness process has exited so the audit is not just seeing itself;
- `notes.md` names the verification ID, evidence grade, workload, artifact directory, exact image digest, conclusion, and remaining gaps;
- the filled diagnosis cites the artifact directory and enough numbers to support the conclusion without rereading terminal scrollback.

## Real-World Representativeness

The verification plan should avoid proving only an artificial lab case. Each high-priority finding should include at least one representative run:

- Use the actual nightly or release image pulled from the Grimmory registry, and record the digest.
- Use the same database sidecar family users are likely to run, then record its exact image and digest.
- Use normal authentication and HTTP/websocket paths instead of direct service calls where possible.
- For frontend findings, drive a real browser with Playwright and capture network requests.
- For benchmark comparison, run the same synthetic benchmark fixture, but clearly label it synthetic.
- Add at least one more realistic fixture for media-heavy findings: large covers, large PDFs/comics, folder audiobooks, many unique metadata values, or filesystem event storms.
- Do not generalize from the debug JDK container alone. Debug containers can miss native libraries or differ from the production JRE image.
- Separate "user-image behavior" from "JVM explanation" in the notes.

## Time Classes

| Class | Expected time | Workflow |
|---|---:|---|
| S | Under 60 seconds | Run directly after a brief update |
| M | 1-10 minutes | Give scope/time estimate first; keep polling responsive |
| L | 10-60 minutes | Run detached; poll every 30-90 seconds |
| XL | Over 60 minutes | Run detached with clear checkpoint artifacts and stop/resume instructions |

## Common Artifact Layout

Use one root per verification campaign:

```text
/home/alex/Projects/grimmory/.memory-runs/
  run-YYYYMMDDTHHMMSSZ/
    manifest.env
    run-ledger.tsv
    commands/
      001-pull-image.cmd
      001-pull-image.stdout.log
      001-pull-image.stderr.log
      001-pull-image.exit
      ...
    docker/
      compose.yml
      image-digests.txt
      inspect-app.json
      inspect-db.json
      container-state-final.json
    samples/
      docker-stats.tsv
      heap-info.tsv
      nmt-summary-*.txt
      class-histogram-*.txt
      jfr-*.jfr
      request-results.tsv
      browser-metrics.jsonl
      db-counts.tsv
    logs/
      app.log
      db.log
    summaries/
      jfr-summary.txt
      class-histogram-summary.txt
      endpoint-summary.tsv
    notes.md
```

`.memory-runs/` is intentionally outside `docs/` because runs can be large. Do not commit raw JFRs, heap dumps, or full logs unless explicitly requested. Commit the plan and curated markdown summaries; keep raw evidence locally under the artifact directory.

Each run should end with a short `notes.md`:

```markdown
# Run Notes

- Verification ID:
- Evidence grade:
- Image:
- Digest:
- Database image:
- Database digest:
- Git commit:
- Dataset:
- Dataset generator/source:
- Dataset file count:
- Browser connected:
- Java options:
- Container memory limits:
- Start time:
- End time:
- Result:
- Evidence summary:
- Artifacts:
- Commands:
- Raw samples:
- Logs:
- Follow-up:
```

## Command Output Discipline

Use a runner wrapper or equivalent pattern for every meaningful command. The important part is that command text, stdout, stderr, and exit status are files.

Suggested wrapper shape:

```bash
run_step() {
  local name="$1"
  shift
  mkdir -p "$ARTIFACT_DIR/commands"
  printf '%q ' "$@" > "$ARTIFACT_DIR/commands/${name}.cmd"
  printf '\n' >> "$ARTIFACT_DIR/commands/${name}.cmd"
  "$@" \
    >"$ARTIFACT_DIR/commands/${name}.stdout.log" \
    2>"$ARTIFACT_DIR/commands/${name}.stderr.log"
  local status=$?
  printf '%s\n' "$status" > "$ARTIFACT_DIR/commands/${name}.exit"
  return "$status"
}
```

For shell pipelines, wrap them explicitly:

```bash
run_step 020-endpoint-probe bash -lc 'set -o pipefail; curl -sS ... | tee "$ARTIFACT_DIR/samples/response.json" | wc -c'
```

For long-running jobs, detach the job but still write durable logs and status files:

```bash
mkdir -p "$ARTIFACT_DIR/pids" "$ARTIFACT_DIR/commands"
printf '%s\n' "bash -lc '<long command>'" > "$ARTIFACT_DIR/commands/100-import.cmd"
nohup bash -lc '<long command>' \
  >"$ARTIFACT_DIR/commands/100-import.stdout.log" \
  2>"$ARTIFACT_DIR/commands/100-import.stderr.log" &
printf '%s\n' "$!" > "$ARTIFACT_DIR/pids/100-import.pid"
```

Then poll with short commands and append to `run-ledger.tsv`:

```text
timestamp_utc step status app_rss_bytes db_rss_bytes books note
```

Before declaring a run finished:

- verify every `.exit` file is present and inspect non-zero exits;
- copy final app and DB logs into `logs/`;
- write final Docker inspect state, including restart count and OOM status;
- record final DB row counts;
- write a conclusion to `notes.md` that cites raw artifact filenames.

## Common Metrics

Collect these whenever practical:

- app container RSS
- DB container RSS
- Java heap used, committed, and max
- NMT committed/reserved summary when running under a JDK
- class histogram before and after explicit GC
- JFR allocation and exception summaries for CPU/allocation-heavy paths
- endpoint response raw bytes, gzip bytes, HTTP status, and wall time
- request concurrency and client count
- DB row counts for books, files, metadata, libraries, users
- relevant log counts, especially repeated warnings/exceptions
- browser heap and network requests for frontend tests
- task queue depth when instrumented

## Large Output Handling

Do not print large payloads to the terminal. Save them, measure them, hash them, and summarize them.

Endpoint probes should write:

- response headers to `samples/responses/<step>.headers.txt`
- response body to `samples/responses/<step>.body` when small enough to keep
- body byte count to `samples/request-results.tsv`
- gzip byte count where relevant
- SHA-256 hash of the body or gzipped body to `samples/sha256sums.txt`
- status code and wall time to `samples/request-results.tsv`

For very large bodies, use one of these approaches and record which one was used:

- save the full body compressed under `samples/responses/`;
- save the full body temporarily, record bytes and hash, then delete it and keep the hash;
- save only a bounded sample plus byte count and hash if disk pressure is a concern.

Heap dumps, JFR files, browser traces, and long logs should also get hashes. The notes should cite the hash file and the raw artifact path.

## Run Acceptance Checklist

A verification run is not acceptable until these are true:

- exact command text is saved for every command that created evidence;
- stdout, stderr, and exit status are saved for every command;
- non-zero exits are explained in `notes.md`;
- image digests and git commit are recorded;
- app and DB RSS are separated;
- raw samples are present, not just a manually copied peak;
- app and DB logs are captured before cleanup;
- final container state records restart count and OOM status;
- a short process audit confirms no detached sampler/probe/import process was left running;
- the conclusion says confirmed, not confirmed, or inconclusive;
- the conclusion links to raw artifact filenames that support it.

For high-priority findings, also require:

- one Grade A exact-image run;
- one control run where the suspected trigger is absent or bounded;
- one post-idle or post-GC observation where practical;
- a clear statement of what would falsify the hypothesis.

## Lessons From The First Investigation

The first memory investigation produced useful evidence, but the repeatable version should preserve more raw material by default:

- Long import/profile jobs should never be foreground-only. Start them detached, save output files, and poll short status commands.
- Docker stats samples need to be written continuously to TSV, not reconstructed from terminal output.
- Public benchmark numbers are useful context, but local runs must preserve image digests, DB image, fixture source, and browser presence to explain differences.
- Exact-image runs answer "what do users experience"; debug JDK/NMT runs answer "why did the JVM do that." Keep both when the finding matters.
- Long-running sampler/profiler commands need explicit cleanup and a final process audit. A run is not finished while orphaned sample loops are still writing files.
- When a run does not reproduce a public number, that is still evidence. Record the negative result with the same care as a positive result.
- Synthetic benchmark EPUBs are good for scaling list/import count, but media/download findings need realistic large-file fixtures.
- Endpoint concurrency can be more revealing than single-request tests. Always record client count and overlap timing.
- `stripForListView` style flags need both payload and allocation measurements; response-size-only evidence can be misleading.
- DB sidecar memory can dominate total compose RSS. Never report only combined memory for diagnosis.
- If the source says "unbounded" but the run does not show retained heap, keep the source risk but lower the runtime confidence until a targeted workload proves it.

## Baseline Harnesses to Create

These scripts do not need to exist before verification starts, but this is the shape to build toward.

## Implemented Harnesses In This Campaign

These harnesses now exist and should be reused before inventing new one-off commands:

- `scripts/common.sh`: shared artifact directory, command-output capture, Docker RSS sampling, endpoint probing, DB counts, log collection, hashing, and process-tree cleanup helpers.
- `scripts/run-exact-ingest.sh`: runs the real nightly image plus MariaDB sidecar against a fixture directory, records image digests, imports a library, samples app/DB RSS, saves logs/state/counts, and writes run notes.
- `scripts/probe-endpoints.sh`: runs authenticated endpoint probes, records raw/gzip bytes, response hashes, timing, app/DB RSS before/after, concurrent full-list clients, logs, Docker state, and notes.
- `scripts/browser-startup-with-sampling.sh`: wraps the Playwright browser probe with app/DB RSS sampling and standard artifact capture.
- `scripts/browser-probe.mjs`: drives a real Chromium session with `admin / admin123`, captures network JSONL, browser metrics, console logs, screenshot, trace, and optional retained Chromium heap snapshots.
- `scripts/analyze-chrome-heapsnapshot.mjs`: parses a Chrome `.heapsnapshot` into durable top-type, top-name, and interesting-name summaries.
- `scripts/run-debug-jdk-from-db.sh`: boots the extracted nightly jar in a JDK container against a copied MariaDB data directory with NMT enabled.
- `scripts/jvm-snapshot.sh`: captures heap info, NMT summary, and class histogram from a JDK-backed app container.
- `scripts/debug-endpoint-attribution.sh`: runs pre/post GC snapshots, starts/stops JFR, executes endpoint probes, exports JFR summaries, and saves all evidence to files.
- `scripts/run-debug-jdk-ingest.sh`: imports a fixture library with the exact nightly jar running under a JDK image, records production-equivalent JVM flags plus NMT, captures JFR allocation/exception/native-memory views, counts repeated ingest logs, and tears down its compose project.
- `scripts/probe-batch-by-ids.sh`: queries book IDs from the DB, probes `/api/v1/books/batch` at configured ID counts, records accepted/rejected request sizes, payload bytes, timings, RSS, logs, and Docker state.
- `scripts/run-exact-ingest-with-browser.sh`: starts the exact image, opens a real Chromium session before import, records websocket frames/browser heap over time, imports a fixture library, samples app/DB RSS, and preserves all logs/state.
- `scripts/probe-rescan.sh`: triggers an authenticated library refresh, samples app/DB RSS through completion and post-idle, and saves rescan logs/state/counts.
- `scripts/run-folder-zip-download.sh`: creates an incompressible synthetic folder-audiobook fixture, imports it into the exact image, compares buffered `/download` with streaming `/download-all`, and can launch concurrent buffered `/download` clients under RSS sampling.
- `scripts/run-additional-folder-zip-download.sh`: imports one primary EPUB, DB-attaches an incompressible synthetic additional folder, probes `/api/v1/books/{bookId}/files/{fileId}/download`, and records the buffered additional-folder ZIP RSS shape.
- `scripts/run-recommendation-task.sh`: imports an exact-image benchmark subset, starts `UPDATE_BOOK_RECOMMENDATIONS`, polls task status, records DB completion counts, samples app/DB RSS, and preserves failed-start harness evidence separately from clean results.
- `scripts/run-debug-jdk-recommendation-task.sh`: extracts the exact nightly jar into a JDK container, imports a benchmark subset, forces a pre-task GC/snapshot, records JFR only around `UPDATE_BOOK_RECOMMENDATIONS`, exports allocation/exception/hot-method/native-memory views, and captures post-task JVM snapshots.

Known harness caveats:

- Detached samplers must be cleaned up with `kill_tree` from `common.sh`; audit with `ps -ef | rg 'sample_loop|probe-endpoints|browser-startup|debug-endpoint|run-debug-jdk|run-exact-ingest'` before declaring a run complete.
- Detached whole-harness launches should be wrapped so the outer driver writes its own exit status, and should be disowned so the launching shell does not remain as a parent process. One V09 run predates the exit-status rule; one V27 additional-folder run kept a harmless launcher parent until completion. Future runs should avoid both patterns.

### `scripts/common.sh`

Shared helpers:

- create timestamped artifact directory
- write `manifest.env`
- provide `run_step` and `run_detached_step` wrappers that always write command, stdout, stderr, and exit files
- record image digests
- record git commit, branch, and dirty status
- sample `docker stats --no-stream`
- run authenticated curl with raw/gzip byte counts
- record DB counts
- collect logs
- write SHA-256 sums for large artifacts
- validate the run acceptance checklist before cleanup

### `scripts/run-exact-ingest.sh` And Exact-Image Harnesses

Starts the exact Grimmory image plus MariaDB sidecar with a clean data directory. Other exact-image harnesses in `scripts/` reuse the same evidence pattern for endpoint, browser, rescan, ZIP download, and recommendation workloads.

Inputs:

- `GRIMMORY_IMAGE`
- `DB_IMAGE`
- `BOOK_FIXTURE_DIR`
- `APP_PORT`
- `ARTIFACT_DIR`
- optional memory limits

Outputs:

- compose file
- image digests
- container IDs
- startup logs
- final container inspect state
- app and DB logs

### `scripts/run-debug-jdk-from-db.sh` And Debug-JDK Harnesses

Runs the extracted Grimmory jar under a JDK with:

- `-XX:NativeMemoryTracking=summary`
- JFR enabled on demand
- the same relevant app JVM flags as the production image

This harness is not perfectly representative of user images, but it is the main way to collect NMT, heap, class histogram, and JFR details.

It should also record any differences from the production image, especially missing native libraries, changed Java version, changed JVM flags, or changed filesystem mounts.

### `sample_loop` In `scripts/common.sh`

Samples every N seconds:

- Docker RSS for app and DB
- `jcmd 1 GC.heap_info` when available
- optional NMT summary every M samples
- DB row counts every M samples

The script should be safe to leave running detached and should flush every sample to disk.

It should write a header row and use bytes for machine-readable fields:

```text
timestamp_utc app_rss_bytes db_rss_bytes app_pids db_pids heap_used_bytes heap_committed_bytes heap_max_bytes books book_files book_metadata note
```

### `scripts/probe-endpoints.sh`

Runs authenticated endpoint probes:

- full `/api/v1/books?stripForListView=false`
- full `/api/v1/books?stripForListView=true`
- paged `/api/v1/books/page?...`
- `/api/v1/app/books`
- `/api/v1/app/filter-options`
- batch-by-ID variants

For each request:

- status
- raw bytes
- gzip bytes
- wall time
- app/DB RSS before and after
- heap before and after when available
- response headers
- response body hash
- exact URL, method, and query parameters

### `scripts/browser-probe.mjs`

Uses Playwright to:

- log in as `admin / admin123`
- record network requests
- record browser heap where available
- detect whether `/api/v1/books` was called
- capture frontend timing and console errors
- save a browser trace or HAR for representative runs
- save screenshots only when visual state helps explain the run

## Verification Matrix

### V01 - Legacy full-books endpoint backend memory

**Hypothesis**

If `/api/v1/books?stripForListView=false` is the main backend spike, then request-time app RSS and heap allocation should scale with total library size, while page-size-50 requests should stay roughly bounded.

**Workload**

- Dataset sizes: 1.5K, 10K, 50K.
- Exact image for representative RSS.
- Debug JDK/NMT for allocation and heap details.
- Run one full request, then page-size-50, then 2x and 4x concurrent full requests.

**Metrics**

- response bytes
- wall time
- app RSS before, peak, after idle
- heap used/committed before and after GC
- JFR/thread allocation when available

**Decision rule**

Confirmed if full-list memory grows with library size and concurrent full-list requests stack, while page-size-50 stays small.

**Time class**

M for existing datasets, L for fresh 50K setup.

### V02 - `stripForListView` backend allocation

**Hypothesis**

If stripping happens after full DTO mapping, then stripped and unstripped full-list requests should have similar backend allocation/RSS, even though stripped responses are smaller.

**Workload**

- Use 10K and 50K datasets.
- Run full unstripped and full stripped requests after explicit GC where possible.

**Metrics**

- raw/gzip bytes
- app RSS movement
- heap allocation/thread allocation
- wall time

**Decision rule**

Confirmed if stripped response size drops materially but backend allocation/RSS remains close to unstripped.

**Time class**

M.

### V03 - Wide Book DTO list cost

**Hypothesis**

If the broad `Book` DTO is too wide for list use, then a narrow projection/list DTO should materially reduce bytes, mapping allocation, and latency for the same page size.

**Workload**

- Baseline current page-size-50 endpoint.
- Compare with any existing app-books projection endpoint.
- Later, compare with a prototype narrow list projection if implemented.

**Metrics**

- bytes per book
- endpoint wall time
- allocation per request
- DB query count/time if available

**Decision rule**

Confirmed if narrower list shape lowers bytes and allocation without losing required list UI fields.

**Time class**

S/M.

### V04 - Frontend app startup triggers full-library fetch

**Hypothesis**

If root injection/global query triggers the legacy full list, then a normal browser login/startup should request `/api/v1/books?stripForListView=false`.

**Workload**

- Exact image or local dev stack.
- Playwright login and initial app route.
- Repeat with 1.5K and 10K+ datasets.

**Metrics**

- network requests
- browser heap after startup
- app RSS movement during startup
- number and timing of `/api/v1/books` requests

**Decision rule**

Confirmed if normal startup or common navigation triggers the full-books request.

Current baseline:

- Exact 10K browser startup and exact 50K browser startup both request `/api/v1/books?stripForListView=false` once and do not request `/api/v1/app/books` or `/api/v1/app/filter-options`.
- Exact 10K retained heap-snapshot run: `.memory-runs/run-20260529T135210Z-V04-browser-heap-snapshot-exact-10k`.
- Heap snapshot run captured `95,199,725` bytes after Chromium GC and parsed summaries under `summaries/heap/`.

**Time class**

M.

### V05 - Frontend global metadata derived from all books

**Hypothesis**

If global metadata sets are derived from all loaded books, browser heap should grow with library size and computed metadata cardinality after the full list resolves.

**Workload**

- Browser startup with synthetic datasets.
- Optional fixture variant with many unique authors/tags/categories.
- Compare before and after disabling or bypassing `uniqueMetadata`.

**Metrics**

- browser heap snapshots
- retained `Book[]`, `Set`, string, and metadata objects
- full-list request timing

**Decision rule**

Confirmed if metadata sets retain meaningful extra heap proportional to library size/cardinality.

Current baseline:

- Exact 10K browser heap snapshot after startup showed retained `object`, `string`, and `array` groups; repeated DTO strings included `Verification Library` `10,002` times and `LoadTest Press` `10,000` times.
- This confirms browser retained heap from the full-list response, but a before/after fix run is still needed to quantify the improvement from removing legacy full-list startup.

**Time class**

M/L depending on browser heap tooling.

### V06 - Frontend websocket cache copies full book arrays

**Hypothesis**

If per-book websocket events patch a global cached array, bulk import with a browser connected should create browser GC pressure and repeated full-array copies.

**Workload**

- Browser connected to book browser.
- Import 1K, then 10K synthetic books.
- Capture websocket messages and browser heap/CPU.

**Metrics**

- websocket message count
- browser heap over time
- JS allocation/GC if available
- app RSS and event queue metrics if instrumented

**Decision rule**

Confirmed if browser heap/CPU grows or churns with event count and the full cache is patched per book.

Current baseline:

- Exact `/all-books` browser-connected import is captured in `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`.
- The browser stayed on `http://127.0.0.1:6182/all-books?view=grid&fmode=and` while 10K benchmark EPUBs imported.
- The route received `20,004` websocket frames and `24,969,364` websocket bytes.
- Final browser heap was `12,700,000` used / `16,100,000` total.
- Peak app RSS was `2,211,725,312`; post-import browser-idle app RSS was `473,387,008`.
- This verifies the event burst on the real book-browser route, but does not confirm retained browser heap growth in this route.
- Remaining V06 work is CPU/allocation timeline profiling, multiple browsers, and deliberately slow websocket consumers.

**Time class**

L.

### V07 - Initial scan/rescan materializes full-library state

**Hypothesis**

If scan/rescan full-library collections are a major memory source, then heap histograms during discovery/grouping should show large retained `LibraryFile`, `BookEntity`, list, and map structures before processing completes.

**Workload**

- Fresh 50K import with debug JDK.
- Separate rescan of existing 50K library.
- Rescan variant with moved/deleted/restored files.

**Metrics**

- heap histograms during discovery, grouping, processing, and after GC
- NMT and heap info
- app RSS
- collection size instrumentation if added

**Decision rule**

Confirmed if retained heap during scan phases is dominated by full-library collections and drops after phase completion/GC.

**Time class**

L/XL.

### V08 - Long outer scan transaction failure

**Hypothesis**

If an outer scan transaction stays open too long, large imports should complete row insertion but fail final commit with a stale/reset DB connection.

**Workload**

- Exact image 50K import.
- Debug JDK 50K import.
- Optional DB idle timeout reduction to reproduce faster.

**Metrics**

- import result status
- row counts
- transaction/SQL errors in logs
- container restart/OOM status
- DB connection timeout settings

**Decision rule**

Confirmed if row counts complete, containers stay healthy, and final outer commit fails with stale/reset connection.

**Time class**

L, or M with reduced timeout harness.

### V09 - Per-book ingest exception and log overhead

**Hypothesis**

If exception/log noise is real hot-path overhead, JFR and logs should show near one repeated exception/log event per imported book.

**Workload**

- 10K synthetic import under JFR using `scripts/run-debug-jdk-ingest.sh`.
- 50K synthetic import under JFR if needed.
- Compare before/after fixing entity graph or reducing expected logs.

**Metrics**

- JFR exception counts
- allocation samples
- log line counts
- import duration
- app RSS/heap

**Decision rule**

Confirmed if repeated exception/log counts scale with imported book count and fall after targeted fix.

Current baseline:

- `V09-debug-jdk-ingest-10k` is captured in `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k`.
- Baseline evidence confirmed `10,000` repeated `BookEntity.findByIdWithBookFiles` entity graph exceptions, `20,203` total JFR exceptions, and `10,000` each of the repeated ingest log patterns.
- The next V09 use should be a before/after comparison after changing the entity graph/logging behavior, or a 50K debug ingest run only if the 10K evidence is considered too small.

**Time class**

M/L.

### V10 - Per-book websocket event fanout

**Hypothesis**

If bulk import sends one full book DTO event per book, event payloads and async queues can become a memory/CPU amplifier.

**Workload**

- Import with one browser connected.
- Import with no browser connected.
- Optional instrumentation for event published/sent/dropped counts and queue depth.

**Metrics**

- event count
- websocket bytes
- queue depth
- app RSS/heap
- browser heap

**Decision rule**

Confirmed if connected-browser import has materially higher app/browser memory or queue retention tied to per-book events.

Current baseline:

- Dashboard-route exact 10K browser-connected import: `.memory-runs/run-20260529T121445Z-V10-exact-nightly-10k-ingest-with-browser`.
- `/all-books` route exact 10K browser-connected import: `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`.
- Both runs received `20,004` websocket frames and about `25 MB` of websocket payload during a 10K import.
- Dashboard-route final browser heap was `12,700,000` used / `16,100,000` total; `/all-books` final browser heap was also `12,700,000` used / `16,100,000` total.
- Dashboard-route peak app RSS was `2,174,025,728`; `/all-books` peak app RSS was `2,211,725,312`; no-browser exact 10K baseline was `2,164,854,784`.
- Conclusion for the current baseline: V10 is confirmed as high-volume websocket/network work, but not confirmed as a primary retained-memory or idle-RSS cause with one normal browser.
- Remaining V10 work is multiple-browser fanout, slow-client backpressure, and server executor/queue-depth instrumentation.

**Time class**

L.

### V11 - JVM committed heap versus live heap

**Hypothesis**

If high RSS is often committed heap rather than live retained objects, explicit GC and NMT should show low live heap after spikes while RSS/committed heap falls later or remains higher than live heap.

**Workload**

- Startup baseline.
- Post-ingest idle.
- Post-full-list request idle.
- Run under debug JDK/NMT.

**Metrics**

- Docker RSS
- heap used/committed/max
- NMT summary
- class histogram after GC

**Decision rule**

Confirmed if live heap after GC is far below Docker RSS/previous committed heap and class histograms are not book-dominated.

**Time class**

S/M.

### V12 - MariaDB sidecar memory contribution

**Hypothesis**

If total compose RSS is being mistaken for app memory, DB sidecar RSS should account for a material part of idle and post-ingest memory.

**Workload**

- 10K and 50K imports.
- Collect app and DB stats separately.
- Optional MariaDB config variants.

**Metrics**

- app RSS
- DB RSS
- total compose RSS
- DB row counts
- DB logs/config

**Decision rule**

Confirmed if DB RSS is a significant fraction of total memory and varies independently of Java heap.

**Time class**

M/L.

### V13 - Bulk-by-ID endpoint can recreate full-list pressure

**Hypothesis**

If `/batch` returns full DTOs for large ID lists, a large selected-ID request should allocate similarly to a full-list request.

**Workload**

- Generate ID lists of 50, 500, 5K, 10K.
- Probe `/batch` or equivalent endpoint.

**Metrics**

- response bytes
- app RSS/heap movement
- latency
- allocation if debug JDK

**Decision rule**

Confirmed if memory/latency grows with ID count and approaches full-list behavior.

**Time class**

M.

### V14 - File discovery full lists and maps

**Hypothesis**

If discovery itself holds all files, heap during the discovery phase should scale with file count before book processing starts.

**Workload**

- Synthetic directory with many files.
- Optional fixture of empty/small files to isolate discovery from EPUB processing.
- Add temporary phase markers or metrics if needed.

**Metrics**

- heap histograms at discovery start/end
- `LibraryFile` object counts
- list/map retained sizes
- app RSS

**Decision rule**

Confirmed if discovery phase retains O(N) file objects/maps independent of processing.

**Time class**

L.

### V15 - Fileless matching repeated library-wide loads

**Hypothesis**

If fileless matching repeatedly loads library-wide data, DB query counts and heap allocation should increase with unmatched/grouped file count.

**Workload**

- Fixture with many fileless candidates and many new files.
- Enable SQL/query counting or targeted metrics.

**Metrics**

- query count and timing
- returned row counts
- heap allocation
- app RSS

**Decision rule**

Confirmed if the same library-wide match data is loaded repeatedly rather than once per batch.

**Time class**

M/L.

### V16 - Duplicate hashing extends ingest lifetime

**Hypothesis**

If hashing is duplicated, large real files should show repeated reads/hash work and longer transaction/event lifetimes.

**Workload**

- Fixture with large files.
- Trace file read/hash calls.
- Compare with a prototype single-hash path if implemented.

**Metrics**

- import duration
- file read bytes
- hash call count
- CPU/I/O
- transaction duration

**Decision rule**

Confirmed if the same file content is hashed/read more than once per import path and removing duplication reduces duration.

**Time class**

L.

### V17 - Pending comic metadata map retention

**Hypothesis**

If failure paths skip cleanup, failed comic imports should leave entries in `pendingComicMetadata`.

**Workload**

- Fixture that triggers comic metadata insertion and controlled failure before cleanup.
- Add metric/log for map size if needed.

**Metrics**

- map size before/after failure
- heap histogram for retained metadata
- logs/errors

**Decision rule**

Confirmed if map entries remain after failed import or retry.

**Time class**

M.

### V18 - Async executor queue retains heavy payloads

**Hypothesis**

If producers outpace consumers, queued async tasks retain heavy event payloads and increase heap.

**Workload**

- Bulk import with intentionally slow websocket/event consumer or small executor.
- Instrument queue depth.

**Metrics**

- queue depth
- active thread count
- rejected tasks
- heap retained by queued task classes
- app RSS

**Decision rule**

Confirmed if heap grows with queue depth and queued tasks retain book/event payloads.

**Time class**

L.

### V19 - Websocket message limits do not prevent allocation

**Hypothesis**

If server allocation happens before websocket send limits apply, large payload attempts should still allocate DTO/JSON even when delivery fails or is capped.

**Workload**

- Trigger large websocket payloads.
- Lower message/send limits to force failure faster.

**Metrics**

- allocation before send failure
- websocket errors
- payload size
- app RSS/heap

**Decision rule**

Confirmed if large allocation occurs before limit enforcement/failure.

**Time class**

M.

### V20 - Metadata library refresh broad graph

**Hypothesis**

If metadata refresh loads a broad graph for the whole library, heap should retain many book/metadata/association entities during refresh.

**Workload**

- 10K/50K library.
- Run metadata refresh.
- Capture JFR, heap histograms, and query counts.

**Metrics**

- retained entity counts
- heap after refresh start
- transaction duration
- query row counts
- app RSS

**Decision rule**

Confirmed if refresh materializes broad full-library graphs and retains them until job/transaction completion.

**Time class**

L/XL.

### V21 - Metadata review proposals accumulate

**Hypothesis**

If review mode keeps all proposals, proposal count and heap should grow with target book count.

**Workload**

- Metadata refresh in review mode for increasing book counts.
- Poll task status endpoints.

**Metrics**

- proposal count
- task object retained size
- response bytes from task/status endpoints
- heap/RSS

**Decision rule**

Confirmed if proposals are retained and status retrieval materializes all of them.

**Time class**

L.

### V22 - Metadata match score recalculation full load

**Hypothesis**

If recalculation loads all full books, heap and query row count should scale with library size in one job.

**Workload**

- Trigger recalculation on 10K/50K.
- Capture heap and query metrics.

**Metrics**

- loaded entity count
- heap retained by book/metadata entities
- job duration
- DB writes

**Decision rule**

Confirmed if all books are loaded/saved in one unbounded operation.

**Time class**

L.

### V23 - Recommendation updater all-library structures

**Hypothesis**

If recommendation generation retains embeddings, candidates, and outputs for the whole library, heap should grow with book and embedding count.

**Workload**

- Grade A baseline: import a benchmark subset into the exact nightly image and trigger `POST /api/v1/tasks/start` with `UPDATE_BOOK_RECOMMENDATIONS`.
- Scaling pass: repeat at 2K/5K/10K as runtime permits.
- Grade B pass: repeat the same workload under debug JDK/NMT/JFR when allocator attribution is needed.

**Metrics**

- map/list sizes
- retained embedding/candidate/recommendation objects
- CPU duration
- heap/RSS
- task status and DB completion counts
- post-task idle RSS

**Decision rule**

Confirmed if updater retains all-library structures or all outputs before saving.

**Current baseline**

- Harness: `scripts/run-recommendation-task.sh`.
- Failed harness run: `.memory-runs/run-20260529T130937Z-V23-recommendation-task-2k`, where the task request returned HTTP 400 because the payload lacked `"options": null`. This is setup evidence only.
- Clean exact-image run: `.memory-runs/run-20260529T131138Z-V23-recommendation-task-1k-clean`.
- Clean run result: driver exit `0`; `1,000` books; `1,000` non-null embedding vectors; `1,000` non-null similar-book outputs; task status `COMPLETED`.
- Clean run task duration from app logs: `4,638 ms`.
- Clean run RSS shape: task window moved app RSS from `534,994,944` to `2,182,828,032` in task-status samples; Docker sampler peak was `2,183,118,848`.
- Clean 2K exact-image run: `.memory-runs/run-20260529T131940Z-V23-recommendation-task-2k-clean`.
- Clean 2K result: driver exit `0`; all inner evidence steps exit `0`; `2,000` books; `2,000` non-null embedding vectors; `2,000` non-null similar-book outputs; task status `COMPLETED`.
- Clean 2K task duration from app logs: `11,182 ms`.
- Clean 2K RSS shape: task-status samples reached `2,317,545,472` while still `IN_PROGRESS`; Docker sampler peak was `2,339,500,032`; post-task idle dropped to about `552,239,104`.
- Clean 5K exact-image run: `.memory-runs/run-20260529T132425Z-V23-recommendation-task-5k-clean`.
- Clean 5K result: driver exit `0`; all inner evidence steps exit `0`; `5,000` books; `5,000` non-null embedding vectors; `5,000` non-null similar-book outputs; task status `COMPLETED`.
- Clean 5K task duration from app logs: `51,923 ms`.
- Clean 5K RSS shape: task-status samples reached `2,327,846,912` while still `IN_PROGRESS`; Docker sampler peak was `2,347,315,200`; post-task idle dropped to about `777,179,136`.
- Failed 10K setup run: `.memory-runs/run-20260529T141449Z-V23-recommendation-task-10k-clean`, where relative `ARTIFACT_DIR` caused Compose to bind an empty `/books` directory. This is setup evidence only.
- Clean 10K exact-image run: `.memory-runs/run-20260529T141928Z-V23-recommendation-task-10k-clean`.
- Clean 10K result: driver exit `0`; all inner evidence steps exit `0`; `10,000` books; `10,000` non-null embedding vectors; `10,000` non-null similar-book outputs; task status `COMPLETED`.
- Clean 10K task duration from app logs: `190,462 ms`.
- Clean 10K RSS shape: task-status samples reached `2,347,393,024` while still `IN_PROGRESS`; Docker sampler peak was `2,354,757,632`; post-task 15-second idle sample was about `1,275,248,640`.
- Debug JDK/JFR 2K run: `.memory-runs/run-20260529T133424Z-V23-debug-jdk-recommendation-task-2k`.
- Debug 2K result: driver exit `0`; task completed; `2,000` embedding vectors and recommendation outputs; app RSS peak `2,374,369,280`; task duration `11,624 ms`.
- Debug 2K JVM result: pre-task post-GC heap `116M committed / 115M used`; post-task post-GC heap `108M committed / 107M used`; JFR native-memory view saw Java heap committed up to `1.8 GB` during the task; post-task NMT current committed total was about `402,912 KB`.
- Debug 2K JFR attribution: allocation samples were led by `Object[]`, `ThreadLocalMap.Entry`, Hibernate `SessionImpl`/persistence context/action queue, `HashMap`/node arrays, and Spring/JPA transaction objects; hot methods included `BookVectorService.cosineSimilarity`.
- Current confidence: confirmed Grade A pressure at 1K, 2K, 5K, and 10K plus Grade B JVM attribution at 2K. The issue is mostly transient heap/allocation and CPU pressure, not retained Java heap after GC.

**Time class**

M for 1K/2K exact-image baselines, L/XL for 5K+ or debug JDK/JFR attribution.

### V24 - Duplicate detection whole-library grouping

**Hypothesis**

If duplicate detection groups the whole library in memory, heap should show large maps/lists keyed by ISBN, external IDs, title/author, directory, or filename.

**Workload**

- 10K/50K fixture with controlled duplicate distributions.
- Run duplicate detection.

**Metrics**

- grouping map sizes
- retained heap
- response bytes
- latency

**Decision rule**

Confirmed if duplicate detection builds full-library grouping structures and returns/materializes all groups.

**Time class**

L.

### V25 - Sidecar bulk import/export whole-library load

**Hypothesis**

If sidecar operations load all books with files, heap should grow with library size before iteration.

**Workload**

- Run sidecar bulk export/import on 10K/50K.
- Capture heap before, during, after.

**Metrics**

- loaded book/file entity count
- heap/RSS
- output/input size
- job duration

**Decision rule**

Confirmed if all books/files are retained at once.

**Time class**

L.

### V26 - Missing file-size migration full load

**Hypothesis**

If the migration loads all missing-file-size books, startup migration heap should scale with affected row count.

**Workload**

- Prepare DB with many null file sizes.
- Start app and observe migration.

**Metrics**

- affected row count
- heap/RSS during migration
- query results loaded
- startup duration

**Decision rule**

Confirmed if all affected rows are loaded and saved as one large batch.

**Time class**

L.

### V27 - Folder ZIP downloads buffer entire ZIP

**Hypothesis**

If folder ZIP downloads buffer the whole archive in heap, heap/RSS should rise roughly with compressed ZIP size and concurrent downloads should stack.

**Workload**

- Create synthetic folder audiobook/additional-folder fixture: 100MB, 1GB if safe.
- Download once, then concurrent downloads.

**Metrics**

- response bytes
- heap/RSS before, peak, after
- direct byte array/class histogram
- latency

**Decision rule**

Confirmed if heap allocation tracks full ZIP size before response completes.

Current baseline:

- Primary folder-audiobook `/download` is captured in `.memory-runs/run-20260529T124014Z-V27-exact-nightly-folder-zip-download-128mb-clean`.
- Additional folder `/files/{fileId}/download` is captured in `.memory-runs/run-20260529T130217Z-V27-additional-folder-zip-download-128mb-clean`.
- Three concurrent primary-folder `/download` clients are captured in `.memory-runs/run-20260529T134154Z-V27-concurrent-folder-zip-download-3x128mb`.
- These baselines confirm buffered ZIP responses and stacked concurrent RSS on the exact nightly image. The remaining V27 work is larger fixture sizing if safe, mixed primary/additional concurrency, and before/after streaming verification after a fix.

**Time class**

M/L depending on fixture size.

### V28 - Archive entry full-byte reads

**Hypothesis**

If archive entry APIs allocate whole entries, a large archive entry should appear as a large byte array allocation.

**Workload**

- Archive with one large entry.
- Trigger endpoint/service path that calls full entry read.

**Metrics**

- allocated byte array size
- heap/RSS
- endpoint latency
- failure behavior for size guard absence

**Decision rule**

Confirmed if full uncompressed entry is allocated in heap.

**Time class**

M.

### V29 - EPUB spine content full reads

**Hypothesis**

If EPUB content reading loads whole spine resources, very large XHTML chapters should allocate full byte and string copies.

**Workload**

- EPUB fixture with one large XHTML resource.
- Trigger reader/content endpoint.

**Metrics**

- byte/string allocation
- heap/RSS
- response time
- reader cache state

**Decision rule**

Confirmed if large resources are fully materialized and retained long enough to affect heap.

**Time class**

M.

### V30 - EPUB CFI DOM cache retention

**Hypothesis**

If CFI cache stores large parsed DOMs, repeated CFI operations on large chapters should retain DOM documents until eviction.

**Workload**

- EPUB fixture with large chapters.
- Trigger CFI operations across more than cache capacity.

**Metrics**

- cache size/hit rate if available
- retained DOM object counts
- heap after GC before and after expiry/eviction

**Decision rule**

Confirmed if DOM documents remain retained by cache and are large enough to matter.

**Time class**

M/L.

### V31 - Image/PDF/cover/comic processing large transients

**Hypothesis**

If media processing allocates full images/pages, large inputs should create large transient byte arrays and `BufferedImage` objects.

**Workload**

- Large image cover.
- Large PDF first page.
- Large comic page conversion.
- Run with controlled concurrency.

**Metrics**

- peak heap/RSS
- large object allocation samples
- render duration
- OOM or error handling

**Decision rule**

Confirmed if peak allocation scales with decoded image dimensions/content size and concurrent rendering stacks.

**Time class**

M/L.

### V32 - Bulk cover regeneration full list

**Hypothesis**

If bulk cover regeneration loads all candidate books first, heap should retain full candidate lists before cover processing.

**Workload**

- 10K/50K library.
- Trigger all-books cover regeneration.

**Metrics**

- candidate list size
- heap/RSS during candidate selection
- cover processing concurrency
- job duration

**Decision rule**

Confirmed if candidate data is retained for the full operation rather than streamed/batched.

**Time class**

L.

### V33 - Bookdrop queue unbounded growth

**Hypothesis**

If the bookdrop queue is unbounded, a burst of file arrivals faster than processing should grow queue depth and retained memory.

**Workload**

- Copy many files into bookdrop quickly.
- Slow processing artificially if needed.

**Metrics**

- queue depth
- retained event/path objects
- heap/RSS
- processing lag

**Decision rule**

Confirmed if queue depth grows without a bound or coalescing and heap follows.

**Time class**

M/L.

### V34 - Library watcher queue unbounded growth

**Hypothesis**

If watcher events are unbounded, mass moves/deletes/renames should grow queue and pending maps.

**Workload**

- Large folder move/delete/restore inside watched library.
- Optional event storm generator.

**Metrics**

- watcher queue depth
- pending create/delete map sizes
- retained path/event objects
- heap/RSS

**Decision rule**

Confirmed if event storm creates unbounded queue/pending state growth.

**Time class**

L.

### V35 - Pending deletion pool retains large snapshots

**Hypothesis**

If folder deletion snapshots retain many books/files, heap should hold large pending deletion structures during the grace period.

**Workload**

- Delete or move a folder containing many imported books/files.
- Observe pending deletion state through the grace period and recovery.

**Metrics**

- pending deletion count
- snapshot retained size
- heap/RSS
- cleanup after expiry/recovery

**Decision rule**

Confirmed if large snapshots persist for the grace period and are released afterward.

**Time class**

M/L.

### V36 - Shared executor contention and retention

**Hypothesis**

If unrelated workloads share one executor, a heavy job should delay lightweight events and retain queued payloads.

**Workload**

- Run heavy metadata/cover/recommendation task.
- Simultaneously trigger websocket/bookdrop/lightweight async events.
- Instrument executor queue and active counts.

**Metrics**

- queue depth by task type
- active threads
- latency for lightweight events
- retained queued payloads
- heap/RSS

**Decision rule**

Confirmed if heavy work causes cross-workload queue retention or latency spikes.

**Time class**

L.

## Fill-Out Template for the Blank Diagnosis

When a verification item is complete, paste a concise summary into the matching diagnosis section:

```markdown
**Verification**

Verified on `<date>` using `<image>@<digest>` with `<dataset>`.

- Verification ID:
- Evidence grade:
- Workload:
- Result:
- Artifact directory:
- Peak app RSS:
- Peak DB RSS:
- Heap/NMT:
- Latency/bytes:
- Raw samples:
- Command files:
- Logs:
- Hashes:
- Conclusion:
```

If the finding is not confirmed:

```markdown
**Verification**

Tested on `<date>` using `<image>@<digest>` with `<dataset>`.

- Verification ID:
- Evidence grade:
- Workload:
- Result:
- Artifact directory:
- Evidence against:
- Remaining uncertainty:
- Raw samples:
- Command files:
- Logs:
- Hashes:
- Conclusion: not confirmed / inconclusive.
```

## Recommended First Pass

Run these first because they either already have strong evidence or unlock better prioritization:

1. Build the minimal harness pieces that enforce artifact capture: run directory creation, `run_step`, Docker stats sampling, endpoint probing, log capture, and run acceptance validation.
2. V01 legacy full-books endpoint backend memory.
3. V02 `stripForListView` backend allocation.
4. V04 frontend startup full-library fetch.
5. V08 long outer scan transaction failure with a reduced-timeout repro if possible.
6. V10 websocket event fanout with browser connected; dashboard and `/all-books` one-browser baselines are already captured, so the next pass should focus on multiple browsers, slow consumers, and queue-depth instrumentation.
7. V07 rescan materialization follow-up with debug JDK/NMT/JFR and moved/deleted/restored variants; no-change exact-image RSS is already captured.
8. V27 follow-up for larger/mixed folder download stress and before/after streaming verification; primary, additional, and three-way concurrent primary-folder paths are already captured.
9. V09 before/after rerun after entity graph/logging changes; the debug JDK 10K baseline is already captured.
10. V23 recommendation updater scaling: 1K, 2K, 5K, and 10K exact-image baselines plus a 2K debug JDK/JFR pass are already captured; next run should be before/after validation after algorithm changes.

After that, run background-job and media-specific items in smaller focused batches.
