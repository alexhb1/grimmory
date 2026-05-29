# Grimmory Memory Diagnosis - 2026-05-29

## High Level Summary

The largest verified memory problem is the current primary full-library books API. This is the main way the frontend gets book information today, and it loads the whole library during normal authenticated startup.

With 50,000 books, one request to `/api/v1/books?stripForListView=false` returned about 90 MiB of JSON and moved backend container memory from about 0.44 GiB to about 1.55 GiB. Four overlapping full-list requests peaked at about 4.17 GiB.

The `stripForListView=true` flag reduces network payload size, but it does not solve backend memory. The backend still loads and maps the broad full-book object graph first, then strips fields afterward.

Ingest is expensive, but the tested ingest path looked mostly transient rather than an idle leak. A 50,000-book import peaked around 2.03 GiB backend RSS and later returned to about 0.44 GiB.

Other verified memory or allocation pressure points are folder ZIP downloads, recommendation updates, large batch-by-ID requests, and repeated ingest log/exception overhead.

## Measurement Notes

`App RSS` means resident memory used by the Grimmory backend container. It is the number users usually notice in Docker. `DB RSS` is the MariaDB container memory and is reported separately where relevant. `Java heap after GC` is different again: a high Docker RSS spike does not always mean Java objects are still retained after the workload.

Representative user-facing measurements used the published Grimmory nightly image. JVM attribution used a debug JDK run of the same application jar so tools like JFR, NMT, and `jcmd` could explain where allocation pressure came from.

The main numbers below are summarized in MiB/GiB. The separate `evidence-log.md` keeps the technical run ledger and local raw artifact references.

## Findings At A Glance

| Priority | Finding | Measured Impact | Main Cause | Confidence |
|---:|---|---|---|---|
| 1 | Normal frontend startup loads the current full-books API | 50,000-book startup peaked around 2.32 GiB app RSS | Root/global full-book query calls `/api/v1/books?stripForListView=false` | Confirmed |
| 2 | Unbounded `/api/v1/books` is the biggest reproduced backend spike | 50,000-book single request: 0.44 GiB to 1.55 GiB app RSS; 4 concurrent: 4.17 GiB peak | Backend loads, maps, and serializes the whole library | Confirmed |
| 3 | `stripForListView=true` is not a backend-memory fix | 50,000-book payload fell from about 90 MiB to 35 MiB, but request still took about 19 s and did broad mapping | Stripping happens after full DTO mapping | Confirmed |
| 4 | Ingest and rescan cause transient spikes, not the main idle leak in these tests | 50,000-book import peaked around 2.03 GiB then idled around 0.44 GiB; no-change 50,000-book rescan peaked around 1.78 GiB then idled around 0.41 GiB | Full-library scan/rescan collections and import work | Confirmed |
| 5 | Folder ZIP downloads buffer full archives in memory | One 128 MiB folder download added about 522 MiB app RSS; three concurrent downloads added about 1.22 GiB | ZIP is built into a `ByteArrayOutputStream` before response | Confirmed |
| 6 | Recommendation updater is a sharp memory and CPU spike | 10,000-book task took about 190 s and peaked around 2.19 GiB app RSS | All-library embeddings, all-pairs comparisons, candidate lists, retained outputs | Confirmed |
| 7 | Batch-by-ID can recreate full-list pressure | 10,000 IDs returned about 18 MiB JSON and added about 242 MiB app RSS | Endpoint returns broad full `Book` DTOs for all requested IDs | Confirmed |
| 8 | Per-book logs and handled entity-graph exceptions waste import work | 50,000-book import emitted 50,000 repeated lines for each expected warning; 10,000-book debug ingest saw about 20,000 thrown exceptions | Expected conditions logged per book; hot repository path uses exception-control-flow | Confirmed overhead |

## 1. Frontend Startup Still Loads The Whole Library

**Conclusion:** A normal authenticated browser startup calls the current primary full-books API. This means users can hit the largest backend memory path just by opening the app.

**Measured impact:** With 50,000 books, browser startup observed one `/api/v1/books?stripForListView=false` request. Backend app RSS peaked around 2.32 GiB during startup. The browser itself reported about 61 MiB used JS heap in that 50,000-book startup run.

At 10,000 books, a retained browser heap snapshot after startup was about 90.8 MiB. The parsed heap contained repeated DTO strings such as the library and publisher names thousands of times, which is consistent with the browser retaining data from the full-list response.

**Why it happens:** The frontend currently depends on a global/root full-book query path. The app can instantiate `BookService`, which calls `/api/v1/books?stripForListView=false` and exposes a full `Book[]`.

**What to do:** The current primary book data path needs to become bounded and list/detail-aware before large libraries will be comfortable. Normal startup should not require loading every full book DTO into the backend response and frontend cache.

## 2. The Current Full-Books API Is The Main Backend Memory Spike

**Conclusion:** `/api/v1/books?stripForListView=false` is the clearest reproduced backend memory problem.

**Measured impact:** With 50,000 books:

- One full-list request returned about 90 MiB of JSON.
- Backend app RSS moved from about 0.44 GiB before the request to about 1.55 GiB afterward.
- Four overlapping full-list requests peaked at about 4.17 GiB app RSS.

With 10,000 books, four overlapping full-list requests already peaked around 2.41 GiB app RSS. The shape scales with library size and with request concurrency.

**Why it happens:** The backend endpoint returns an unbounded `List<Book>`. The service loads all books with metadata, maps them into broad DTOs, enriches progress, and then Jackson serializes the entire result. The debug JVM run attributed the allocation pressure to strings, byte arrays, object arrays, hash maps, Hibernate collection/entity structures, `BookMetadata` DTOs/builders, streams, and JSON serialization.

**What to do:** Treat the current full-list behavior as unsafe for normal large-library use. Any replacement needs to be feature-complete for the frontend's current book data needs, not just partially implemented. Until that exists, consider guardrails such as a maximum library size warning, a hard cap, or explicit admin/export semantics for full-library responses.

## 3. `stripForListView=true` Reduces Payload, Not Backend Work

**Conclusion:** `stripForListView=true` is useful for the network, but it is not a backend memory fix.

**Measured impact:** At 50,000 books, stripping reduced the response from about 90 MiB to about 35 MiB. That is a meaningful payload reduction. But the stripped request still took about 19 seconds and still ran through the same broad backend mapping path. At 10,000 books, the stripped request still caused a large backend RSS movement.

**Why it happens:** The backend maps full entities into full `Book` DTOs first, then strips fields for list view afterward. The expensive graph load and DTO allocation have already happened before the response is made smaller.

**What to do:** Replace strip-after-map with real list projections. The list endpoint should avoid loading and mapping fields it will not return. Keep detail DTOs for detail pages.

## 4. Ingest And Rescan Are Expensive But Mostly Transient In These Runs

**Conclusion:** Large imports and rescans create real peaks, but the tested paths did not behave like the main idle-memory leak.

**Measured impact:** A 50,000-book import peaked around 2.03 GiB app RSS and later idled around 0.44 GiB app RSS. The MariaDB sidecar peaked around 0.43 GiB in the same import. A no-change rescan of the 50,000-book library peaked around 1.78 GiB app RSS and later idled around 0.41 GiB.

**Why it happens:** Scan/rescan code builds multiple library-wide views: discovered files, existing books, additional files, new files, deleted/restored candidates, and grouped file state. That creates real transient pressure while work is in progress.

**What to do:** Keep optimizing scan/rescan, but rank it below the full-list endpoint for immediate RAM reduction. The likely wins are batching discovery/grouping, reducing simultaneous full-library collections, and adding phase-level memory instrumentation for future rescan work.

## 5. Folder ZIP Downloads Buffer Archives In Memory

**Conclusion:** Folder download endpoints are a direct, high-confidence transient memory bug.

**Measured impact:** A synthetic 128 MiB folder audiobook downloaded through `/download` moved app RSS from about 0.62 GiB to about 1.13 GiB. That is about 522 MiB extra RSS for one request. The comparable streaming `/download-all` path moved app RSS by only about 4 MiB.

Three concurrent buffered folder downloads of the same 128 MiB folder peaked around 1.69 GiB app RSS, an increase of about 1.22 GiB from the pre-download sample. The streaming control stayed flat.

The additional-file folder download path showed the same pattern: a 128 MiB additional folder download peaked around 0.90 GiB app RSS and dropped back afterward.

**Why it happens:** Folder ZIP code builds the ZIP into a `ByteArrayOutputStream`, converts it to a byte array, wraps it in a `ByteArrayResource`, and only then returns it. That keeps the generated archive in memory.

**What to do:** Stream folder ZIP responses directly to the HTTP response output stream, like the flatter `/download-all` control. Add size and concurrency guardrails for large media downloads.

## 6. Recommendation Updates Are A Real All-Library Spike

**Conclusion:** The recommendation updater is both CPU-expensive and memory-expensive.

**Measured impact:** The exact-image task completed at 1,000, 2,000, 5,000, and 10,000 books, but every run produced a sharp backend RSS spike above 2 GiB. At 10,000 books the task took about 190 seconds and peaked around 2.19 GiB app RSS. Fifteen seconds after the 10,000-book task, app RSS was still around 1.19 GiB. A debug JDK run at 2,000 books showed post-GC Java heap dropping back near baseline, so much of the spike is transient allocation/committed heap rather than proven retained heap.

**Why it happens:** The task keeps all embeddings in memory, keeps series-name maps, compares each book against every other book, creates candidate lists, sorts candidates, and retains recommendation outputs before batch saving.

**What to do:** Avoid materializing and sorting all candidates for each target. Keep only top-K candidates while scanning, use an index or approximate nearest-neighbor approach for larger libraries, and persist outputs per batch instead of retaining all results until the end.

## 7. Batch-By-ID Can Recreate Full-List Pressure

**Conclusion:** Even after the main full-library response is fixed, clients could recreate the same pressure by asking the batch endpoint for thousands of full books at once.

**Measured impact:** Against a 50,000-book database, a 10,000-ID batch request returned about 18 MiB of JSON and moved app RSS from about 0.56 GiB to about 0.79 GiB. A 50,000-ID request failed with HTTP 400 because the query string was too large. That is an incidental transport limit, not an intentional application cap.

**Why it happens:** `/api/v1/books/batch` returns broad full `Book` DTOs for all accepted IDs. It uses a metadata-rich fetch path similar in shape to the full-list endpoint.

**What to do:** Add explicit server-side caps. If this endpoint remains, return narrow DTOs or require bounded request sizes. Do not rely on URL length as the only guardrail.

## 8. Per-Book Logs And Handled Exceptions Add Import Overhead

**Conclusion:** The import path does avoidable work per book. It is more clearly CPU/log/allocation overhead than retained idle memory, but it is real.

**Measured impact:** The 50,000-book import emitted 50,000 `Processing file` lines, 50,000 `TOC_INVALID` lines, and 50,000 `No cover image found` lines. The debug 10,000-book ingest recorded about 20,000 thrown exceptions, including one handled dynamic entity-graph lookup failure per imported book.

**Why it happens:** Expected missing cover/TOC conditions are logged per book in the benchmark fixture. A hot repository path also uses a dynamic entity graph lookup path that throws and handles `No EntityGraph...` while resolving metadata.

**What to do:** Aggregate or sample expected import warnings during bulk imports. Avoid the dynamic entity-graph exception path on hot per-book repository calls.

## Recommended Fix Order

1. Make the current primary book data path bounded and feature-complete for the frontend's real needs.
2. Replace strip-after-map list behavior with real list/detail DTO separation or projections.
3. Add guardrails to unbounded full-library responses and large batch-by-ID shapes.
4. Stream folder ZIP downloads instead of buffering generated archives in memory.
5. Rework the recommendation updater so it does not keep all embeddings, all candidates, and all outputs in memory at once.
6. Reduce per-book import log noise and the repeated entity-graph exception-control-flow.

## Outstanding Untested Memory Areas

These areas still need direct runtime memory verification before they should be treated as confirmed memory findings:

- metadata refresh and review jobs;
- archive entry reads;
- EPUB reader content and CFI paths;
- image, PDF, and comic processing;
- bookdrop and watcher queues;
- duplicate detection;
- sidecar bulk import/export;
- startup backfills;
- shared executor contention;
- websocket import amplification with multiple browsers or slow clients;
- JVM/container accounting under explicit memory limits.
