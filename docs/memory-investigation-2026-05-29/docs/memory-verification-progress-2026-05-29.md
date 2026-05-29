# Grimmory Memory Verification Progress - 2026-05-29

This document tracks execution of `docs/memory-verification-plan-2026-05-29.md`.

Raw artifacts live under `.memory-runs/` and are intentionally gitignored. Each completed artifact directory contains command text, stdout/stderr, exit status, raw samples, logs, Docker state, hashes, and notes unless called out below.

## Current Status

- Exact nightly 10K and 50K ingest evidence is complete.
- Exact nightly 10K and 50K endpoint evidence is complete.
- Exact nightly 10K and 50K real-browser startup evidence is complete.
- Exact nightly 10K browser heap snapshot evidence exists for V04/V05.
- Debug JDK/NMT/JFR attribution exists for 10K and 50K endpoint workloads.
- Exact nightly 50K batch-by-ID evidence exists for V13.
- Exact nightly 10K browser-connected import evidence exists for V10.
- Debug JDK ingest JFR evidence exists for V09.
- Exact nightly no-change 50K rescan evidence exists for V07.
- Exact nightly folder-audiobook, additional-folder, and three-way concurrent folder ZIP download evidence exists for V27.
- Exact nightly 1K, 2K, 5K, and 10K recommendation-task evidence exists for V23.
- Debug JDK/JFR recommendation-task attribution exists for V23 at 2K.
- The exact nightly 50K stack and debug 50K stack have been stopped; only the normal dev stack remains running.
- No leftover sampler/probe processes were found after the final cleanup audit.
- The main combined diagnosis has been updated with final evidence:
  - `docs/memory-use-combined-diagnosis-2026-05-29.md`
- The blank verification copy has been reset as a reusable template:
  - `docs/memory-use-combined-diagnosis-blank-verification-2026-05-29.md`

## Harness Created

- `scripts/common.sh`
- `scripts/run-exact-ingest.sh`
- `scripts/probe-endpoints.sh`
- `scripts/browser-probe.mjs`
- `scripts/analyze-chrome-heapsnapshot.mjs`
- `scripts/browser-startup-with-sampling.sh`
- `scripts/run-debug-jdk-from-db.sh`
- `scripts/jvm-snapshot.sh`
- `scripts/debug-endpoint-attribution.sh`
- `scripts/run-debug-jdk-ingest.sh`
- `scripts/probe-batch-by-ids.sh`
- `scripts/run-exact-ingest-with-browser.sh`
- `scripts/probe-rescan.sh`
- `scripts/run-folder-zip-download.sh`
- `scripts/run-additional-folder-zip-download.sh`
- `scripts/run-recommendation-task.sh`
- `scripts/run-debug-jdk-recommendation-task.sh`

Harness behavior now records command text, stdout, stderr, exit status, samples, logs, Docker state, notes, and hashes to files. Sampler cleanup was patched to terminate child sample loops as a process tree.

## Completed Runs

### DEV-1506-SMOKE - V01/V02 Harness Smoke

- Artifact: `.memory-runs/run-20260529T110906Z-V01-V02-dev-1506-smoke`
- Evidence grade: C/B-adjacent dev-stack smoke.
- Workload: existing dev stack, 1,506 books, serial endpoint probes.
- Result:
  - Full unstripped: `3,171,715` bytes, `0.410201 s`, app RSS `907,927,552 -> 974,372,864`.
  - Full stripped: `1,425,460` bytes, `0.380899 s`, app RSS `986,275,840 -> 999,313,408`.
  - Page 50: `48,117` bytes, `0.029638 s`.
  - App-books page 50: `31,342` bytes.
  - Filter options: `84,580` bytes.

### FAILED-10K-SETUP - Exact Image Payload Bug

- Artifact: `.memory-runs/run-20260529T110955Z-V01-V02-V08-exact-nightly-10k`
- Evidence grade: failed harness/setup run.
- Result:
  - Exact nightly rejected `iconType: LUCIDE`.
  - Accepted enum values were `PRIME_NG` and `CUSTOM_SVG`.
- Harness fix:
  - Removed optional icon fields from generated library payload.

### PARTIAL-10K-DBCOUNT - Exact Image DB Count Helper Bug

- Artifact: `.memory-runs/run-20260529T111141Z-V01-V02-V08-exact-nightly-10k`
- Evidence grade: partial exact-image run; not used as clean verification.
- Result:
  - App imported 10K, but the harness kept polling because DB count used root credentials.
- Harness fix:
  - DB helpers now default to `MYSQL_USER/MYSQL_PASSWORD`, falling back to `grimmory/grimmory`.

### EXACT-10K-INGEST - Clean Exact Nightly 10K Import

- Artifact: `.memory-runs/run-20260529T111441Z-V01-V02-V08-exact-nightly-10k-clean`
- Evidence grade: A.
- Image: `ghcr.io/grimmory-tools/grimmory:nightly`
- Dataset: `/home/alex/Projects/book-apps-benchmark/books/books_10K`
- Browser connected: false.
- Result:
  - Imported `10,000` books.
  - Peak sampled app RSS: `2,164,854,784`.
  - Peak sampled DB RSS: `187,932,672`.
  - Post-import idle: app `474,804,224`, DB `187,363,328`.
  - Final counts: `book=10000`, `book_file=10000`, `book_metadata=10000`, `library=1`, `users=1`.
  - Log counts: `10,000` `Processing file:`, `10,000` `TOC_INVALID`, `10,000` `No cover image found`.

### EXACT-10K-ENDPOINTS - V01/V02 Endpoint Verification

- Artifact: `.memory-runs/run-20260529T111826Z-V01-V02-exact-nightly-10k-endpoints`
- Evidence grade: A.
- Workload: exact nightly image after 10K import, serial endpoint probes plus four concurrent full-list requests.
- Result:
  - Full unstripped: `18,868,820` raw, `736,034` gzip, `2.543634 s`, app RSS `488,554,496 -> 663,797,760`.
  - Full stripped: `7,378,820` raw, `561,947` gzip, `2.072053 s`, app RSS `656,871,424 -> 1,021,136,896`.
  - Page 50: `37,482` raw, `3,500` gzip.
  - App-books page 50: `24,042` raw, `2,830` gzip.
  - Filter options: `33,729` raw, `5,069` gzip.
  - Four concurrent full-list clients peaked sampled app RSS at `2,585,219,072`.

### EXACT-10K-BROWSER - V04 Authenticated Startup

- Artifact: `.memory-runs/run-20260529T112225Z-V04-exact-nightly-10k-browser-startup`
- Evidence grade: A.
- Workload: Playwright Chromium against exact nightly image with 10K books.
- Result:
  - Browser-observed requests: `95`.
  - Legacy `/api/v1/books?stripForListView=false` count: `1`.
  - `/api/v1/app/books` count: `0`.
  - `/api/v1/app/filter-options` count: `0`.
  - Browser JS heap: `35,100,000` used / `53,500,000` total.
  - Peak sampled app RSS: `796,532,736`.

### DEBUG-10K-READY - Debug JDK/NMT Startup on Copied 10K DB

- Artifact: `.memory-runs/run-20260529T112639Z-V01-V02-V11-debug-jdk-10k-clean`
- Evidence grade: B.
- Workload: extracted nightly jar in `eclipse-temurin:25-jdk-alpine`, copied 10K MariaDB data directory, NMT enabled.
- Result:
  - Ready app RSS: `1,356,423,168`.
  - Ready DB RSS: `100,601,856`.
  - DB row count: `10,000`.
  - Ready heap, NMT, and class histogram captured.

### DEBUG-10K-ENDPOINTS - V01/V02/V11 JVM Attribution

- Artifact: `.memory-runs/run-20260529T112907Z-V01-V02-V11-debug-jdk-10k-endpoints`
- Evidence grade: B.
- Workload: debug JDK/NMT app on copied 10K DB; JFR around serial endpoint probes plus four concurrent full-list requests.
- Result:
  - Full unstripped: `18,868,820` raw, `736,034` gzip, `3.200493 s`, app RSS `519,032,832 -> 730,128,384`.
  - Full stripped: `7,378,820` raw, `561,947` gzip, `2.318575 s`.
  - Peak sampled app RSS: `2,584,399,872`.
  - Post-GC heap: `116 MiB committed / 115 MiB used`.
  - Post-GC NMT total committed: `463,129 KB`.
  - JFR allocation pressure included String/byte/object arrays, virtual-thread stack chunks, Hibernate collection keys/entries, HashMaps, `BookMetadata`, and Jackson serialization.

### EXACT-50K-INGEST - Clean Exact Nightly 50K Import

- Artifact: `.memory-runs/run-20260529T113043Z-V08-V01-V02-exact-nightly-50k-clean`
- Evidence grade: A.
- Image digest: `ghcr.io/grimmory-tools/grimmory@sha256:7e9df2e3729e64ae6e1e1569e67fc8f7cfa4c4046edf43182737346b5fd6f59d`
- Database digest: `lscr.io/linuxserver/mariadb@sha256:91de7f701bc7fc3a424b81beafca7a7c6c4c5b7c8be6afd2ae148698695c0b0c`
- Dataset: `/home/alex/Projects/book-apps-benchmark/books/books_50K`
- Browser connected: false.
- Result:
  - Imported `50,000` books.
  - Peak sampled app RSS: `2,184,511,488`.
  - Peak sampled DB RSS: `459,747,328`.
  - Post-import idle sample: app `469,463,040`, DB `459,595,776`.
  - Final counts: `book=50000`, `book_file=50000`, `book_metadata=50000`, `library=1`, `users=1`.
  - Containers: app and DB `restart_count=0`, `oom_killed=false`.
  - Log counts: `50,000` `Processing file:`, `50,000` `TOC_INVALID`, `50,000` `No cover image found`.
  - Reproduced final transaction failure: MariaDB socket reset / connection reset while committing the long outer `processLibrary` transaction after rows completed.

### EXACT-50K-ENDPOINTS - V01/V02 Exact Image Endpoint Verification

- Artifact: `.memory-runs/run-20260529T114754Z-V01-V02-exact-nightly-50k-endpoints`
- Evidence grade: A.
- Workload: exact nightly 50K stack, serial endpoint probes plus four concurrent full-list requests.
- Result:
  - Full unstripped: `94,512,387` raw, `3,720,098` gzip, `20.677348 s`, app RSS `474,517,504 -> 1,663,664,128`.
  - Full stripped: `37,062,387` raw, `2,857,645` gzip, `19.218729 s`, app RSS `1,664,753,664 -> 1,851,727,872`.
  - Page 50: `37,748` raw, `3,545` gzip, `0.407913 s`.
  - App-books page 50: `24,139` raw, `2,820` gzip, `0.243245 s`.
  - Filter options: `34,046` raw, `5,274` gzip, `1.166687 s`.
  - Four concurrent full-list clients each returned `94,512,387` bytes in about `10.12-10.31 s`.
  - Peak sampled app RSS: `4,477,747,200`.
  - Peak sampled DB RSS: `496,451,584`.

### EXACT-50K-BROWSER - V04 Authenticated Startup

- Artifact: `.memory-runs/run-20260529T114953Z-V04-exact-nightly-50k-browser-startup`
- Evidence grade: A.
- Workload: Playwright Chromium against exact nightly image with 50K books, 45-second authenticated startup capture.
- Result:
  - Browser-observed requests: `95`.
  - Legacy `/api/v1/books?stripForListView=false` count: `1`.
  - `/api/v1/app/books` count: `0`.
  - `/api/v1/app/filter-options` count: `0`.
  - Browser JS heap: `64,000,000` used / `68,000,000` total.
  - Peak sampled app RSS: `2,485,944,320`.
  - Peak sampled DB RSS: `486,039,552`.

### V04-BROWSER-HEAP-SNAPSHOT-EXACT-10K - Browser Retained Heap Attribution

- Import artifact: `.memory-runs/run-20260529T134915Z-V04-browser-heap-snapshot-exact-10k-import`
- Browser artifact: `.memory-runs/run-20260529T135210Z-V04-browser-heap-snapshot-exact-10k`
- Evidence grade: A for exact-image browser behavior; B-adjacent for heap-snapshot constructor/string attribution.
- Workload: exact nightly image imported `10,000` benchmark EPUBs, then Playwright Chromium opened normal authenticated startup route `/` for `20,000 ms` with `TAKE_HEAP_SNAPSHOT=1`.
- Result:
  - Import driver exit: `0`; final counts `book=10000`, `book_file=10000`, `book_metadata=10000`.
  - Browser driver exit: `0`.
  - Browser-observed requests: `95`.
  - Legacy `/api/v1/books?stripForListView=false` count: `1`.
  - `/api/v1/app/books` count: `0`.
  - `/api/v1/app/filter-options` count: `0`.
  - Browser memory samples after startup: `16,100,000` used / `24,500,000` total JS heap.
  - Retained heap snapshot after Chromium GC: `samples/browser/heap.heapsnapshot`, `95,199,725` bytes, SHA-256 `89882652e0617c8505b716e4c733ffbcabec9d7d7a23ebd6878c7d25024e59c0`.
  - Parsed heap top types: `object` `6,794,508` self bytes / `188,198` nodes; `string` `5,846,308` / `698,040`; `array` `1,905,908` / `35,465`.
  - Parsed repeated strings: `Verification Library` `10,002` string nodes; `LoadTest Press` `10,000` string nodes.
  - Backend app RSS during browser startup peaked at `871,452,672` from the browser artifact's Docker samples.
  - Exact stack was cleaned down afterward; final Docker/process audits recorded only the normal dev stack.
- Verification:
  - Confirms normal startup still retains browser heap from the full-list response at 10K.
  - Confirms the heap includes repeated DTO strings and large object/array groups, not only transient network bytes.
  - Remaining gaps: before/after heap snapshot after removing the legacy full-list startup path, and deeper retainer-path analysis if ownership of specific Angular signals/sets must be proven.

### DEBUG-50K-READY - Debug JDK/NMT Startup on Copied 50K DB

- Artifact: `.memory-runs/run-20260529T115140Z-V01-V02-V10-V11-debug-jdk-50k-ready`
- Evidence grade: B.
- Workload: extracted nightly jar in `eclipse-temurin:25-jdk-alpine`, copied exact 50K MariaDB data directory, NMT enabled.
- Result:
  - Ready sample app RSS: `1,274,798,080`.
  - Ready sample DB RSS: `142,807,040`.
  - DB row count: `50,000`.
  - Ready heap, NMT, and class histogram captured.

### DEBUG-50K-ENDPOINTS - V01/V02/V10/V11 JVM Attribution

- Artifact: `.memory-runs/run-20260529T115223Z-V01-V02-V10-V11-debug-jdk-50k-endpoints`
- Evidence grade: B.
- Workload: debug JDK/NMT app on copied 50K DB; JFR around serial endpoint probes plus four concurrent full-list requests.
- Result:
  - Full unstripped: `94,512,387` raw, `3,720,098` gzip, `10.318403 s`.
  - Full stripped: `37,062,387` raw, `2,857,645` gzip, `8.763401 s`.
  - Page 50: `37,748` raw, `3,545` gzip, `0.444453 s`.
  - App-books page 50: `24,139` raw, `2,820` gzip, `0.253996 s`.
  - Filter options: `34,046` raw, `5,294` gzip, `1.149918 s`.
  - Four concurrent full-list clients each returned `94,512,387` bytes in about `11.88-11.96 s`.
  - Peak sampled app RSS: `4,412,522,496`.
  - Peak sampled DB RSS: `176,160,768`.
  - Post-GC heap: `120 MiB committed / 119 MiB used`.
  - Post-GC NMT total committed: `416,651 KB`.
  - Java heap peak committed: `3,874,816 KB`.
  - JFR allocation pressure: `String[]` 14.85%, `byte[]` 13.49%, `String` 7.45%, `Object[]` 6.55%, `StackChunk` 3.96%, `HashMap$Node[]` 3.83%, Hibernate collection keys/entries, `BookMetadata`, and `BookMetadataBuilder`.
  - JFR hot methods included Hibernate field tracking, HashMap access/growth, Jackson serialization, String construction, and MariaDB/JDBC row decoding.

### FAILED-V13-BATCH-ARGMAX - Batch Probe Harness Limit

- Artifact: `.memory-runs/run-20260529T120736Z-V13-exact-nightly-50k-batch-by-ids`
- Evidence grade: failed harness run; partial endpoint evidence retained but superseded by the clean run below.
- Result:
  - Batch sizes 50, 500, 1,500, 5,000, and 10,000 completed.
  - The 50K-ID request failed locally before reaching the server because `curl` received the huge URL as a process argument: `Argument list too long`.
- Harness fix:
  - `probe_endpoint` now writes a curl config file and invokes `curl --config`, so very long URLs are stored in artifacts instead of passed through `execve` arguments.
  - `probe_endpoint` now creates an empty body file before curl so failed requests can still be hashed/recorded without aborting the artifact packet.

### V13-EXACT-50K-BATCH-BY-IDS - Bulk-by-ID Endpoint Pressure

- Artifact: `.memory-runs/run-20260529T120952Z-V13-exact-nightly-50k-batch-by-ids-clean`
- Evidence grade: A.
- Workload: exact nightly image restarted against the existing 50K MariaDB data directory; authenticated `/api/v1/books/batch` probes for 50, 500, 1,500, 5,000, 10,000, and 50,000 IDs.
- Result:
  - 50 IDs: status `200`, `94,475` raw bytes, `4,517` gzip, `0.145462 s`.
  - 500 IDs: status `200`, `947,467` raw bytes, `38,106` gzip, `0.175968 s`.
  - 1,500 IDs: status `200`, `2,845,076` raw bytes, `112,671` gzip, `0.243449 s`.
  - 5,000 IDs: status `200`, `9,495,181` raw bytes, `373,226` gzip, `0.553018 s`.
  - 10,000 IDs: status `200`, `18,995,169` raw bytes, `745,279` gzip, `0.906125 s`, app RSS `597,516,288 -> 851,492,864`.
  - 50,000 IDs: status `400`, `435` raw bytes, `298` gzip, `0.013439 s`, query ID string length `288,893` characters.
  - Peak sampled app RSS: `1,445,842,944`.
  - Peak sampled DB RSS: `152,858,624`.
- Verification:
  - Confirms the endpoint returns broad list DTO payloads for large accepted ID sets.
  - Shows current 50K all-ID request is rejected by request/query size, not by a deliberate application-level cap.

### V10-EXACT-10K-INGEST-WITH-BROWSER - Browser-Connected Import Event Burst

- Artifact: `.memory-runs/run-20260529T121445Z-V10-exact-nightly-10k-ingest-with-browser`
- Evidence grade: A for exact-image dashboard-route behavior.
- Workload: exact nightly image, clean 10K import, one Chromium browser connected before library creation, 10-minute browser probe with websocket frame logging and browser memory samples.
- Result:
  - Imported `10,000` books.
  - Browser startup still requested the legacy `/api/v1/books?stripForListView=false` once.
  - Browser-observed websocket events: `20,048` total.
  - Websocket frames received: `20,004`.
  - Websocket frames sent: `43`.
  - Websocket bytes received: `24,969,373`.
  - Websocket bytes sent: `1,041`.
  - Browser final heap: `12,700,000` used / `16,100,000` total.
  - Peak sampled app RSS: `2,174,025,728`.
  - Peak sampled DB RSS: `190,697,472`.
  - Post-import idle sample: app `479,465,472`, DB `186,990,592`.
- Verification:
  - Confirms V10 event volume: import with a browser connected creates a large websocket burst.
  - Does not confirm a retained dashboard-route browser heap issue or a material backend RSS increase over the no-browser exact 10K baseline.
  - Remaining gaps: multiple browsers, slow clients, actual browser allocation/CPU profiling, and async queue-depth instrumentation.

### V10-EXACT-10K-INGEST-WITH-BROWSER-ALL-BOOKS - Book-Browser Route Event Burst

- Artifact: `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`
- Evidence grade: A for exact-image `/all-books` route behavior.
- Workload: exact nightly image, clean 10K benchmark EPUB import, one Chromium browser authenticated and opened on `/all-books` before library creation, 5-minute browser probe with websocket frame logging and browser memory samples, 2-second app/DB RSS sampling.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Image digest: `ghcr.io/grimmory-tools/grimmory@sha256:7e9df2e3729e64ae6e1e1569e67fc8f7cfa4c4046edf43182737346b5fd6f59d`.
  - DB image digest: `lscr.io/linuxserver/mariadb@sha256:91de7f701bc7fc3a424b81beafca7a7c6c4c5b7c8be6afd2ae148698695c0b0c`.
  - Final DB counts: `book=10000`, `book_file=10000`, `book_metadata=10000`, `library=1`, `users=1`.
  - Browser final URL: `http://127.0.0.1:6182/all-books?view=grid&fmode=and`.
  - Browser-observed requests: `106`.
  - Legacy `/api/v1/books?stripForListView=false` count: `1`.
  - `/api/v1/app/books` count: `0`.
  - `/api/v1/app/filter-options` count: `0`.
  - Browser-observed websocket events: `20,033` total.
  - Websocket frames received: `20,004`.
  - Websocket frames sent: `28`.
  - Websocket bytes received: `24,969,364`.
  - Websocket bytes sent: `1,026`.
  - Browser final heap: `12,700,000` used / `16,100,000` total.
  - Peak sampled app RSS: `2,211,725,312`.
  - Peak sampled DB RSS: `188,063,744`.
  - Post-import browser-idle sample: app `473,387,008`, DB `187,351,040`.
  - Container final state before shutdown: app and DB `restart_count=0`, `oom_killed=false`, `status=running`.
  - Post-run external process audit was empty; post-run Docker audit showed only the normal dev stack.
- Verification:
  - Confirms that the actual `/all-books` route also receives the large websocket burst during import.
  - Does not confirm a retained browser heap problem: final browser heap matched the dashboard-route run.
  - Does not show a material backend RSS increase over the dashboard-route browser import baseline; the `/all-books` peak was about `37.7 MB` higher than the dashboard-route run.
  - Remaining gaps: multiple browsers, deliberately slow websocket consumers, browser allocation timeline/CPU profiling, and server async queue-depth instrumentation.

### V09-DEBUG-JDK-10K-INGEST - Exception and Log Overhead Attribution

- Artifact: `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k`
- Evidence grade: B for JVM/JFR attribution of the exact nightly jar under debug JDK.
- Workload: exact nightly app jar extracted from `ghcr.io/grimmory-tools/grimmory:nightly`, run in `eclipse-temurin:25-jdk-alpine` with production-like JVM flags plus `NativeMemoryTracking=summary`; clean 10K benchmark import; JFR `profile` with `exceptions=all`, `allocation-profiling=high`, `gc=detailed`, and `method-profiling=high`.
- Result:
  - Imported `10,000` books; final DB counts `book=10000`, `book_file=10000`, `book_metadata=10000`, `library=1`, `users=1`.
  - Peak sampled app RSS: `2,298,445,824` at `4,980` books.
  - Peak sampled DB RSS: `178,548,736`.
  - Post-target sample after 30 seconds: app `594,640,896`, DB `161,153,024`.
  - Post-GC heap: `108 MiB committed / 106 MiB used`.
  - NMT post-GC total committed: `412,560 KB`; Java heap peak committed: `2,482,176 KB`.
  - App log: `5.5 MB`, `30,242` lines, with `10,000` `Processing file:`, `10,000` `TOC_INVALID`, and `10,000` `No cover image found`.
  - JFR exception count: `20,203` thrown exceptions.
  - JFR exception types: `10,002` `InvocationTargetException`, `10,002` `IllegalArgumentException`, `257` `ClassNotFoundException`, `117` `NoSuchMethodError`.
  - Parsed entity graph exception messages: `10,000` `BookEntity.findByIdWithBookFiles`, `1` `LibraryEntity.findByIdWithPaths`, `1` `BookEntity.findAllByLibraryIdForRescan`.
  - JFR allocation pressure by class: `byte[]` `33.83%`, `Object[]` `7.79%`, `char[]` `6.40%`, `int[]` `5.30%`, `String` `3.25%`.
  - JFR top allocation sites: `InputStream.readNBytes`, `InputStream.transferTo`, `Arrays.copyOfRange`, XML parser DOM chunks, MariaDB packet reads, `HashMap` growth.
  - JFR file: `samples/jfr-V09-debug-jdk-ingest-10k.jfr`, `7,836,794` bytes, SHA-256 `a1247f96de4bd2a50b22a8c3ad232dd6bc13f914a960535eba684ecd0011cef3`.
- Verification:
  - Confirms V09 repeated per-book log noise.
  - Confirms the named entity graph exception-control-flow suspicion: the hot import path throws one handled `No EntityGraph with given name 'BookEntity.findByIdWithBookFiles'` exception per imported benchmark book.
  - Remaining gap: before/after rerun after changing the entity graph/logging behavior.
- Harness note:
  - Inner commands all wrote `.cmd`, `.stdout.log`, `.stderr.log`, and `.exit` files. The outer detached `nohup` driver did not write a top-level `driver.exit`; future detached launches should wrap the driver so that exit status is recorded directly.

### V07-EXACT-50K-RESCAN - No-Change Rescan Transient Pressure

- Superseded short-idle artifact: `.memory-runs/run-20260529T122825Z-V07-exact-nightly-50k-rescan-clean`
- Preferred artifact: `.memory-runs/run-20260529T123007Z-V07-exact-nightly-50k-rescan-clean-60s-idle`
- Evidence grade: A for exact-image no-change rescan RSS behavior.
- Workload: exact nightly image restarted against the existing 50K MariaDB data directory and mounted 50K benchmark books; authenticated `PUT /api/v1/libraries/1/refresh`; 1-second app/DB RSS sampling; 60-second post-rescan idle window.
- Result:
  - DB count stayed `50,000` books.
  - Containers: no OOM or restart.
  - Peak sampled app RSS: `1,906,503,680`.
  - Peak sampled DB RSS: `161,914,880`.
  - Post-rescan idle sample after 60 seconds: app `436,764,672`, DB `158,863,360`.
  - Log completion marker observed: `Parsing task completed!`.
- Verification:
  - Confirms V07 as transient scan/rescan pressure on exact image.
  - Does not confirm retained idle heap after no-change rescan.
  - Remaining gaps: debug JDK/NMT/JFR rescan with phase markers and moved/deleted/restored file variants.

### FAILED-V27-FOLDER-ZIP-FIXTURE - Regular File Negative Control

- Artifact: `.memory-runs/run-20260529T123800Z-V27-exact-nightly-folder-zip-download-128mb`
- Evidence grade: failed harness/fixture run; useful as a regular-file negative control only.
- Result:
  - Fixture generation accidentally wrote one literal `track-${i}.mp3`, so Grimmory imported a regular audiobook file, not a folder-based audiobook.
  - DB row showed `is_folder_based=0`, `file_size_kb=65536`, `book_type=AUDIOBOOK`.
  - `/download` and `/download-all` each returned one `67,108,864` byte file.
- Harness fix:
  - Fixture generation now passes `FIXTURE_DIR`, `TRACK_COUNT`, and `TRACK_SIZE_MB` as environment variables to the generator shell so track filenames expand correctly.

### V27-EXACT-FOLDER-ZIP-DOWNLOAD - Buffered ZIP Versus Streaming Control

- Artifact: `.memory-runs/run-20260529T124014Z-V27-exact-nightly-folder-zip-download-128mb-clean`
- Evidence grade: A.
- Workload: exact nightly image; synthetic folder audiobook with two random 64MiB `.mp3`-named tracks; authenticated downloads with curl limited to `16m` to keep server response objects alive long enough to sample.
- Result:
  - DB row: `book_id=1`, `file_id=1`, `file_name=Synthetic Audiobook`, `is_folder_based=1`, `file_size_kb=131072`, `book_type=AUDIOBOOK`.
  - `/api/v1/books/1/download`: status `200`, `134,258,928` bytes, `10.147187 s`, app RSS `663,076,864 -> 1,210,904,576`.
  - `/api/v1/books/1/download-all`: status `200`, `134,259,008` bytes, `8.034436 s`, app RSS `705,679,360 -> 710,201,344`.
  - During `/download`, sampled app RSS stayed around `1.21-1.23 GB`.
  - Post-download idle sample: app about `705,863,680`, DB `150,048,768`.
- Verification:
  - Confirms V27 for folder-audiobook `/download`: the in-memory ZIP response causes a large transient RSS increase.
  - Confirms `/download-all` is a useful streaming control for a comparable ZIP payload.
  - Remaining gap: concurrent folder downloads.

### FAILED-V27-ADDITIONAL-FOLDER-ZIP-DEFAULT-FIXTURE - Pipefail Selection Bug

- Artifact: `.memory-runs/run-20260529T130136Z-V27-additional-folder-zip-download-128mb`
- Evidence grade: failed harness/setup run.
- Result:
  - Driver exited `141` before creating containers or inner command artifacts.
  - Cause: the script chose a default EPUB with `find | sort | head -1` under `set -o pipefail`, so the pipeline could fail with SIGPIPE.
- Harness fix:
  - Default EPUB discovery now uses `find ... -print -quit`.
  - The clean rerun below records a top-level `driver.exit`.

### V27-EXACT-ADDITIONAL-FOLDER-ZIP-DOWNLOAD - Additional File Buffered ZIP

- Artifact: `.memory-runs/run-20260529T130217Z-V27-additional-folder-zip-download-128mb-clean`
- Evidence grade: A.
- Workload: exact nightly image; one benchmark EPUB imported as the primary book; DB-attached additional folder with two random 64MiB `.mp3`-named tracks; authenticated `/api/v1/books/{bookId}/files/{fileId}/download` with curl limited to `16m`.
- Result:
  - Driver exit: `0`.
  - DB rows: primary `book_file` row `is_book=1`, `is_folder_based=0`, `book_type=EPUB`; additional row `is_book=0`, `is_folder_based=1`, `file_size_kb=131072`, `book_type=AUDIOBOOK`.
  - `/api/v1/books/1/files/2/download`: status `200`, `134,258,928` bytes, `10.211125 s`, app RSS `492,392,448 -> 922,529,792`.
  - Sampled download-window app RSS peak: about `940,670,976`.
  - Post-download idle sample: app `489,533,440`, DB `116,023,296`.
  - Containers: no OOM or restart.
- Verification:
  - Confirms V27 for the additional-file folder path: `AdditionalFileService.downloadFolderAsZip` also buffers the generated ZIP in memory before response.
  - Remaining gap: concurrent primary/additional folder downloads and larger fixtures.

### V27-CONCURRENT-FOLDER-ZIP-DOWNLOAD-3X128MB - Concurrent Buffered ZIP Spike

- Artifact: `.memory-runs/run-20260529T134154Z-V27-concurrent-folder-zip-download-3x128mb`
- Evidence grade: A.
- Workload: exact nightly image; synthetic folder audiobook with two random 64MiB `.mp3`-named tracks; one single buffered `/download` control, three overlapping buffered `/download` clients, and one `/download-all` streaming control; curl rate-limited to `16m`.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - DB row: `book_id=1`, `file_id=1`, `file_name=Synthetic Audiobook`, `is_folder_based=1`, `file_size_kb=131072`, `book_type=AUDIOBOOK`.
  - Single `/api/v1/books/1/download`: status `200`, `134,258,928` bytes, `10.092879 s`, app RSS `604,766,208 -> 1,037,922,304`.
  - Three concurrent `/api/v1/books/1/download` clients: all status `200`, all `134,258,928` bytes, `10.180652-10.217112 s`.
  - Concurrent buffered downloads: app RSS `510,640,128 -> 1,797,185,536`, sampled peak `1,819,090,944`.
  - `/api/v1/books/1/download-all`: status `200`, `134,259,008` bytes, `8.032898 s`, app RSS `513,662,976 -> 517,558,272`.
  - Post-download idle sample: app `513,003,520`, DB `114,487,296`.
  - Containers: no OOM or restart.
  - External filtered process audit `999-true-external-process-audit.*` had no matching V27 harness processes after completion.
- Verification:
  - Confirms concurrent buffered primary-folder downloads stack transient RSS.
  - Confirms `/download-all` remains the streaming control under the same fixture.
  - Remaining gaps: larger fixtures and mixed primary/additional concurrent downloads.

### FAILED-V23-RECOMMENDATION-2K-PAYLOAD - Task Start Payload Bug

- Artifact: `.memory-runs/run-20260529T130937Z-V23-recommendation-task-2k`
- Evidence grade: failed harness/setup run.
- Result:
  - Driver exit: `22`.
  - Imported the 2K subset far enough to preserve Docker samples, DB counts, logs, image digests, driver files, and command files.
  - `POST /api/v1/tasks/start` returned HTTP 400.
  - App log recorded: `Malformed request body: JSON parse error: Missing property 'options' for external type id 'taskType'`.
- Harness fix:
  - Recommendation task payload now includes `"options": null`.
  - The clean 1K rerun below uses the corrected payload and records a top-level `driver.exit`.

### V23-RECOMMENDATION-TASK-1K-CLEAN - Exact Image Recommendation Baseline

- Artifact: `.memory-runs/run-20260529T131138Z-V23-recommendation-task-1k-clean`
- Evidence grade: A.
- Workload: exact nightly image; 1K synthetic benchmark EPUB subset; normal auth; `POST /api/v1/tasks/start` with `UPDATE_BOOK_RECOMMENDATIONS`; task-status polling plus Docker RSS sampling.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Task ID: `08d7c81e-2ad7-4cc1-9bf2-35b282307ac9`.
  - Task completed in app logs in `4,638 ms`.
  - DB result counts: `1,000` books, `1,000` non-null `embedding_vector`, `1,000` non-null `similar_books`, one completed task row.
  - Task-status samples: app RSS moved from `534,994,944` at `IN_PROGRESS` to `2,182,828,032` at `COMPLETED`.
  - Docker sampler peak during the task window: `2,183,118,848` app RSS.
  - About 15 seconds later, app RSS was still around `1,599,803,392`.
  - Containers: no OOM or restart.
- Verification:
  - Confirms V23 as a real recommendation-task processing/RSS spike at a small 1K baseline.
  - Source shape explains why larger libraries need scaling tests: all embeddings and series names are kept in maps, each target compares against all other books, candidate lists are sorted, and all recommendation outputs are retained before batch save.
  - Remaining gaps: before/after validation after changing the algorithm.

### V23-RECOMMENDATION-TASK-2K-CLEAN - Exact Image Recommendation Scaling Baseline

- Artifact: `.memory-runs/run-20260529T131940Z-V23-recommendation-task-2k-clean`
- Evidence grade: A.
- Workload: exact nightly image; 2K synthetic benchmark EPUB subset; normal auth; corrected `UPDATE_BOOK_RECOMMENDATIONS` task payload; task-status polling plus Docker RSS sampling.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Task ID: `c1bc77de-4bcb-4115-8c22-e90120626c8b`.
  - Task completed in app logs in `11,182 ms`.
  - DB result counts: `2,000` books, `2,000` non-null `embedding_vector`, `2,000` non-null `similar_books`, one completed task row.
  - Task-status samples: app RSS moved from `1,801,437,184` at first `IN_PROGRESS`, to `2,317,545,472` while still `IN_PROGRESS`, then down to `587,988,992` at `COMPLETED`.
  - Docker sampler peak during the task window: `2,339,500,032` app RSS.
  - Post-task idle sample: app `552,239,104`, DB `146,718,720`.
  - Containers: no OOM or restart.
  - Final process and Docker audits were written to `095-process-audit.*`, `096-docker-ps-final.*`, and `docker/ps-final.txt`.
- Verification:
  - Confirms V23 across a second exact-image data point.
  - The task duration grew from `4,638 ms` at 1K to `11,182 ms` at 2K, which is consistent with the source-level all-pairs risk, though not enough alone to quantify the larger-library curve.
  - Remaining gaps: before/after validation after changing the algorithm.

### V23-RECOMMENDATION-TASK-5K-CLEAN - Exact Image Recommendation Scaling Baseline

- Artifact: `.memory-runs/run-20260529T132425Z-V23-recommendation-task-5k-clean`
- Evidence grade: A.
- Workload: exact nightly image; 5K synthetic benchmark EPUB subset; normal auth; corrected `UPDATE_BOOK_RECOMMENDATIONS` task payload; task-status polling plus Docker RSS sampling.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Task ID: `8367a493-49b1-4ddb-a5ef-32d987eceb0b`.
  - Task completed in app logs in `51,923 ms`.
  - DB result counts: `5,000` books, `5,000` non-null `embedding_vector`, `5,000` non-null `similar_books`, one completed task row.
  - Task-status samples: app RSS reached `2,327,846,912` while still `IN_PROGRESS` and then dropped to `776,966,144` at `COMPLETED`.
  - Docker sampler peak during the task window: `2,347,315,200` app RSS.
  - Post-task idle sample: app `777,179,136`, DB `191,647,744`.
  - Containers: no OOM or restart.
  - Final Docker audit was written to `docker/ps-final.txt`.
  - External filtered process audit was written to `098-external-filtered-process-audit.*` and had no matching V23 sampler/driver processes.
- Verification:
  - Confirms V23 across a third exact-image data point.
  - The task duration grew from `4,638 ms` at 1K to `11,182 ms` at 2K to `51,923 ms` at 5K, which is strong enough to prioritize algorithmic changes before testing very large libraries.
  - Remaining gaps: before/after validation after changing the algorithm.

### FAILED-V23-RECOMMENDATION-10K-RELATIVE-ARTIFACT-DIR - Compose Bind Path Bug

- Artifact: `.memory-runs/run-20260529T141449Z-V23-recommendation-task-10k-clean`
- Evidence grade: failed harness/setup run.
- Workload intent: exact-image 10K recommendation updater baseline.
- Failure:
  - The driver was launched with a relative `ARTIFACT_DIR`.
  - Docker Compose resolved generated runtime bind mounts relative to the compose file directory.
  - Host `runtime/books` contained `10,000` EPUB files, but the app container saw `0` files under `/books`.
  - The app completed library processing with zero imported books and the driver was manually stopped before the import timeout.
  - Containers were manually cleaned down; external process and Docker audits were recorded.
- Fix:
  - Rerun with an absolute `ARTIFACT_DIR`.

### V23-RECOMMENDATION-TASK-10K-CLEAN - Exact Image Recommendation Scaling Baseline

- Artifact: `.memory-runs/run-20260529T141928Z-V23-recommendation-task-10k-clean`
- Evidence grade: A.
- Workload: exact nightly image; 10K synthetic benchmark EPUB subset; normal auth; corrected `UPDATE_BOOK_RECOMMENDATIONS` task payload; task-status polling plus 1-second Docker RSS sampling.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Image digest: `ghcr.io/grimmory-tools/grimmory@sha256:7e9df2e3729e64ae6e1e1569e67fc8f7cfa4c4046edf43182737346b5fd6f59d`.
  - DB image digest: `lscr.io/linuxserver/mariadb@sha256:91de7f701bc7fc3a424b81beafca7a7c6c4c5b7c8be6afd2ae148698695c0b0c`.
  - Imported `10,000` books; final DB counts `book=10000`, `book_file=10000`, `book_metadata=10000`, `library=1`, `users=1`.
  - Task ID: `9b26ea3a-ea01-43a3-8451-0663939302d6`.
  - Task completed successfully in app logs in `190,462 ms`.
  - DB result counts: `10,000` books, `10,000` non-null `embedding_vector`, `10,000` non-null `similar_books`, one completed task row.
  - Docker sampler peak during the task/import run: `2,354,757,632` app RSS.
  - Task-status samples moved from `1,305,227,264` at task start to a high observed task-status RSS of `2,347,393,024`, then down to `1,274,544,128` at `COMPLETED`.
  - Post-task 15-second idle sample: app `1,275,248,640`, DB `237,666,304`.
  - Containers: no OOM or restart.
  - True post-run external process audit was empty; final Docker audit showed only the normal dev stack.
- Verification:
  - Confirms the recommendation updater remains a sharp all-library task spike at 10K books on the exact nightly image.
  - The peak was only slightly above the 2K/5K RSS peaks, but runtime grew from `51,923 ms` at 5K to `190,462 ms` at 10K, consistent with the source-level all-pairs/top-K scaling concern.
  - Remaining gap: before/after validation after changing the algorithm.

### V23-DEBUG-JDK-RECOMMENDATION-TASK-2K - Recommendation JVM Attribution

- Artifact: `.memory-runs/run-20260529T133424Z-V23-debug-jdk-recommendation-task-2k`
- Evidence grade: B.
- Workload: exact nightly jar extracted into `eclipse-temurin:25-jdk-alpine`; 2K synthetic benchmark EPUB subset imported first; pre-task GC/snapshot; JFR recorded only around `UPDATE_BOOK_RECOMMENDATIONS`; post-task GC/snapshot and JFR views exported.
- Result:
  - Driver exit: `0`.
  - All inner command exits: `0`.
  - Task ID: `3974dab8-ad30-469a-aa43-8acdb09035d3`.
  - Task completed in app logs in `11,624 ms`.
  - DB result counts: `2,000` books, `2,000` non-null `embedding_vector`, `2,000` non-null `similar_books`, one completed task row.
  - Docker sampler peak during the task window: `2,374,369,280` app RSS.
  - Task-status samples: app RSS moved from `548,392,960` to `2,345,967,616` while `IN_PROGRESS`, then down to `617,869,312` at `COMPLETED`.
  - Pre-task post-GC heap: `116M` committed, `115M` used.
  - Post-task post-GC heap: `108M` committed, `107M` used.
  - JFR native-memory committed view: Java heap committed up to `1.8 GB` during the recommendation task window.
  - Post-task NMT total committed: about `402,912 KB`; Java heap current committed `110,592 KB`, with NMT-reported peak Java heap committed `2,744,320 KB` since JVM start.
  - JFR allocation samples were led by `Object[]`, `ThreadLocalMap.Entry`, Hibernate `SessionImpl`/persistence context/action queue, `HashMap`/node arrays, Spring/JPA transaction objects, and related infrastructure.
  - JFR hot methods included `BookVectorService.cosineSimilarity`.
  - JFR file: `samples/jfr-V23-debug-jdk-recommendation-task-2k.jfr`, SHA-256 `4848d04c82809e1c828bc7d4b11b269418133399325dda0e027bb86741a71e5c`, size `1,269,599` bytes.
  - Containers: no OOM or restart.
  - External filtered process audit `999-true-external-process-audit.*` had no matching debug/JFR harness processes after completion.
- Verification:
  - Confirms V23 is a large transient heap/allocation and CPU spike, not a retained Java heap leak after explicit GC.
  - JFR supports the source-level diagnosis: whole-library maps/candidate lists and similarity loops create heavy object-array/hash/list churn, while persistence/progress/save phases add Hibernate/Spring transaction allocation.
  - Remaining gaps: before/after validation after algorithm changes.

## Final Campaign Validation

- Artifact: `.memory-runs/final-validation-20260529T143210Z`
- Result:
  - `bash -n scripts/*.sh`: pass.
  - `node --check scripts/*.mjs`: pass.
  - Blank verification integrity check: pass.
  - Stale route/optional-10K wording check: no matches.
  - External harness process audit: empty.
  - Docker audit: only the normal dev stack remained running.

## Harness Fixes Made During Execution

- Artifact directories now create all required subdirectories.
- Exact-image library payload omits invalid optional icon enum values.
- DB count helpers use the application DB user by default.
- Long commands are launched detached and polled with short status commands.
- Endpoint probes sample RSS continuously during request runs.
- Endpoint probes record raw/gzip byte counts, response hashes, headers, request results, Docker state, and notes.
- Browser probes record network JSONL, websocket frame counts/sizes, browser memory samples, browser metrics, screenshot, trace, hashes, and console logs.
- Browser probes can optionally capture a retained Chromium heap snapshot, and `analyze-chrome-heapsnapshot.mjs` writes top retained constructor/type/string summaries.
- Debug JDK runner can boot an extracted nightly jar against a copied DB with NMT enabled.
- Debug JDK ingest runner can import fixture libraries under JFR/NMT and export allocation, exception, GC, and native-memory summaries.
- JVM snapshot helper captures heap info, NMT summary, and class histograms.
- Rescan probes trigger authenticated library refresh and keep post-idle sampling configurable.
- Folder ZIP probes generate incompressible synthetic folder audiobooks, compare buffered `/download` with streaming `/download-all`, and can launch concurrent buffered `/download` clients.
- Additional-folder ZIP probes attach a synthetic folder to an imported book and measure `/files/{fileId}/download`.
- Recommendation-task probes include the required `"options": null` task payload, poll task status, query recommendation completion counts, stop the sampler before compose-down, and preserve failed harness starts separately from clean evidence.
- Debug recommendation probes isolate JFR to the task window after import, then export allocation, exception, hot-method, GC, and native-memory views.
- Sampler cleanup now terminates child sample loops as a process tree.

## Remaining Verification Backlog

- Browser before/after heap snapshot after removing the legacy full-list startup path.
- Browser-connected import with multiple browsers or slow clients.
- Debug rescan with phase markers, plus moved/deleted/restored file variants.
- V09 before/after debug ingest JFR after entity graph/logging changes.
- Batch-by-ID endpoint stress.
- Metadata refresh/review/proposal workloads.
- Recommendation updater before/after validation after algorithm changes.
- Larger/mixed folder downloads, archive entry reads, and large media/readers workloads.
- Bookdrop/watcher event storm with queue-depth or map-size instrumentation.
- Fixed heap runs at `-Xmx512m`, `-Xmx1g`, and `-Xmx2g` after the main full-list fix lands.
