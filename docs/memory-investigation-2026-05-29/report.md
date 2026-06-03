# Grimmory Memory Diagnosis - 2026-05-29

## High Level Summary

The largest verified memory problem is the current primary full-library books API. This is the main way the frontend gets book information today, and it loads the whole library during normal authenticated startup.

With 50,000 books, one request to `/api/v1/books?stripForListView=false` returned about 90 MiB of JSON and moved backend container memory from about 0.44 GiB to about 1.55 GiB. Four overlapping full-list requests peaked at about 4.17 GiB.

The `stripForListView=true` flag reduces network payload size, but it does not solve backend memory. The backend still loads and maps the broad full-book object graph first, then strips fields afterward.

Ingest, rescan, and startup backfills are real memory spikes, but the tested paths looked mostly transient rather than idle leaks. A 50,000-book import peaked around 2.03 GiB backend RSS and later returned to about 0.44 GiB. A current-nightly 10,000-book startup-backfill restart peaked around 2.01 GiB and later dropped under 1 GiB.

Other verified memory or allocation pressure points are folder ZIP downloads, recommendation and metadata bulk tasks, large batch-by-ID requests, and repeated ingest log/exception overhead.

Explicit Docker memory limits changed the picture a lot. The current nightly imported 10,000 books under 2 GiB, 1 GiB, 512 MiB, 384 MiB, and even 320 MiB app-container limits. The 256 MiB run did not become healthy in time. So some high average/idle-looking Docker RSS is JVM/container sizing behavior, but that does not make the unbounded full-books API safe.

A dedicated 50,000-book no-browser idle run did not show a retained multi-GB backend leak. The exact nightly briefly reached about 1.56 GiB app container memory right after startup, then settled to about 0.375 GiB after 30 minutes. A debug-JDK run tied the early spike to Java heap commitment during startup: about 1,016 MiB heap used at ready, dropping to about 101 MiB used after idle. The same 50,000-book idle workload also booted under a 512 MiB app limit and settled around 0.383 GiB. MariaDB by itself sat around 0.13 GiB.

A dedicated idle tuning pass tested lower initial heap and soft-heap targets against three requirements: start small while idle, grow during real work, and hand memory back quickly afterward. `SoftMaxHeapSize=256m/384m` reduced full-list peak RSS from about 2.11 GiB to about 1.36-1.40 GiB, but failed the return-to-idle requirement. A debug-JDK run showed only about 116 MiB heap used after the browser workload while 856-1,084 MiB heap remained committed, even after explicit GC. A heap-shrink variant still ended around 1.09 GiB after 10 minutes.

The important follow-up finding is that G1's periodic idle heap shrinking directly targets this problem. The first proof was an aggressive periodic full-GC profile, but the better tuned candidate is now G1 periodic concurrent cleanup with `MaxHeapFreeRatio=10`. In two exact-nightly 50K browser runs, that profile returned to about 0.449-0.453 GiB final idle with zero full-GC pauses. This follows JVM guidance better than forcing periodic full GC, and it is no longer correct to say the only answer is process recycling.

A browser opening the huge library is a separate culprit. In the 50,000-book browser run, `/all-books` made one `/api/v1/books?stripForListView=false` request that took about 25.6 seconds, pushed backend app memory to about 2.16 GiB, and left a retained Chromium heap snapshot with 2.93 million nodes and repeated book-list strings. With three browser clients opening the same route two seconds apart, backend app memory peaked at about 3.38 GiB and then settled back to about 0.55 GiB after the clients closed and the post-browser idle window completed.

## Measurement Notes

`App RSS` means resident memory used by the Grimmory backend container. It is the number users usually notice in Docker. `DB RSS` is the MariaDB container memory and is reported separately where relevant. `Java heap after GC` is different again: a high Docker RSS spike does not always mean Java objects are still retained after the workload.

Representative user-facing measurements used the published Grimmory nightly image. JVM attribution used a debug JDK run of the same application jar so tools like JFR, NMT, and `jcmd` could explain where allocation pressure came from.

The main numbers below are summarized in MiB/GiB.

## Findings At A Glance

| Priority | Finding | Measured Impact | Main Cause | Confidence |
|---:|---|---|---|---|
| 1 | Normal frontend startup loads the current full-books API | One 50,000-book browser startup peaked around 2.16-2.32 GiB app RSS; three clients peaked around 3.38 GiB | Root/global full-book query calls `/api/v1/books?stripForListView=false` | Confirmed |
| 2 | Unbounded `/api/v1/books` is the biggest reproduced backend spike | 50,000-book single request: 0.44 GiB to 1.55 GiB app RSS; 4 concurrent: 4.17 GiB peak | Backend loads, maps, and serializes the whole library | Confirmed |
| 3 | `stripForListView=true` is not a backend-memory fix | 50,000-book payload fell from about 90 MiB to 35 MiB, but request still took about 19 s and did broad mapping | Stripping happens after full DTO mapping | Confirmed |
| 4 | Ingest, rescan, and startup backfills cause transient spikes | 50,000-book import peaked around 2.03 GiB; current-nightly 10,000-book startup backfills peaked around 2.01 GiB | Full-library scan/import/backfill collections and per-book processing | Confirmed |
| 5 | Docker/JVM sizing strongly changes RSS | 10,000-book import passed at app limits from 2 GiB down to 320 MiB; 256 MiB did not become healthy | JVM sizes heap/native memory from available cgroup memory | Confirmed |
| 6 | Metadata and recommendation bulk tasks are all-library spikes | Metadata apply peaked around 2.17 GiB; recommendation plus metadata rescan peaked around 2.53 GiB | Library-wide metadata/recommendation passes | Confirmed |
| 7 | Folder ZIP downloads buffer full archives in memory | One 128 MiB folder download added about 522 MiB app RSS; three concurrent downloads added about 1.22 GiB | ZIP is built into a `ByteArrayOutputStream` before response | Confirmed |
| 8 | Batch-by-ID can recreate full-list pressure | 10,000 IDs returned about 18 MiB JSON and added about 242 MiB app RSS | Endpoint returns broad full `Book` DTOs for all requested IDs | Confirmed |
| 9 | Per-book logs and handled entity-graph exceptions waste import work | 50,000-book import emitted 50,000 repeated lines for each expected warning; 10,000-book debug ingest saw about 20,000 thrown exceptions | Expected conditions logged per book; hot repository path uses exception-control-flow | Confirmed overhead |

## 1. Frontend Startup Still Loads The Whole Library

**Conclusion:** A normal authenticated browser startup calls the current primary full-books API. This means users can hit the largest backend memory path just by opening the app.

**Measured impact:** With 50,000 books, browser startup observed one `/api/v1/books?stripForListView=false` request. In the dedicated 50,000-book browser run, that request took about 25.6 seconds and backend app memory peaked around 2.16 GiB. An earlier browser startup run saw a similar peak around 2.32 GiB. In a three-browser run against the same 50,000-book DB, each client made one full-books request, the requests took about 26-28 seconds, and backend app memory peaked around 3.38 GiB before settling to about 0.55 GiB after the clients closed.

At 50,000 books, the retained Chromium heap snapshot after browser GC was about 195 MiB on disk and contained 2.93 million nodes. The parsed heap included 1.2 million string nodes, 679,950 object nodes, 324,174 array objects, and repeated DTO strings such as `Verification Library` 50,002 times and `LoadTest Press` 50,000 times. At 10,000 books, the comparable retained browser heap snapshot was about 90.8 MiB.

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

## 4. Ingest, Rescan, And Startup Backfills Are Transient Spikes

**Conclusion:** Large imports, rescans, and startup backfills create real memory peaks. In these runs they mostly dropped after the work finished, so they are not the same problem as the always-available full-books API.

**Measured impact:** A 50,000-book import peaked around 2.03 GiB app RSS and later idled around 0.44 GiB app RSS. The MariaDB sidecar peaked around 0.43 GiB in the same import. A no-change rescan of the 50,000-book library peaked around 1.78 GiB app RSS and later idled around 0.41 GiB.

On the current nightly, a 10,000-book fresh import peaked around 2.02 GiB app RSS. A restart that forced startup backfills over the same 10,000-book library peaked around 2.01 GiB and then dropped to about 0.90 GiB idle afterward. The backfill logs showed 10,000-book passes for metadata scores, file hashes, search text, and cover hashes.

Sidecar export/import and duplicate detection also moved backend RSS upward in 10,000-book runs, but they were smaller than ingest, startup backfills, metadata tasks, recommendation work, and the full-books API.

**Why it happens:** Scan/rescan/backfill code builds or touches library-wide views: discovered files, existing books, additional files, new files, deleted/restored candidates, grouped file state, hashes, metadata scores, search text, and cover hashes. That creates real transient pressure while work is in progress.

**What to do:** Keep optimizing scan/rescan/backfill, but rank it below the full-list endpoint for immediate RAM reduction. The likely wins are batching discovery/grouping, reducing simultaneous full-library collections, and adding phase-level memory instrumentation for future rescan and backfill work.

## 5. Docker Memory Limits Prove The JVM Can Run Much Smaller

**Conclusion:** The uncapped container uses much more memory than the 10,000-book ingest path strictly needs. That makes average Docker RSS look worse than it has to be, although it does not remove the unbounded API problems.

**Measured impact:** With an explicit app-container memory limit, the current nightly completed the same 10,000-book import at 2 GiB, 1 GiB, 512 MiB, 384 MiB, and 320 MiB. Peak app RSS fell from about 2.02 GiB uncapped to about 0.66 GiB at a 2 GiB limit, about 0.50 GiB at a 512 MiB limit, and about 0.31 GiB at a 320 MiB limit. The 256 MiB run did not become healthy within the startup window.

**Why it happens:** The production image uses JVM container-aware sizing. When the container is uncapped, the JVM is allowed to commit and retain much more memory. When the container is capped, the JVM sizes itself down and GC behavior changes accordingly.

**What to do:** Document realistic memory-limit guidance for self-hosters and consider safer default JVM/container sizing. This is a practical mitigation for average RSS, not a replacement for bounding the full-books API and bulk endpoints.

## 6. Metadata And Recommendation Tasks Are All-Library Spikes

**Conclusion:** Bulk metadata and recommendation tasks can push the backend into the same multi-gigabyte range as ingest.

**Measured impact:** A 10,000-book metadata apply task peaked around 2.17 GiB app RSS. Metadata review was manually stopped after 3,379 proposal rows, but while it was still running it repeatedly cycled up to about 1.71 GiB app RSS.

The recommendation updater at 10,000 books took about 190 seconds and peaked around 2.04 GiB app RSS. Running recommendation work at the same time as a library metadata rescan peaked around 2.53 GiB app RSS.

**Why it happens:** These paths perform library-wide passes and keep large intermediate structures: metadata proposal/review state, embeddings, series-name maps, all-pairs recommendation comparisons, candidate lists, and retained recommendation outputs.

**What to do:** Batch metadata apply/review work, avoid keeping all proposal/output state in memory, and make recommendation calculation top-K/streaming rather than all-candidates/all-outputs. Avoid overlapping recommendation and metadata-rescan work on large libraries unless the scheduler can bound memory.

## 7. Folder ZIP Downloads Buffer Archives In Memory

**Conclusion:** Folder download endpoints are a direct, high-confidence transient memory bug.

**Measured impact:** A synthetic 128 MiB folder audiobook downloaded through `/download` moved app RSS from about 0.62 GiB to about 1.13 GiB. That is about 522 MiB extra RSS for one request. The comparable streaming `/download-all` path moved app RSS by only about 4 MiB.

Three concurrent buffered folder downloads of the same 128 MiB folder peaked around 1.69 GiB app RSS, an increase of about 1.22 GiB from the pre-download sample. The streaming control stayed flat.

The additional-file folder download path showed the same pattern: a 128 MiB additional folder download peaked around 0.90 GiB app RSS and dropped back afterward.

**Why it happens:** Folder ZIP code builds the ZIP into a `ByteArrayOutputStream`, converts it to a byte array, wraps it in a `ByteArrayResource`, and only then returns it. That keeps the generated archive in memory.

**What to do:** Stream folder ZIP responses directly to the HTTP response output stream, like the flatter `/download-all` control. Add size and concurrency guardrails for large media downloads.

## 8. Batch-By-ID Can Recreate Full-List Pressure

**Conclusion:** Even after the main full-library response is fixed, clients could recreate the same pressure by asking the batch endpoint for thousands of full books at once.

**Measured impact:** Against a 50,000-book database, a 10,000-ID batch request returned about 18 MiB of JSON and moved app RSS from about 0.56 GiB to about 0.79 GiB. A 50,000-ID request failed with HTTP 400 because the query string was too large. That is an incidental transport limit, not an intentional application cap.

**Why it happens:** `/api/v1/books/batch` returns broad full `Book` DTOs for all accepted IDs. It uses a metadata-rich fetch path similar in shape to the full-list endpoint.

**What to do:** Add explicit server-side caps. If this endpoint remains, return narrow DTOs or require bounded request sizes. Do not rely on URL length as the only guardrail.

## 9. Per-Book Logs And Handled Exceptions Add Import Overhead

**Conclusion:** The import path does avoidable work per book. It is more clearly CPU/log/allocation overhead than retained idle memory, but it is real.

**Measured impact:** The 50,000-book import emitted 50,000 `Processing file` lines, 50,000 `TOC_INVALID` lines, and 50,000 `No cover image found` lines. The debug 10,000-book ingest recorded about 20,000 thrown exceptions, including one handled dynamic entity-graph lookup failure per imported book.

**Why it happens:** Expected missing cover/TOC conditions are logged per book in the benchmark fixture. A hot repository path also uses a dynamic entity graph lookup path that throws and handles `No EntityGraph...` while resolving metadata.

**What to do:** Aggregate or sample expected import warnings during bulk imports. Avoid the dynamic entity-graph exception path on hot per-book repository calls.

## Huge-Library Idle Baseline

**Conclusion:** A 50,000-book library at rest is not, by itself, a reproduced multi-GB retained backend memory leak. Opening the browser on the huge library is different because it triggers the full-books API.

**Measured impact:** In the exact nightly no-browser idle run, the backend app container peaked at about 1.56 GiB immediately after startup and then fell to about 0.375 GiB by the end of a 30-minute idle window. MariaDB ended around 0.152 GiB. No browser was connected, the DB count was verified at 50,000 books, and the containers had no OOM or restart.

The debug-JDK companion run explains the shape. At ready, Java heap was about 1,016 MiB committed and 1,015 MiB used. After idle, heap was about 164 MiB committed and 101 MiB used; after forced GC it was about 136 MiB committed and 133 MiB used. Post-GC class histograms were not dominated by retained book entities or full-book DTOs.

With a 512 MiB app-container limit, the exact nightly still booted the same 50,000-book DB, peaked around 0.495 GiB, and settled around 0.383 GiB. MariaDB alone sat around 0.131 GiB and peaked around 0.134 GiB.

When one browser opened `/all-books` against the same 50,000-book DB, backend app memory peaked around 2.16 GiB while serving the full-list request, then dropped back to about 0.41 GiB after the browser closed and the post-browser idle window completed. The browser retained a large object/string graph from the full-list response.

When three browsers opened `/all-books` two seconds apart, backend app memory peaked around 3.38 GiB and then settled to about 0.55 GiB after the clients closed and the post-browser idle window completed. Each client made exactly one `/api/v1/books?stripForListView=false` request, and those requests took about 26-28 seconds.

**Why it happens:** The high early number is primarily JVM startup/heap commitment and uncommit behavior. The huge library can make startup and full-library paths expensive, but the verified no-browser idle state did not retain all 50,000 books in heap.

The idle tuning pass then tested whether Grimmory could combine low startup/peak memory with fast return-to-idle. `-Xms64m` with `MaxRAMPercentage=60.0` kept the heap ceiling elastic and returned to about 0.43 GiB after the 50,000-book browser full-list request. `SoftMaxHeapSize=384m` lowered that request's peak to about 1.36-1.40 GiB, but it did not return memory promptly afterward: after 10 minutes idle, exact-image RSS stayed around 0.88 GiB; in a debug-JDK run with explicit GC it still stayed around 1.10 GiB. JVM attribution showed the cause was committed Java heap, not live book data: after the browser closed, heap was about 116 MiB used but 1,084 MiB committed; after 10 minutes idle, 116 MiB used but 896 MiB committed; after explicit GC plus a 60-second settle, 116 MiB used but 856 MiB committed. Adding `MaxHeapFreeRatio=10`, `MinHeapFreeRatio=5`, and `-XX:-ShrinkHeapInSteps` did not fix it; that exact-image variant still ended around 1.09 GiB after 10 minutes.

ZGC was tested as an alternate elastic heap candidate, but it failed the minimum-idle requirement in this app/profile: pre-browser RSS was already about 2.36 GiB. A same-JVM Shenandoah forced-full-GC candidate also failed, ending around 1.31 GiB. G1 periodic full-GC shrinking was the first candidate that matched the desired return-to-idle shape, but GC logs showed that forcing periodic full GC creates repeated stop-the-world pauses. The tuned follow-up profile kept G1 periodic cleanup concurrent and tightened `MaxHeapFreeRatio` to `10`; it returned to about 0.449-0.453 GiB final idle in two runs with no full-GC pauses. Peak stayed within normal bounds and is treated only as a guardrail for this idle-memory tuning.

**What to do:** Do not make `SoftMaxHeapSize` the product default, and do not default V55's forced periodic full-GC mode. Treat the V59/V61 G1 periodic concurrent profile as the leading JVM candidate for Grimmory's desired idle behavior, but validate it beyond the browser path before shipping it: no-browser idle, import, rescan, startup backfills, metadata/recommendation tasks, and latency impact. Keep idle/startup measurements separate from full-list/API/bulk-task measurements. Do not treat a high first-minute Docker number as proof of a retained idle leak, but do treat startup spikes, browser startup full-list fetches, and unbounded full-library endpoints as real memory problems.

## Recommended Fix Order

1. Make the current primary book data path bounded and feature-complete for the frontend's real needs.
2. Replace strip-after-map list behavior with real list/detail DTO separation or projections.
3. Add guardrails to unbounded full-library responses and large batch-by-ID shapes.
4. Validate the V59/V61 G1 periodic concurrent profile as the JVM default candidate for the desired "minimum idle, grow, return quickly" behavior; do not default `SoftMaxHeapSize` or forced periodic full GC based on the current evidence.
5. Stream folder ZIP downloads instead of buffering generated archives in memory.
6. Batch startup backfills, metadata apply/review, and recommendation work so they do not keep library-wide state in memory at once.
7. Reduce per-book import log noise and the repeated entity-graph exception-control-flow.
