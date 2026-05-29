# Grimmory Memory Use Combined Diagnosis - 2026-05-29

## Purpose

This document combines:

- the live container/JVM investigation captured under `.memory-runs/`;
- the GPT-5.5 Pro code-analysis pressure-point list supplied by the user;
- direct source checks in the Grimmory repository.

The goal is a practical diagnosis: what is proven, what is source-confirmed but not runtime-isolated, and what remains only a plausible pressure point.

## Evidence Levels

- **Confirmed**: live container, endpoint, browser, JFR, NMT, heap, log, or source evidence exists.
- **Source-confirmed**: the code path exists and the memory shape is real, but runtime impact was not isolated.
- **Unverified**: carried over from the 5.5 Pro audit, with evidence intentionally blank until measured.

## High Level Summary

Grimmory's biggest reproduced memory problem is not ingest itself. It is the old unpaginated books API still being pulled into the frontend.

At 50K books, one legacy `/api/v1/books?stripForListView=false` request returns roughly 95MB of JSON and can push backend RSS by hundreds of MB to multiple GB, especially when requests overlap. The paginated endpoints are dramatically smaller and flatter. Lack of pagination is the main confirmed memory pressure point.

`stripForListView=true` helps network payload size, but it does not solve backend memory because the backend still loads and maps the broad full-library DTOs before stripping fields.

Ingest is expensive, but mostly transient. The exact nightly image imported 50K books with app RSS peaking around 2.18GB, then dropping back to roughly 470MB after idle. Ingest can spike, but the evidence does not make it the main idle-memory leak. There is a separate large-import reliability bug: the long outer transaction can fail at the end of a 50K import even though the rows were inserted.

Frontend startup is still accidentally expensive. A normal authenticated browser startup still triggers the legacy full-books request instead of only using paginated app-books APIs. Browser heap snapshots showed retained full-list object/string/array pressure.

Websocket import events are noisy but not the smoking gun. A 10K import with a real browser on `/all-books` received about 20K websocket frames and about 25MB of payload, but browser heap stayed small and backend memory returned to normal. It is worth batching later, but it is not currently the main RAM cause with one normal client.

Other confirmed pressure points:

- Folder ZIP downloads buffer full ZIPs in memory. Three concurrent 128MB folder ZIP downloads pushed app RSS to about 1.82GB. The streaming `/download-all` path stayed flat.
- Recommendation updater is a real all-library spike. At 10K books it took about 190 seconds and peaked around 2.35GB RSS.
- Per-book ingest logs and repeated entity-graph exceptions are real hot-path waste.
- JVM/container memory reporting needs careful interpretation: Docker RSS, live Java heap, committed heap, DB sidecar memory, and browser heap are not the same thing.

Suggested fix order:

1. Stop frontend startup from calling legacy `/api/v1/books`.
2. Migrate remaining frontend consumers off the legacy full-book cache.
3. Add a hard guard, deprecation path, or admin-only diagnostic gate for unpaginated `/api/v1/books` on large libraries.
4. Stream folder ZIP downloads instead of buffering them.
5. Fix recommendation updater batching/top-K behavior.
6. Remove repeated ingest exception/log noise.
7. Fix the long outer scan transaction.

## Executive Diagnosis

The strongest measured issue is the legacy full-library books path. Normal authenticated frontend startup calls `/api/v1/books?stripForListView=false`, and the backend returns an unbounded `List<Book>`. At 50K books, one exact nightly full-list request produced a `94,512,387` byte raw response and moved app RSS from `474,517,504` to `1,663,664,128` bytes. Four overlapping full-list requests peaked at `4,477,747,200` bytes app RSS. Page-size-50 controls stayed tiny by comparison.

`stripForListView=true` is not a memory fix. It reduced the 50K response from `94,512,387` raw bytes to `37,062,387`, but the server had already loaded and mapped the broad graph before stripping. The debug JDK/JFR run ties the pressure to String/byte/object arrays, Hibernate collection/entity machinery, `BookMetadata` DTO/builders, HashMaps, streams, and Jackson serialization.

Pure synthetic ingest is still expensive, but it behaved differently from the full-list endpoint. Exact nightly 50K import peaked at `2,184,511,488` bytes app RSS and then idled at about `469,463,040` bytes app RSS. The same run also revealed a separate 50K reliability bug: the long outer library scan transaction can fail final commit with a MariaDB socket reset even after all 50,000 rows are inserted.

Memory reporting must separate app RSS, DB RSS, Java live heap, Java committed heap, and browser heap. After the 50K debug endpoint workload, explicit GC left the Java heap at only `120 MiB committed / 119 MiB used`, while NMT showed heap peak committed at `3,874,816 KB`. Docker RSS spikes are real operational pressure, but not automatically proof of retained Java heap.

## Overlap Map

| Area from 5.5 Pro audit | Live/source mapping | Status |
|---|---|---|
| Frontend globally loads `/api/v1/books?stripForListView=false` | Browser startup saw exactly this request at 10K and 50K | Confirmed |
| Backend `/api/v1/books` is unbounded | Endpoint returns `ResponseEntity<List<Book>>`; measured 1.5K, 10K, 50K | Confirmed |
| Backend maps full DTOs before stripping | Source path and stripped/unstripped measurements agree | Confirmed |
| Book DTO is too wide for list traffic | Payload/JFR/source shape agree | Confirmed |
| Frontend metadata/filter state derived from all books | `uniqueMetadata` depends on full `books()` signal | Source-confirmed |
| Websocket cache patches legacy full-book cache | Source path found; event storm not load-tested | Source-confirmed |
| Initial scan/rescan materializes full-library state | 50K import and no-change 50K rescan both show transient RSS pressure that drops after idle | Confirmed transient pressure |
| Per-book import events and async fanout | Browser-connected 10K imports on dashboard and `/all-books` each produced 20,004 received websocket frames and about 25MB payload; retained one-browser heap did not grow large | Confirmed event burst, memory amplification not confirmed |
| JVM/container/DB accounting confusion | Docker stats, NMT, heap info, and browser metrics agree | Confirmed |
| Bulk-by-ID endpoints can recreate list pressure | `/api/v1/books/batch` returns full `Book` DTO lists for large ID sets until request-line limits reject the query | Confirmed |
| Folder ZIP downloads buffer full archives | Folder audiobook `/download` buffers the ZIP in heap; `/download-all` streams a comparable ZIP with much flatter RSS | Confirmed |
| Recommendation updater all-library structures | Exact-image 1K, 2K, 5K, and 10K updater runs completed but spiked backend RSS to about 2.18-2.35GB | Confirmed scaling pressure |
| Metadata jobs, archive entry reads, watcher queues, media processing | Not exercised in runtime campaign | Unverified |

## Confirmed and Source-Confirmed Diagnoses

### 1. Legacy full-books request is the main reproduced backend memory spike

**5.5 Pro details**

The frontend has a global book query that calls `/api/v1/books` with `stripForListView=false`, exposes a full `Book[]`, and is made app-wide by root `BookService` injection. The backend endpoint returns an unbounded list.

**Diagnosis**

This is the highest-priority measured issue. Large libraries force the backend to load, map, serialize, and transfer every book in one request. Overlapping requests stack transient pressure.

This is not only browser memory. The backend pays most of the cost before the browser parses the JSON.

**Evidence**

- Source: `frontend/src/app/features/book/service/book.service.ts` creates the root full-books query and calls `/api/v1/books?stripForListView=false`.
- Source: `frontend/src/app/app.component.ts` injects `BookService`, which makes the query easy to trigger at app startup.
- Source: `backend/src/main/java/org/booklore/controller/BookController.java` exposes unbounded `GET /api/v1/books`.
- Source: `backend/src/main/java/org/booklore/service/book/BookQueryService.java` loads `findAllWithMetadata()` then maps the whole list.
- Dev 1,506 books: full unstripped returned `3,171,715` raw bytes; page 50 returned `48,117`; app-books page 50 returned `31,342`.
- Exact 10K: full unstripped returned `18,868,820` raw bytes in `2.543634 s`; four overlapping full-list requests peaked at `2,585,219,072` bytes app RSS.
- Exact 50K: full unstripped returned `94,512,387` raw bytes in `20.677348 s` and moved app RSS `474,517,504 -> 1,663,664,128`.
- Exact 50K: four overlapping full-list requests each returned `94,512,387` bytes and peaked at `4,477,747,200` bytes app RSS.
- Exact 50K controls: page 50 returned `37,748` raw bytes in `0.407913 s`; app-books page 50 returned `24,139` bytes in `0.243245 s`.

**Verification**

Verified on 2026-05-29 with exact nightly image and debug JDK/JFR runs.

- Verification IDs: `DEV-1506-SMOKE`, `EXACT-10K-ENDPOINTS`, `EXACT-50K-ENDPOINTS`, `DEBUG-10K-ENDPOINTS`, `DEBUG-50K-ENDPOINTS`.
- Evidence grade: A for exact-image behavior; B for JVM attribution.
- Key artifacts:
  - `.memory-runs/run-20260529T110906Z-V01-V02-dev-1506-smoke`
  - `.memory-runs/run-20260529T111826Z-V01-V02-exact-nightly-10k-endpoints`
  - `.memory-runs/run-20260529T114754Z-V01-V02-exact-nightly-50k-endpoints`
  - `.memory-runs/run-20260529T115223Z-V01-V02-V10-V11-debug-jdk-50k-endpoints`
- Conclusion: confirmed. The legacy full-list path is the clearest reproduced backend memory spike and should be removed from normal browsing.

**Fix direction**

- Move normal UI list/browser screens to `/api/v1/app/books` or another bounded API.
- Add a guardrail, deprecation path, or explicit admin/export semantics for unbounded `/api/v1/books`.
- Avoid loading the full library at app startup.

### 2. `stripForListView` does not fix backend memory

**5.5 Pro details**

The backend maps entities to full DTOs first, then strips fields afterward.

**Diagnosis**

`stripForListView=true` helps the network payload, but it is not the backend memory fix. Grimmory needs list-specific projections/DTOs that avoid broad graph loading and mapping.

**Evidence**

- Source: `BookQueryService.mapToBookDtos` maps with `bookMapperV2.toDTO(...)` before `stripFieldsForListView`.
- Exact 10K: unstripped `18,868,820` raw / `736,034` gzip bytes; stripped `7,378,820` raw / `561,947` gzip bytes.
- Exact 10K: stripped still moved app RSS `656,871,424 -> 1,021,136,896`.
- Exact 50K: stripped was smaller on the wire (`37,062,387` raw vs `94,512,387`), but still took `19.218729 s` and moved app RSS `1,664,753,664 -> 1,851,727,872` after a prior full-list request.
- Debug 50K: stripped endpoint was part of the JFR allocation packet that peaked at `4,412,522,496` bytes app RSS.

**Verification**

Verified on 2026-05-29 with stripped/unstripped/page controls at 10K and 50K.

- Verification IDs: `EXACT-10K-ENDPOINTS`, `EXACT-50K-ENDPOINTS`, `DEBUG-50K-ENDPOINTS`.
- Evidence grade: A plus B.
- Key artifacts:
  - `.memory-runs/run-20260529T111826Z-V01-V02-exact-nightly-10k-endpoints/samples/request-results.tsv`
  - `.memory-runs/run-20260529T114754Z-V01-V02-exact-nightly-50k-endpoints/samples/request-results.tsv`
  - `.memory-runs/run-20260529T115223Z-V01-V02-V10-V11-debug-jdk-50k-endpoints/summaries/jfr-allocation-by-class.txt`
- Conclusion: confirmed. Stripping reduces payload, but not enough server-side work.

**Fix direction**

- Use DB-side projections for list rows.
- Fetch detail DTOs only by ID.
- Treat "strip after mapping" as a compatibility bridge, not the optimization.

### 3. The Book DTO is too wide for list traffic

**5.5 Pro details**

The list path returns a broad `Book` DTO with file, metadata, progress, shelves, library path, and format/detail data.

**Diagnosis**

Pagination solves the worst spike, but wide row shape still matters. A narrow list-row DTO will reduce mapping allocation, serialization time, network bytes, browser parse cost, and cache size.

**Evidence**

- Source: `backend/src/main/java/org/booklore/model/dto/Book.java` and `BookMetadata.java` are detail-sized DTOs.
- Source: `backend/src/main/java/org/booklore/mapper/v2/BookMapperV2.java` maps metadata, files, alternate/supplementary files, audio metadata, authors, categories, moods, tags, and format fields.
- Exact 50K full unstripped response: `94,512,387` raw bytes, about `1,890 bytes/book`.
- Exact 50K app-books page 50: `24,139` raw bytes, about `483 bytes/book` before page wrapper overhead.
- Debug 50K JFR allocation samples included `BookMetadata` and `BookMetadataBuilder`, plus Hibernate collection machinery and Jackson serialization.

**Verification**

Verified as baseline shape on 2026-05-29; not yet verified against a new custom projection implementation.

- Verification IDs: `DEV-1506-SMOKE`, `EXACT-10K-ENDPOINTS`, `EXACT-50K-ENDPOINTS`, `DEBUG-50K-ENDPOINTS`.
- Evidence grade: A/B for current behavior; future fix still needs before/after verification.
- Conclusion: confirmed for current DTO cost. A new projection should be tested against these baseline artifacts.

**Fix direction**

- Define a narrow list-row DTO around title/sort fields, cover identity, authors, series summary, state, and progress needed for the row.
- Keep broad metadata and associated files behind detail APIs.

### 4. Frontend startup triggers the legacy full-library fetch

**5.5 Pro details**

The full-books query is global enough that normal UI flows can load the whole library.

**Diagnosis**

This is confirmed with real browser probes. A normal authenticated startup reaches `/api/v1/books?stripForListView=false` and does not use the newer paginated app-books path at startup.

**Evidence**

- Exact 10K browser startup: `95` requests, exactly one legacy `/api/v1/books?stripForListView=false`, zero `/api/v1/app/books`, zero `/api/v1/app/filter-options`, Chromium used JS heap about `35.1 MB`.
- Exact 50K browser startup: `95` requests, exactly one legacy `/api/v1/books?stripForListView=false`, zero `/api/v1/app/books`, zero `/api/v1/app/filter-options`.
- Exact 50K browser startup: browser JS heap `64,000,000` used / `68,000,000` total; backend app RSS peak during startup `2,485,944,320` bytes.
- Exact 10K heap-snapshot browser startup: exactly one legacy `/api/v1/books?stripForListView=false`, zero app-books/filter-options requests, browser memory `16,100,000` used / `24,500,000` total after startup, retained heap snapshot `95,199,725` bytes after Chromium GC.
- Parsed 10K heap snapshot top retained groups: `object` `6,794,508` self bytes / `188,198` nodes, `string` `5,846,308` / `698,040`, `array` `1,905,908` / `35,465`.
- Parsed 10K heap snapshot repeated data strings included `Verification Library` `10,002` times and `LoadTest Press` `10,000` times, showing DTO/string duplication retained in the browser heap after the full-list fetch.

**Verification**

Verified on 2026-05-29 with Playwright Chromium against the exact nightly image.

- Verification IDs: `EXACT-10K-BROWSER`, `EXACT-50K-BROWSER`, `V04-browser-heap-snapshot-exact-10k`.
- Evidence grade: A.
- Key artifacts:
  - `.memory-runs/run-20260529T112225Z-V04-exact-nightly-10k-browser-startup`
  - `.memory-runs/run-20260529T114953Z-V04-exact-nightly-50k-browser-startup`
  - `.memory-runs/run-20260529T135210Z-V04-browser-heap-snapshot-exact-10k`
- Conclusion: confirmed. Normal authenticated frontend startup loads the full library through the legacy endpoint.

**Fix direction**

- Make startup/dashboard use bounded summary APIs.
- Keep book-browser pages on paginated app-books APIs.
- Do not derive global app state by subscribing to the legacy full-books query.

### 5. Frontend metadata/filter state is derived from all books

**5.5 Pro details**

`BookService.uniqueMetadata` iterates over every loaded book and builds sets of authors, categories, moods, tags, publishers, series, etc.

**Diagnosis**

This is source-confirmed and architecturally tied to the startup/full-list problem. The new 10K heap snapshot confirms retained browser-side object/array/string pressure from the full-list response. It still does not fully isolate Angular signal/cache ownership of every metadata `Set`, but it moves the finding beyond source-only evidence.

**Evidence**

- Source: `BookService.uniqueMetadata` depends on `this.books()` and derives library-wide sets in the browser.
- Source: `AppFilterController` and `AppBookService` expose a newer backend filter-options path.
- Exact 50K filter-options endpoint was small (`34,046` raw bytes, `1.166687 s`) compared with full books (`94,512,387` raw bytes, `20.677348 s`).
- Exact 10K browser heap snapshot artifact parsed top retained object/array/string groups and repeated full-list response strings, including `Verification Library` `10,002` times and `LoadTest Press` `10,000` times.

**Verification**

Partially verified on 2026-05-29.

- Verification IDs: `EXACT-10K-BROWSER`, `EXACT-50K-BROWSER`, `EXACT-50K-ENDPOINTS`, `V04-browser-heap-snapshot-exact-10k`.
- Evidence grade: A for startup request shape, browser heap snapshot presence, and backend filter-options size; B-adjacent for retained heap constructor/string summaries; source-confirmed for `uniqueMetadata` ownership.
- Remaining gap: before/after heap snapshot after removing the legacy full-list startup path, and deeper object-retainer analysis if Angular cache/set ownership needs to be proven line-by-line.
- Conclusion: runtime-confirmed as browser-side retained object/array/string pressure from full-list startup, with source evidence that metadata/filter state currently derives from that same full list.

**Fix direction**

- Fetch facets/filter options from backend aggregate endpoints.
- Support search/autocomplete for high-cardinality metadata.
- Stop making metadata options depend on full list loading.

### 6. Frontend websocket/cache code still maintains the legacy full-book cache

**5.5 Pro details**

Book add/update/remove events patch a cached full `Book[]`. Array patching can copy the whole array during bulk import or bulk updates.

**Diagnosis**

This is source-confirmed, and the browser-connected import runs confirmed a large websocket event burst. Both the dashboard route and the actual `/all-books` route received about two websocket frames per imported book. Neither one-browser run confirmed a retained browser heap explosion: browser heap stayed small after import. That means the source shape should still be fixed, but the measured memory severity is lower than the full-list startup problem unless multiple browsers, slow consumers, or queue-depth instrumentation prove retention/backpressure.

**Evidence**

- Source: `frontend/src/app/features/book/service/book-query-cache.ts` patches `BOOKS_QUERY_KEY` by appending, mapping, filtering, and replacing entries in the full cached array.
- Source: `frontend/src/app/features/book/service/book-socket.service.ts` routes websocket book events into those cache patch methods.
- Source: newer app-books cache patching exists separately, which means the legacy cache is still a parallel maintenance burden.
- Exact 10K browser-connected import: browser received `20,004` websocket frames totaling `24,969,373` bytes while import ran.
- Exact 10K browser-connected import: browser heap ended at `12,700,000` used / `16,100,000` total on the dashboard route.
- Exact 10K `/all-books` browser-connected import: browser received `20,004` websocket frames totaling `24,969,364` bytes while import ran.
- Exact 10K `/all-books` browser-connected import: browser heap ended at `12,700,000` used / `16,100,000` total.
- Exact 10K `/all-books` browser-connected import peak app RSS was `2,211,725,312`, about `37.7 MB` higher than the dashboard-route browser run.

**Verification**

Partially verified on 2026-05-29.

- Verification IDs: `V10-exact-nightly-10k-ingest-with-browser`, `V10-exact-nightly-10k-ingest-with-browser-all-books`.
- Evidence grade: A for event volume and one-browser dashboard/`/all-books` browser heap; C/source for cache-copy internals.
- Artifacts:
  - `.memory-runs/run-20260529T121445Z-V10-exact-nightly-10k-ingest-with-browser`
  - `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`
- Remaining gap: multiple browsers, browser allocation/CPU timeline profiling, deliberately slower websocket consumers, and server queue-depth instrumentation.
- Conclusion: confirmed as a high-volume websocket/cache path; not confirmed as a retained browser heap problem for one normal dashboard or `/all-books` browser.

**Fix direction**

- Stop patching `BOOKS_QUERY_KEY` once consumers are migrated.
- During bulk import, send progress/invalidation events instead of one full DTO per book.
- Patch only loaded pages/windows.

### 7. Initial scan and rescan materialize full-library state

**5.5 Pro details**

Library processing builds discovered files, existing books, additional files, new-file lists, and grouped maps. Rescan can hold multiple full-library views at once.

**Diagnosis**

This is a real transient scale risk, especially for rescan and filesystem event storms. The exact nightly 50K synthetic import and no-change 50K rescan both produced high app RSS during work and then dropped after idle. This supports "large transient materialization/committed memory" more than "retained idle heap leak" for the tested paths.

**Evidence**

- Source: `LibraryProcessingService.processLibrary` collects discovered files, existing books, additional files, new files, and grouped files before processing.
- Source: `LibraryProcessingService.rescanLibrary` holds DB/filesystem views plus deleted/restored/new/additional/grouped state.
- Exact 50K import: app RSS peak `2,184,511,488`; DB RSS peak `459,747,328`; post-import idle sample app `469,463,040`, DB `459,595,776`.
- Exact 50K import row counts reached `book=50000`, `book_file=50000`, `book_metadata=50000`.
- Exact no-change 50K rescan: app RSS peak `1,906,503,680`; DB RSS peak `161,914,880`.
- Exact no-change 50K rescan: after a 60-second post-rescan idle window, app RSS was `436,764,672`; DB RSS was `158,863,360`.
- Debug endpoint post-GC after 50K full-list pressure had Java heap only `120 MiB committed / 119 MiB used`, which argues against a retained 50K-book heap after the endpoint workload. It is not a phase-specific ingest heap proof.

**Verification**

Verified for synthetic import and no-change rescan on 2026-05-29.

- Verification IDs: `EXACT-10K-INGEST`, `EXACT-50K-INGEST`, `V07-exact-nightly-50k-rescan-clean-60s-idle`, `DEBUG-50K-ENDPOINTS`.
- Evidence grade: A for exact import/rescan RSS and idle behavior; B for endpoint post-GC attribution; C/source for exact in-phase collection object attribution.
- Key artifacts:
  - `.memory-runs/run-20260529T111441Z-V01-V02-V08-exact-nightly-10k-clean`
  - `.memory-runs/run-20260529T113043Z-V08-V01-V02-exact-nightly-50k-clean`
  - `.memory-runs/run-20260529T123007Z-V07-exact-nightly-50k-rescan-clean-60s-idle`
  - `.memory-runs/run-20260529T115223Z-V01-V02-V10-V11-debug-jdk-50k-endpoints`
- Conclusion: confirmed as transient scan/rescan pressure. It is important, but less severe than overlapping full-list endpoint requests in these measurements, and it did not remain high after the rescan idle window.

**Fix direction**

- Batch/stream discovery and grouping where practical.
- Avoid holding several full-library views at once.
- Add phase markers/metrics before a rescan memory campaign.

### 8. Long outer scan transaction can fail at 50K

**5.5 Pro details**

The audit focused on scan/rescan memory, but the same source shape exposes long-running transactional work.

**Diagnosis**

This is a concrete reliability bug found during memory verification. The outer library scan transaction stays open while per-book work commits in `REQUIRES_NEW` transactions. At 50K, the outer connection can be reset by the time the method tries to commit.

**Evidence**

- Source: `LibraryProcessingService.processLibrary` / `rescanLibrary` are transactional long-running scan methods.
- Source: `BookGroupProcessor.process` uses `Propagation.REQUIRES_NEW` for per-group/book work.
- Exact 50K import inserted all expected rows and containers stayed healthy: app `restart_count=0 oom_killed=false`, DB `restart_count=0 oom_killed=false`.
- Exact 50K app log then recorded `Hibernate transaction: Unable to commit against JDBC Connection`, MariaDB `(conn=8) Socket error`, and `java.net.SocketException: Connection reset by peer` in the `processLibrary` path.

**Verification**

Verified on 2026-05-29 with exact nightly 50K import.

- Verification ID: `EXACT-50K-INGEST`.
- Evidence grade: A.
- Artifact: `.memory-runs/run-20260529T113043Z-V08-V01-V02-exact-nightly-50k-clean`
- Conclusion: confirmed. This is separate from OOM; row counts completed and containers did not restart.

**Fix direction**

- Remove or narrow the outer transaction around long scans.
- Keep per-book/per-batch writes in bounded transactions.
- Split rescan phases into short transactional units.

### 9. Per-book ingest log noise creates avoidable hot-path work

**5.5 Pro details**

The audit called out ingest and event fanout as high-volume paths. Earlier notes also suspected repeated exception/log noise and named entity graph exception-control-flow.

**Diagnosis**

The exact nightly logs confirm repeated per-book log noise. The debug JDK ingest JFR also confirms one repeated Hibernate dynamic-entity-graph exception path per imported book. This is more CPU/log I/O/allocation overhead than retained idle memory, but it is real hot-path bulk-import work.

The named entity graph exceptions are not logged application failures. They are thrown and handled inside the JPA/Hibernate entity graph lookup path while Spring Data resolves repository `@EntityGraph` metadata. The measured cost is still meaningful because it happens once per imported book in the 10K debug ingest run.

**Evidence**

- Exact 10K import logs contained `10,000` `Processing file:` lines, `10,000` `TOC_INVALID` lines, and `10,000` `No cover image found` lines.
- Exact 50K import logs contained `50,000` of each of those same patterns.
- Debug JDK 10K ingest logs contained `10,000` `Processing file:` lines, `10,000` `TOC_INVALID` lines, and `10,000` `No cover image found` lines, producing a `5.5 MB` app log with `30,242` lines.
- Debug JDK 10K ingest JFR recorded `20,203` exceptions thrown. The largest repeated application-path counts were `10,002` `InvocationTargetException`, `10,002` `IllegalArgumentException`, and `10,000` messages of `No EntityGraph with given name 'BookEntity.findByIdWithBookFiles'`.
- Parsed JFR entity graph exception counts: `10,000` for `BookEntity.findByIdWithBookFiles`, `1` for `LibraryEntity.findByIdWithPaths`, and `1` for `BookEntity.findAllByLibraryIdForRescan`.
- Debug JDK 10K ingest allocation samples were led by `byte[]` at `33.83%`, `Object[]` at `7.79%`, `char[]` at `6.40%`, `int[]` at `5.30%`, and `String` at `3.25%`. Top allocation sites included `InputStream.readNBytes`, `InputStream.transferTo`, XML parser DOM chunks, MariaDB packet reads, and HashMap growth.
- Source: `BookRepository.findByIdWithBookFiles` is annotated with dynamic `@EntityGraph(attributePaths = { "metadata", "metadata.comicMetadata", "shelves", "libraryPath", "library", "bookFiles" })`.
- Source: `BookGroupProcessor` logs `Processing file:` once per processed primary file, and `EpubProcessor` logs the expected missing-cover warning for these benchmark EPUBs.

**Verification**

Verified on 2026-05-29 with exact-image ingest logs and a debug JDK/JFR ingest run.

- Verification IDs: `EXACT-10K-INGEST`, `EXACT-50K-INGEST`, `V09-debug-jdk-ingest-10k`.
- Evidence grade: A for exact-image log counts; B for debug JVM exception/allocation attribution.
- Key artifacts:
  - `.memory-runs/run-20260529T111441Z-V01-V02-V08-exact-nightly-10k-clean/logs/app.log`
  - `.memory-runs/run-20260529T113043Z-V08-V01-V02-exact-nightly-50k-clean/logs/app.log`
  - `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k/summaries/jfr-exception-count.txt`
  - `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k/summaries/jfr-exception-by-type.txt`
  - `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k/summaries/jfr-entitygraph-exception-counts.tsv`
  - `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k/summaries/jfr-allocation-by-class.txt`
- Remaining gap: before/after run after removing or avoiding the repeated entity graph exception path and reducing expected per-book log noise.
- Conclusion: confirmed. Per-book logging and handled entity graph exceptions scale with imported book count in the benchmark import.

**Fix direction**

- Aggregate expected no-cover/invalid-TOC messages during bulk imports.
- Lower severity or sample repetitive expected warnings.
- Avoid the dynamic entity graph lookup path that throws `No EntityGraph...` for every imported book, or convert the hot repository call to a named graph/query path that does not rely on exception-control-flow.
- Re-run V09 after changes and compare exception counts, import duration, allocation samples, and app RSS.

### 10. Per-book websocket events create a real import-time burst, but dashboard-route memory amplification was not confirmed

**5.5 Pro details**

Import publishes one `BookAddedEvent(book)` per new book. Async listeners can broadcast full book DTOs and queued payloads if consumers lag.

**Diagnosis**

The event burst is now measured. With one browser connected during a 10K exact-image import, both the dashboard route and the actual `/all-books` route received about two websocket frames per book and about 25MB total websocket payload. Backend app RSS peak was close to the no-browser 10K import baseline, and idle memory dropped back to the same range. This confirms event volume and network/CPU work, but does not prove a retained memory leak or major idle-memory amplifier in one normal browser session.

**Evidence**

- Source: `BookGroupProcessor` publishes `new BookAddedEvent(book)`.
- Source: `BookAddedEventListener` handles events asynchronously after commit.
- Source: `BookEventBroadcaster` sends the full `book` payload to eligible users.
- Exact 10K no-browser import peak app RSS: `2,164,854,784`.
- Exact 10K browser-connected import peak app RSS: `2,174,025,728`.
- Exact 10K browser-connected import post-idle app RSS: `479,465,472`; DB RSS `186,990,592`.
- Browser-connected import websocket totals: `20,004` received frames, `43` sent frames, `24,969,373` received bytes.
- Exact 10K `/all-books` browser-connected import peak app RSS: `2,211,725,312`.
- Exact 10K `/all-books` browser-connected import post-idle app RSS: `473,387,008`; DB RSS `187,351,040`.
- `/all-books` browser-connected import websocket totals: `20,004` received frames, `28` sent frames, `24,969,364` received bytes.
- `/all-books` browser-connected import final browser heap: `12,700,000` used / `16,100,000` total.

**Verification**

Partially verified on 2026-05-29 with one real browser connected on both dashboard and `/all-books`.

- Verification IDs: `V10-exact-nightly-10k-ingest-with-browser`, `V10-exact-nightly-10k-ingest-with-browser-all-books`.
- Evidence grade: A for exact-image dashboard and `/all-books` event volume and app/browser memory; no queue-depth instrumentation.
- Artifacts:
  - `.memory-runs/run-20260529T121445Z-V10-exact-nightly-10k-ingest-with-browser`
  - `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`
- Remaining gap: multiple browsers, slower clients, browser allocation/CPU profiling, and server async queue-depth instrumentation.
- Conclusion: confirmed as bursty event traffic; not confirmed as a primary retained-memory or idle-RSS cause in the tested routes.

**Fix direction**

- Coalesce/batch import events.
- Send progress counters and cache invalidation instead of full DTO payloads during bulk import.
- Keep queued event payloads small.

### 11. JVM/container/database accounting can make memory look different from live heap

**5.5 Pro details**

The JVM can grow committed heap based on visible memory, Docker RSS can include committed but idle heap/native memory, and compose totals can include MariaDB.

**Diagnosis**

Strongly confirmed. Docker RSS is operationally important, but it must be interpreted alongside Java live heap, Java committed heap, NMT, DB RSS, and browser heap.

**Evidence**

- Exact 50K import: app RSS peak `2,184,511,488`; DB RSS peak `459,747,328`; post-import idle app `469,463,040`, DB `459,595,776`.
- Exact 50K endpoint packet: app RSS peak `4,477,747,200`; DB RSS peak `496,451,584`.
- Exact 50K browser startup: browser JS heap `64,000,000` used; app RSS peak `2,485,944,320`; DB RSS peak `486,039,552`.
- Debug 50K endpoint post-GC: Shenandoah heap `120M committed / 119M used`; NMT total committed `416,651 KB`; Java heap peak committed `3,874,816 KB`.
- Debug 50K JFR allocation pressure: `String[]` 14.85%, `byte[]` 13.49%, `String` 7.45%, `Object[]` 6.55%, `HashMap$Node[]` 3.83%, Hibernate collection entries/keys, `BookMetadata`, and `BookMetadataBuilder`.

**Verification**

Verified on 2026-05-29 with exact image plus debug JDK/NMT/JFR.

- Verification IDs: `EXACT-50K-INGEST`, `EXACT-50K-ENDPOINTS`, `EXACT-50K-BROWSER`, `DEBUG-50K-READY`, `DEBUG-50K-ENDPOINTS`.
- Evidence grade: A plus B.
- Conclusion: confirmed. Future benchmark and support reports should separate app RSS, DB RSS, Java live heap, Java committed heap, native memory, and browser heap.

**Fix direction**

- Provide low-memory deployment examples with explicit container/JVM limits.
- Add memory-reporting guidance to benchmarks and support docs.
- Ask whether a large library view was recently opened before diagnosing "idle" RSS.

### 12. App filter-options and current paged app-books path were not implicated by these tests

**5.5 Pro details**

The audit listed app filter-options and reader/media caches as smaller items to watch.

**Diagnosis**

The measured list/startup tests did not implicate app-books page 50 or filter-options as primary memory sources. Reader/media caches remain separate unverified workloads.

**Evidence**

- Exact 10K app-books page 50: `24,042` raw bytes, `0.188353 s`; filter-options: `33,729` raw bytes, `0.333207 s`.
- Exact 50K app-books page 50: `24,139` raw bytes, `0.243245 s`; filter-options: `34,046` raw bytes, `1.166687 s`.
- Compared with exact 50K full books: `94,512,387` raw bytes, `20.677348 s`.

**Verification**

Partially verified on 2026-05-29.

- Verification IDs: `EXACT-10K-ENDPOINTS`, `EXACT-50K-ENDPOINTS`.
- Evidence grade: A for these two endpoints.
- Remaining gap: reader/media cache workloads were not exercised.
- Conclusion: app-books and app filter-options are not the measured primary problem in the tested startup/list flows.

**Fix direction**

- Keep these endpoints as the preferred direction for browsing.
- Verify reader/media caches separately with media-heavy fixtures.

### 13. Bulk-by-ID endpoint can recreate full-list pressure up to request-line limits

**5.5 Pro details**

`/api/v1/books/batch` accepts IDs and returns full `Book` DTOs. A paginated UI could still recreate full-list memory pressure by sending a huge ID list.

**Diagnosis**

Confirmed with an exact 50K database. The endpoint can return full DTO payloads for large ID sets, and the response scales almost exactly like full-list response size for the same number of books. The practical upper bound currently appears to be HTTP request-line/query length: a 50K-ID query returned HTTP 400 quickly, but that is an accidental transport limit rather than an intentional app-level cap or bounded API design.

**Evidence**

- Source: `BookController.getBooksByIds` exposes `GET /api/v1/books/batch` with `@RequestParam Set<Long> ids` and returns `ResponseEntity<List<Book>>`.
- Source: `BookService.getBooksByIds` calls `bookQueryService.findAllWithMetadataByIds(ids)`, maps each entity to a broad `Book`, and enriches progress.
- Source: `BookRepository.findAllWithMetadataByIds` uses a broad entity graph with metadata, comic metadata, authors, categories, moods, tags, shelves, library path, library, and book files.
- Exact 50K DB, 10K IDs: status `200`, `18,995,169` raw bytes, `745,279` gzip bytes, `0.906125 s`, app RSS `597,516,288 -> 851,492,864`.
- Exact 50K DB, 5K IDs: status `200`, `9,495,181` raw bytes, `373,226` gzip bytes, `0.553018 s`.
- Exact 50K DB, 50K IDs: status `400`, `435` raw bytes, `0.013439 s`, with a `288,893` character ID query string.

**Verification**

Verified on 2026-05-29 with exact nightly image and copied 50K database.

- Verification ID: `V13-exact-nightly-50k-batch-by-ids-clean`.
- Evidence grade: A for user-image endpoint behavior.
- Artifact: `.memory-runs/run-20260529T120952Z-V13-exact-nightly-50k-batch-by-ids-clean`
- Result: confirmed for accepted large ID sets up to 10K IDs; 50K is rejected by query/request size, not by an application-level limit.
- Conclusion: this endpoint should be capped and/or moved to a paged/narrow DTO shape before relying on pagination elsewhere.

**Fix direction**

- Cap ID list size explicitly.
- Return narrow DTOs or require paged/keyset batch retrieval.
- Prefer POST only if paired with explicit server-side limits; switching methods alone would remove the current transport guardrail.

### 14. Folder ZIP downloads buffer the full ZIP in heap

**5.5 Pro details**

Folder-based audiobook/additional-folder downloads can write ZIP output to `ByteArrayOutputStream`, convert to `byte[]`, and return a `ByteArrayResource`.

**Diagnosis**

Confirmed for both the primary folder-audiobook download path and the additional-file folder download path. A 128MiB incompressible folder caused each endpoint to create a full in-memory ZIP before sending it. The primary-book streaming control, `/api/v1/books/{id}/download-all`, returned almost the same ZIP size with essentially flat app RSS during the request.

There was also a useful harness bug: the first attempt accidentally created one regular file and therefore tested direct file download, not folder ZIP download. That artifact is retained as a failed/negative control but is not used as V27 proof.

**Evidence**

- Source: `BookDownloadService.downloadFolderAsZip` uses `ByteArrayOutputStream`, `ZipOutputStream`, `baos.toByteArray()`, and `ByteArrayResource`.
- Source: `BookDownloadService.downloadAllBookFiles` writes a ZIP directly to `response.getOutputStream()`.
- Source: `AdditionalFileService.downloadFolderAsZip` uses the same `ByteArrayOutputStream` / `ByteArrayResource` pattern for additional folder downloads.
- Exact image fixture: one folder-based audiobook with two random 64MiB `.mp3`-named files; DB row showed `is_folder_based=1`, `file_size_kb=131072`, `book_type=AUDIOBOOK`.
- `/download`: status `200`, `134,258,928` bytes, `10.147187 s`, app RSS `663,076,864 -> 1,210,904,576`.
- `/download-all`: status `200`, `134,259,008` bytes, `8.034436 s`, app RSS `705,679,360 -> 710,201,344`.
- During the `/download` request window, sampled app RSS stayed around `1.21-1.23 GB`; after download/idle it dropped back around `706 MB`.
- Additional folder fixture: one imported EPUB plus a DB-attached additional folder with two random 64MiB `.mp3`-named files; DB rows showed primary `is_book=1` and additional `is_book=0`, `is_folder_based=1`, `file_size_kb=131072`, `book_type=AUDIOBOOK`.
- `/api/v1/books/1/files/2/download`: status `200`, `134,258,928` bytes, `10.211125 s`, app RSS `492,392,448 -> 922,529,792`; sampled download-window peak was about `940,670,976` bytes before dropping back to about `489,533,440`.
- Concurrent primary folder fixture: three overlapping `/api/v1/books/1/download` clients against the same 128MiB incompressible folder; each returned `134,258,928` bytes in about `10.18-10.22 s`.
- Concurrent buffered downloads moved app RSS from `510,640,128` to `1,797,185,536`, with sampled peak `1,819,090,944`.
- The same concurrent run's `/download-all` streaming control returned `134,259,008` bytes in `8.032898 s`, with app RSS `513,662,976 -> 517,558,272`.
- Post-download idle in the concurrent run dropped back to about `513,003,520` app RSS.

**Verification**

Verified on 2026-05-29 with exact nightly image and synthetic incompressible folder fixtures.

- Verification IDs: `V27-exact-nightly-folder-zip-download-128mb-clean`, `V27-additional-folder-zip-download-128mb-clean`, `V27-concurrent-folder-zip-download-3x128mb`.
- Evidence grade: A for user-image endpoint behavior.
- Artifacts:
  - `.memory-runs/run-20260529T124014Z-V27-exact-nightly-folder-zip-download-128mb-clean`
  - `.memory-runs/run-20260529T130217Z-V27-additional-folder-zip-download-128mb-clean`
  - `.memory-runs/run-20260529T134154Z-V27-concurrent-folder-zip-download-3x128mb`
- Superseded harness-bug artifact: `.memory-runs/run-20260529T123800Z-V27-exact-nightly-folder-zip-download-128mb`
- Additional harness-bug artifact: `.memory-runs/run-20260529T130136Z-V27-additional-folder-zip-download-128mb`
- Result: confirmed for folder audiobook `/download`, additional folder `/files/{fileId}/download`, and three overlapping primary-folder `/download` clients; `/download-all` is a working streaming control for the primary-book shape.
- Conclusion: folder ZIP downloads are a direct high-transient-memory bug. Concurrent buffered downloads multiply the transient RSS spike; larger folders and mixed primary/additional concurrency remain the remaining stress shape.

**Fix direction**

- Stream folder ZIP responses instead of returning `ByteArrayResource`.
- Apply the same streaming shape to additional-folder downloads.
- Add size/concurrency guards for large media downloads.

### 15. Recommendation updater creates a sharp all-library processing and RSS spike

**5.5 Pro details**

Recommendation tasks can build maps of embeddings, series names, candidates, and outputs before saving.

**Diagnosis**

The source shape is worse than just "some maps": the task keeps all embeddings in memory, keeps a series-name map, loops over every book against every other book, builds a candidate list for each target, sorts candidates, and keeps all recommendation outputs in a map before saving them in batches. The exact-image runtime baselines at 1K, 2K, 5K, and 10K books all produced sharp RSS spikes.

This is both a processing risk and a memory risk. The 1K, 2K, 5K, and 10K runs completed without OOM, but task duration grew from seconds to over three minutes by 10K. That does not make the algorithm safe for large libraries because the similarity loop scales approximately with book-count squared.

**Evidence**

- Source: `BookRecommendationUpdaterTask.execute` stores `Map<Long, double[]> embeddings` and `Map<Long, String> seriesNames` for the whole library.
- Source: for each target book, the task streams over `allBookIds`, creates `ScoredBook` candidates, calls `.toList()`, sorts candidates in `findTopKSimilar`, then stores results in `allRecommendations` before saving.
- Exact image 1K fixture: imported `1,000` synthetic EPUBs and triggered `POST /api/v1/tasks/start` with `UPDATE_BOOK_RECOMMENDATIONS`.
- Task completed in app logs in `4,638 ms`.
- Task results: `1,000` books, `1,000` non-null embedding vectors, `1,000` non-null `similar_books_json` values, completed task row count `1`.
- Task-status samples: app RSS `534,994,944` at `IN_PROGRESS` and `2,182,828,032` at `COMPLETED`.
- Docker sampler peak: `2,183,118,848` bytes app RSS during the recommendation window.
- 15-second post-task idle sample remained around `1,599,803,392` bytes app RSS.
- Exact image 2K fixture: imported `2,000` synthetic EPUBs and triggered the same task with the corrected payload.
- 2K task completed in app logs in `11,182 ms`.
- 2K task results: `2,000` books, `2,000` non-null embedding vectors, `2,000` non-null `similar_books_json` values, completed task row count `1`.
- 2K task-status samples: app RSS `1,801,437,184` at first `IN_PROGRESS`, `2,317,545,472` while still `IN_PROGRESS`, and `587,988,992` at `COMPLETED`.
- 2K Docker sampler peak: `2,339,500,032` bytes app RSS during the recommendation window.
- 2K post-task idle sample dropped to about `552,239,104` bytes app RSS.
- Exact image 5K fixture: imported `5,000` synthetic EPUBs and triggered the same task.
- 5K task completed in app logs in `51,923 ms`.
- 5K task results: `5,000` books, `5,000` non-null embedding vectors, `5,000` non-null `similar_books_json` values, completed task row count `1`.
- 5K task-status samples reached `2,327,846,912` while still `IN_PROGRESS`.
- 5K Docker sampler peak: `2,347,315,200` bytes app RSS during the recommendation window.
- 5K post-task idle sample dropped to about `777,179,136` bytes app RSS.
- Exact image 10K fixture: imported `10,000` synthetic EPUBs and triggered the same task.
- 10K task completed in app logs in `190,462 ms`.
- 10K task results: `10,000` books, `10,000` non-null embedding vectors, `10,000` non-null `similar_books_json` values, completed task row count `1`.
- 10K task-status samples reached `2,347,393,024` while still `IN_PROGRESS`.
- 10K Docker sampler peak: `2,354,757,632` bytes app RSS during the import/task run.
- 10K post-task 15-second idle sample was about `1,275,248,640` bytes app RSS.
- Debug JDK/JFR 2K fixture: imported `2,000` synthetic EPUBs, forced a pre-task GC/snapshot, then recorded JFR only around `UPDATE_BOOK_RECOMMENDATIONS`.
- Debug 2K task completed in app logs in `11,624 ms`; task results were `2,000` non-null embedding vectors and `2,000` recommendation outputs.
- Debug 2K Docker sampler peak: `2,374,369,280` bytes app RSS during the JFR task window.
- Debug 2K post-GC heap snapshots: pre-task `116M committed / 115M used`, post-task `108M committed / 107M used`.
- Debug 2K JFR native-memory view: Java heap committed up to `1.8 GB` during the task window, then dropped back near the pre-task level.
- Debug 2K JFR allocation/hot-method views: samples were led by `Object[]`, `ThreadLocalMap.Entry`, Hibernate `SessionImpl`/persistence context/action queue, `HashMap`/node arrays, Spring/JPA transaction objects, and `BookVectorService.cosineSimilarity`.
- Failed 2K harness attempt imported `2,000` books but did not start the task because the request body lacked `"options": null`; this is retained as a harness bug, not a V23 result.
- Failed 10K harness attempt built the fixture but mounted an empty `/books` directory because `ARTIFACT_DIR` was relative and Compose resolved bind paths relative to the compose file; this is retained as a harness bug, not a V23 result.

**Verification**

Verified on 2026-05-29 with an exact nightly image and 1K/2K/5K/10K subsets of the benchmark EPUB fixture.

- Verification IDs: `V23-recommendation-task-1k-clean`, `V23-recommendation-task-2k-clean`, `V23-recommendation-task-5k-clean`, `V23-recommendation-task-10k-clean`, `V23-debug-jdk-recommendation-task-2k`.
- Evidence grade: A for exact-image task behavior at 1K, 2K, 5K, and 10K; B for debug JDK/JFR attribution at 2K; source-confirmed for larger algorithmic scaling.
- Artifact: `.memory-runs/run-20260529T131138Z-V23-recommendation-task-1k-clean`
- Artifact: `.memory-runs/run-20260529T131940Z-V23-recommendation-task-2k-clean`
- Artifact: `.memory-runs/run-20260529T132425Z-V23-recommendation-task-5k-clean`
- Artifact: `.memory-runs/run-20260529T141928Z-V23-recommendation-task-10k-clean`
- Artifact: `.memory-runs/run-20260529T133424Z-V23-debug-jdk-recommendation-task-2k`
- Harness-bug artifact: `.memory-runs/run-20260529T130937Z-V23-recommendation-task-2k`
- Harness-bug artifact: `.memory-runs/run-20260529T141449Z-V23-recommendation-task-10k-clean`
- Remaining gap: before/after validation after algorithm changes.
- Conclusion: confirmed as a real recommendation-task memory/processing spike at 1K, 2K, 5K, and 10K. The debug JDK run shows it is mostly transient heap/allocation and CPU pressure rather than retained Java heap after GC.

**Fix direction**

- Avoid materializing and sorting the full candidate list for every target.
- Keep only top-K candidates while scanning, or use an approximate nearest-neighbor/indexed approach.
- Persist recommendations per batch/target rather than retaining all outputs until the end.
- Add a hard library-size guard or chunked/offline job mode before exposing this to very large libraries.

## Unverified 5.5 Pro Pressure Points

These items remain plausible but do not yet have concrete runtime evidence in this campaign. Evidence and verification are intentionally blank.

### File discovery full lists and maps can retain all paths

**5.5 Pro details**

Discovery can build full file lists and maps before processing.

**Evidence**

**Verification**

**Fix direction**

- Stream traversal into bounded batches.
- Track scan collection sizes as metrics.

### Fileless matching may repeatedly load library-wide data

**5.5 Pro details**

Grouping/matching can repeatedly load fileless books for a library.

**Evidence**

**Verification**

**Fix direction**

- Load match candidates once per batch or use indexed DB-side matching.

### Duplicate hashing can extend import lifetime

**5.5 Pro details**

The same file content may be read/hashed more than once, increasing CPU/I/O and keeping import transactions/events alive longer.

**Evidence**

**Verification**

**Fix direction**

- Calculate file identity once per import step and pass it forward.

### Pending comic metadata map can retain entries on failure paths

**5.5 Pro details**

`pendingComicMetadata` is temporary cross-method state. Exceptions between insertion and cleanup may retain entries.

**Evidence**

**Verification**

**Fix direction**

- Guarantee cleanup with `try/finally` and expose map-size metrics.

### Async executor queue can retain heavy payloads

**5.5 Pro details**

If producers outpace consumers, queued async tasks may retain book/event payloads.

**Evidence**

**Verification**

**Fix direction**

- Split heavy background jobs from lightweight event delivery and expose queue depth.

### Websocket message limits do not prevent server-side allocation

**5.5 Pro details**

Server-side DTO/JSON allocation can happen before websocket delivery limits fail or cap a payload.

**Evidence**

**Verification**

**Fix direction**

- Keep websocket payloads small by design; use IDs and page invalidation.

### Metadata refresh can load broad graphs

**5.5 Pro details**

Metadata refresh paths can load/map many books and metadata proposals.

**Evidence**

**Verification**

**Fix direction**

- Fetch IDs first and process metadata refresh in chunks.

### Metadata refresh review mode may retain all proposals

**5.5 Pro details**

Review mode can accumulate generated proposals, and task/status endpoints can load/map proposal DTOs.

**Evidence**

**Verification**

**Fix direction**

- Page proposals and make status endpoints bounded.

### Metadata match score recalculation may full-load books

**5.5 Pro details**

Score recalculation may load all books to compute and save scores.

**Evidence**

**Verification**

**Fix direction**

- Recalculate in ID/keyset batches and save/clear per batch.

### Duplicate detection whole-library grouping

**5.5 Pro details**

Duplicate detection can group the whole library by identifiers, title/author, directory, or filename.

**Evidence**

**Verification**

**Fix direction**

- Use DB grouping or paged jobs and return duplicate groups in pages.

### Sidecar bulk import/export loads all books with files

**5.5 Pro details**

Sidecar bulk operations can load every book with files before iterating.

**Evidence**

**Verification**

**Fix direction**

- Convert to batched/keyset migration and clear persistence context per batch.

### Missing file-size migration may full-load affected books

**5.5 Pro details**

Startup migration/backfill paths can load all books with missing file size.

**Evidence**

**Verification**

**Fix direction**

- Backfill with DB-side updates or bounded batches.

### Archive entry APIs can read full entries into memory

**5.5 Pro details**

Archive entry helpers can allocate whole uncompressed entries.

**Evidence**

**Verification**

**Fix direction**

- Stream entries or enforce entry-size caps.

### EPUB content reading can load spine content into memory

**5.5 Pro details**

EPUB content paths can copy a resource into `ByteArrayOutputStream` and convert it to a `String`.

**Evidence**

**Verification**

**Fix direction**

- Stream or size-limit large spine resources.

### EPUB CFI DOM cache can retain large parsed documents

**5.5 Pro details**

CFI operations may cache parsed DOM documents until eviction.

**Evidence**

**Verification**

**Fix direction**

- Consider weight-based eviction if reader workloads show large DOM retention.

### Image, PDF, cover, and comic processing can create large transient objects

**5.5 Pro details**

Image/PDF/comic paths use `readAllBytes`, `ByteArrayOutputStream`, `byte[]`, and `BufferedImage` objects.

**Evidence**

**Verification**

**Fix direction**

- Add size guards, streaming where possible, and controlled concurrency.

### Bulk cover regeneration may retain all candidates

**5.5 Pro details**

Bulk cover regeneration can load all candidate books before processing.

**Evidence**

**Verification**

**Fix direction**

- Page candidate IDs and process through bounded transactions.

### Bookdrop queue is unbounded

**5.5 Pro details**

The bookdrop handler uses an unbounded queue, and duplicate detection can scan the queue.

**Evidence**

**Verification**

**Fix direction**

- Use bounded/coalescing queues and queue-depth metrics.

### Library watcher queues and pending maps can grow during event storms

**5.5 Pro details**

Mass moves/deletes/restores can create large watcher queues and pending create/delete maps.

**Evidence**

**Verification**

**Fix direction**

- Bound/coalesce watcher events and expose queue/pending-map metrics.

### Pending deletion pool can retain large snapshots

**5.5 Pro details**

Folder deletion/move handling can retain snapshots of affected books/files until grace-period expiry or recovery.

**Evidence**

**Verification**

**Fix direction**

- Store lightweight IDs and reload details only when needed.

### Shared executor contention can retain unrelated payloads

**5.5 Pro details**

Unrelated heavy jobs and lightweight async events can share executor capacity, delaying consumers and retaining queued payloads.

**Evidence**

**Verification**

**Fix direction**

- Split executors by workload type and bound queues according to payload weight.

## Combined Fix Order

1. Remove normal full-list behavior from browsing and startup.
2. Replace backend list DTO mapping with list projections; do not rely on post-mapping stripping.
3. Add guardrails to legacy unbounded endpoints, including large batch-by-ID shapes.
4. Narrow the long scan transaction.
5. Reduce bulk ingest log noise and then run a debug ingest JFR for exception-control-flow evidence.
6. Coalesce bulk import events and remove legacy full-array cache patching.
7. Replace buffered folder ZIP downloads with streaming responses and add size/concurrency guards.
8. Verify the remaining independent backlog with targeted fixtures: websocket route variants, metadata jobs, recommendation scaling/JFR, archive entry reads, media processing, watcher queues, and bookdrop.
9. Document memory accounting as app RSS, DB RSS, Java live heap, Java committed heap, native memory, and browser heap.
