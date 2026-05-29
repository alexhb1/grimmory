# Grimmory Memory Use Combined Diagnosis - Blank Verification Copy - 2026-05-29

## Purpose

This is the verification-template copy of `docs/memory-use-combined-diagnosis-2026-05-29.md`.

It keeps the diagnosis, source notes, evidence summaries, and fix directions, but every `Verification` section is intentionally blank. Use this document when running a fresh campaign or when filling a finding from raw artifacts.

## Evidence Levels

- **Confirmed** means the issue has live container, endpoint, browser, JFR, NMT, heap, log, or direct source-path evidence.
- **Source-confirmed** means the code path was checked and the memory shape is real, but runtime cost was not isolated.
- **Unverified** means the pressure point is from the 5.5 Pro audit only. Evidence and verification are intentionally blank until measured.

## Executive Diagnosis

The strongest measured issue is the legacy full-library books path. Normal authenticated frontend startup calls `/api/v1/books?stripForListView=false`, and the backend returns an unbounded `List<Book>`. `stripForListView=true` reduces payload size but still pays most backend mapping cost because stripping happens after full DTO mapping.

Synthetic ingest is still expensive and exposed a separate 50K transaction reliability bug, but the biggest reproduced app RSS spike came from overlapping full-list endpoint requests. Memory reporting must separate app RSS, DB RSS, Java live heap, Java committed heap, native memory, and browser heap.

## Overlap Map

| Area from 5.5 Pro audit | Live/source mapping | Status |
|---|---|---|
| Frontend globally loads `/api/v1/books?stripForListView=false` | Browser startup saw this request | Confirmed |
| Backend `/api/v1/books` is unbounded | Endpoint returns `ResponseEntity<List<Book>>`; measured at multiple sizes | Confirmed |
| Backend maps full DTOs before stripping | Source path and stripped/unstripped measurements agree | Confirmed |
| Book DTO is too wide for list traffic | Payload/JFR/source shape agree | Confirmed |
| Frontend metadata/filter state derived from all books | `uniqueMetadata` depends on full `books()` signal | Source-confirmed |
| Websocket cache patches legacy full-book cache | Source path found; event storm not load-tested | Source-confirmed |
| Initial scan/rescan materializes full-library state | Import and no-change rescan show transient RSS pressure that drops after idle | Confirmed transient pressure |
| Per-book import events and async fanout | Browser-connected imports can produce a large websocket burst; retained one-browser heap impact was not confirmed | Confirmed event burst, memory amplification not confirmed |
| JVM/container/DB accounting confusion | Docker stats, NMT, heap info, and browser metrics agree | Confirmed |
| Bulk-by-ID endpoints can recreate list pressure | `/api/v1/books/batch` returns full `Book` DTO lists for large ID sets until request-line limits reject the query | Confirmed |
| Folder ZIP downloads buffer full archives | Folder audiobook `/download` buffers the ZIP in heap; `/download-all` streams a comparable ZIP with much flatter RSS | Confirmed |
| Recommendation updater all-library structures | Exact-image small-baseline runtime evidence exists in the filled diagnosis | Confirmed small-baseline pressure |
| Metadata jobs, archive entry reads, watcher queues, media processing | Not exercised in runtime campaign | Unverified |

## Confirmed and Source-Confirmed Diagnoses

### 1. Legacy full-books request is the main reproduced backend memory spike

**5.5 Pro details**

The frontend has a global book query that calls `/api/v1/books` with `stripForListView=false`, exposes a full `Book[]`, and is made app-wide by root `BookService` injection. The backend endpoint returns an unbounded list.

**Diagnosis**

Large libraries force the backend to load, map, serialize, and transfer every book in one request. Overlapping requests stack transient pressure.

**Evidence**

- Source: `BookService` calls `/api/v1/books?stripForListView=false`.
- Source: `AppComponent` injects `BookService`.
- Source: `BookController` exposes unbounded `GET /api/v1/books`.
- Source: `BookQueryService` loads `findAllWithMetadata()` and maps the whole list.
- Runtime evidence exists in the filled diagnosis for 1,506, 10K, and 50K datasets.

**Verification**



**Fix direction**

- Move normal UI list/browser screens to `/api/v1/app/books` or another bounded API.
- Add a guardrail, deprecation path, or explicit admin/export semantics for unbounded `/api/v1/books`.
- Avoid loading the full library at app startup.

### 2. `stripForListView` does not fix backend memory

**5.5 Pro details**

The backend maps entities to full DTOs first, then strips fields afterward.

**Diagnosis**

`stripForListView=true` helps network payload, but it is not the backend memory fix.

**Evidence**

- Source: `BookQueryService.mapToBookDtos` maps with `bookMapperV2.toDTO(...)` before `stripFieldsForListView`.
- Runtime evidence exists in the filled diagnosis for stripped/unstripped exact-image endpoint probes.

**Verification**



**Fix direction**

- Use DB-side projections for list rows.
- Fetch detail DTOs only by ID.
- Treat "strip after mapping" as a compatibility bridge, not the optimization.

### 3. The Book DTO is too wide for list traffic

**5.5 Pro details**

The list path returns a broad `Book` DTO with file, metadata, progress, shelves, library path, and format/detail data.

**Diagnosis**

Pagination solves the worst spike, but wide row shape still matters.

**Evidence**

- Source: `Book` and `BookMetadata` are detail-sized DTOs.
- Source: `BookMapperV2` maps broad metadata, files, audio, author/category/tag, and format fields.
- Runtime evidence exists in the filled diagnosis for full-list versus app-books payload size.

**Verification**



**Fix direction**

- Define a narrow list-row DTO.
- Keep broad metadata and associated files behind detail APIs.

### 4. Frontend startup triggers the legacy full-library fetch

**5.5 Pro details**

The full-books query is global enough that normal UI flows can load the whole library.

**Diagnosis**

Real browser probes showed normal authenticated startup reaches `/api/v1/books?stripForListView=false`.

**Evidence**

- Runtime evidence exists in the filled diagnosis for exact-image 10K and 50K browser startup, plus a 10K retained browser heap snapshot.

**Verification**



**Fix direction**

- Make startup/dashboard use bounded summary APIs.
- Keep book-browser pages on paginated app-books APIs.
- Do not derive global app state by subscribing to the legacy full-books query.

### 5. Frontend metadata/filter state is derived from all books

**5.5 Pro details**

`BookService.uniqueMetadata` iterates over every loaded book and builds sets of authors, categories, moods, tags, publishers, series, etc.

**Diagnosis**

This is source-confirmed and architecturally tied to the startup/full-list problem. The filled diagnosis includes a 10K retained browser heap snapshot summary.

**Evidence**

- Source: `BookService.uniqueMetadata` depends on `this.books()`.
- Source: `AppFilterController` and `AppBookService` expose a newer backend filter-options path.
- Runtime evidence exists in the filled diagnosis for retained browser object/array/string pressure after the full-list startup fetch.

**Verification**



**Fix direction**

- Fetch facets/filter options from backend aggregate endpoints.
- Support search/autocomplete for high-cardinality metadata.
- Stop making metadata options depend on full list loading.

### 6. Frontend websocket/cache code still maintains the legacy full-book cache

**5.5 Pro details**

Book add/update/remove events patch a cached full `Book[]`.

**Diagnosis**

This is source-confirmed, and browser-connected import can produce a large websocket burst. One-browser dashboard and `/all-books` runs did not show retained browser heap growth, but multiple-browser, slow-consumer, and queue-depth scenarios still need verification.

**Evidence**

- Source: `book-query-cache.ts` patches `BOOKS_QUERY_KEY` by appending, mapping, filtering, and replacing entries.
- Source: `book-socket.service.ts` routes websocket book events into those cache patch methods.
- Runtime evidence exists in the filled diagnosis for exact-image dashboard and `/all-books` browser-connected imports.

**Verification**



**Fix direction**

- Stop patching `BOOKS_QUERY_KEY` once consumers are migrated.
- During bulk import, send progress/invalidation events instead of one full DTO per book.
- Patch only loaded pages/windows.

### 7. Initial scan and rescan materialize full-library state

**5.5 Pro details**

Library processing builds discovered files, existing books, additional files, new-file lists, and grouped maps.

**Diagnosis**

This is a transient scale risk, especially for rescan and filesystem event storms. Runtime evidence exists for synthetic import and no-change rescan, but in-phase heap object attribution remains a future debug run.

**Evidence**

- Source: `LibraryProcessingService.processLibrary` and `rescanLibrary` collect multiple full-library views.
- Runtime evidence exists in the filled diagnosis for exact-image 10K/50K ingest.
- Runtime evidence exists in the filled diagnosis for exact-image no-change 50K rescan.

**Verification**



**Fix direction**

- Batch/stream discovery and grouping where practical.
- Avoid holding several full-library views at once.
- Add phase markers/metrics before a rescan memory campaign.

### 8. Long outer scan transaction can fail at 50K

**5.5 Pro details**

The scan/rescan memory shape also exposes long-running transactional work.

**Diagnosis**

The outer library scan transaction can stay open across the long import while per-book work commits in `REQUIRES_NEW` transactions.

**Evidence**

- Source: `LibraryProcessingService.processLibrary` / `rescanLibrary` are transactional long-running scan methods.
- Source: `BookGroupProcessor.process` uses `Propagation.REQUIRES_NEW`.
- Runtime evidence exists in the filled diagnosis for exact-image 50K transaction failure.

**Verification**



**Fix direction**

- Remove or narrow the outer transaction around long scans.
- Keep per-book/per-batch writes in bounded transactions.
- Split rescan phases into short transactional units.

### 9. Per-book ingest log noise creates avoidable hot-path work

**5.5 Pro details**

The audit called out ingest and event fanout as high-volume paths. The filled diagnosis also tracks the named entity graph exception-control-flow suspicion.

**Diagnosis**

Per-book ingest logging and handled entity graph exceptions are plausible hot-path overhead. The filled diagnosis contains the concrete runtime evidence; this blank copy keeps verification open for repeatable reruns and future before/after comparisons.

**Evidence**

- Runtime evidence exists in the filled diagnosis for exact-image 10K/50K log counts and debug JDK 10K JFR exception/allocation attribution.

**Verification**



**Fix direction**

- Aggregate expected no-cover/invalid-TOC messages during bulk imports.
- Lower severity or sample repetitive expected warnings.
- Avoid repeated dynamic entity graph exception-control-flow on hot repository calls.
- Re-run the debug ingest JFR after changes and compare exception counts, import duration, allocation samples, and app RSS.

### 10. Per-book websocket events can amplify import pressure

**5.5 Pro details**

Import publishes one `BookAddedEvent(book)` per new book. Async listeners can broadcast full book DTOs and queued payloads if consumers lag.

**Diagnosis**

The source shape is real, and runtime event volume has been measured for one dashboard-route import and one `/all-books` route import. Queue-depth, multiple-browser fanout, and slower-consumer behavior remain unverified.

**Evidence**

- Source: `BookGroupProcessor` publishes `new BookAddedEvent(book)`.
- Source: `BookAddedEventListener` handles events asynchronously after commit.
- Source: `BookEventBroadcaster` sends the full `book` payload to eligible users.
- Runtime evidence exists in the filled diagnosis for exact-image dashboard and `/all-books` browser-connected imports.

**Verification**



**Fix direction**

- Coalesce/batch import events.
- Send progress counters and cache invalidation instead of full DTO payloads during bulk import.
- Keep queued event payloads small.

### 11. JVM/container/database accounting can make memory look different from live heap

**5.5 Pro details**

The JVM can grow committed heap based on visible memory, Docker RSS can include committed but idle heap/native memory, and compose totals can include MariaDB.

**Diagnosis**

Docker RSS is operationally important, but it must be interpreted alongside Java live heap, Java committed heap, NMT, DB RSS, and browser heap.

**Evidence**

- Runtime evidence exists in the filled diagnosis for exact-image 50K ingest, endpoint, browser, and debug JDK/NMT/JFR runs.

**Verification**



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

- Runtime evidence exists in the filled diagnosis for 10K/50K app-books and filter-options endpoint probes.

**Verification**



**Fix direction**

- Keep these endpoints as the preferred direction for browsing.
- Verify reader/media caches separately with media-heavy fixtures.

### 13. Bulk-by-ID endpoint can recreate full-list pressure up to request-line limits

**5.5 Pro details**

`/api/v1/books/batch` accepts IDs and returns full `Book` DTOs. A paginated UI could still recreate full-list memory pressure by sending a huge ID list.

**Diagnosis**

The endpoint can return full DTO payloads for large ID sets. A very large query may be rejected by request-line/query length, but that is not an intentional app-level memory bound.

**Evidence**

- Source: `BookController.getBooksByIds` exposes `GET /api/v1/books/batch` with `@RequestParam Set<Long> ids` and returns `ResponseEntity<List<Book>>`.
- Source: `BookService.getBooksByIds` calls `bookQueryService.findAllWithMetadataByIds(ids)`, maps each entity to a broad `Book`, and enriches progress.
- Source: `BookRepository.findAllWithMetadataByIds` uses a broad entity graph.
- Runtime evidence exists in the filled diagnosis for exact-image 50K DB batch probes.

**Verification**



**Fix direction**

- Cap ID list size explicitly.
- Return narrow DTOs or require paged/keyset batch retrieval.
- Prefer POST only if paired with explicit server-side limits.

### 14. Folder ZIP downloads buffer the full ZIP in heap

**5.5 Pro details**

Folder-based audiobook/additional-folder downloads can write ZIP output to `ByteArrayOutputStream`, convert to `byte[]`, and return a `ByteArrayResource`.

**Diagnosis**

The primary folder-audiobook and additional-file folder download paths buffer generated ZIPs before response. A streaming control path exists for primary-book `download-all`.

**Evidence**

- Source: `BookDownloadService.downloadFolderAsZip` uses `ByteArrayOutputStream`, `ZipOutputStream`, `baos.toByteArray()`, and `ByteArrayResource`.
- Source: `BookDownloadService.downloadAllBookFiles` writes a ZIP directly to `response.getOutputStream()`.
- Source: `AdditionalFileService.downloadFolderAsZip` uses the same `ByteArrayOutputStream` / `ByteArrayResource` pattern.
- Runtime evidence exists in the filled diagnosis for synthetic incompressible primary-folder, additional-folder, and concurrent primary-folder fixtures.

**Verification**



**Fix direction**

- Stream folder ZIP responses instead of returning `ByteArrayResource`.
- Apply the same streaming shape to additional-folder downloads.
- Add size/concurrency guards for large media downloads.

### 15. Recommendation updater creates a sharp all-library processing and RSS spike

**5.5 Pro details**

Recommendation tasks can build maps of embeddings, series names, candidates, and outputs before saving.

**Diagnosis**

The updater keeps whole-library embedding/series maps, builds per-target candidate lists, sorts them, and retains recommendation outputs before saving. The filled diagnosis contains exact-image runtime baselines through 10K books; before/after validation remains a follow-up.

**Evidence**

- Runtime evidence exists in the filled diagnosis for exact-image 1K, 2K, 5K, and 10K benchmark-subset recommendation tasks, plus debug JDK/JFR attribution at 2K.
- Source evidence exists in `BookRecommendationUpdaterTask` and `BookVectorService`.

**Verification**



**Fix direction**

- Avoid materializing and sorting the full candidate list for every target.
- Keep only top-K candidates while scanning, or use an approximate nearest-neighbor/indexed approach.
- Persist recommendations per batch/target instead of retaining all outputs until the end.
- Add size guards or chunked/offline job behavior for large libraries.

## Unverified 5.5 Pro Pressure Points

These remain plausible but do not yet have concrete runtime evidence in this campaign. Evidence and verification are intentionally blank.

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
