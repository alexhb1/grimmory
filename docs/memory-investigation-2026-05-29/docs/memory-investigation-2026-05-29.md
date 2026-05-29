# Grimmory Memory Investigation - 2026-05-29

## Scope

- Repository: `grimmory-tools/grimmory`
- Branch: `develop`
- Starting commit: `e4bf4c5659b1577a99035e4aa9567f9c45a67120`
- External benchmark: `kevin-s722/book-apps-benchmark`
- Focus: backend/container idle and average RAM, ingest processing, books endpoint payload behavior, frontend pagination pressure, and Java heap/native/runtime contributors.

## Ground Rules

- Evidence first: measure or inspect before making claims.
- Prefer root `Justfile` commands for local validation.
- Do not write GitHub comments, issues, PRs, or push.
- Keep debug artifacts clearly named and remove transient instrumentation unless deliberately retained here.

## Running Log

### 2026-05-29 09:22 Europe/London - Investigation started

- Confirmed local repo is on `develop` and clean.
- Confirmed GitHub metadata with `gh repo view`:
  - `grimmory-tools/grimmory`, default branch `develop`.
  - `kevin-s722/book-apps-benchmark`, default branch `main`.
- Loaded the project command surface from the root and backend `Justfile`.

### 2026-05-29 09:40 Europe/London - Nightly artifact under debug JVM

- Pulled the current nightly image:
  - Image: `ghcr.io/grimmory-tools/grimmory:nightly`
  - Digest: `sha256:7e9df2e3729e64ae6e1e1569e67fc8f7cfa4c4046edf43182737346b5fd6f59d`
  - Version label: `nightly-20260529-e4bf4c56`
  - Revision label: `e4bf4c5659b1577a99035e4aa9567f9c45a67120`
- Extracted `/app/app.jar` from that nightly image and ran it in `eclipse-temurin:25-jdk-alpine` with the same runtime flags plus `-XX:NativeMemoryTracking=summary`.
- Connected the debug JVM to the existing local MariaDB and mounted the existing local data/books/bookdrop volumes.
- Debug endpoint is running on `http://localhost:6061`.

## Findings

No findings yet. Baselines and probes are being established first.

## Measurements

### Current dev stack baseline

- Live containers at start:
  - `grimmory-backend-1`: `951.1 MiB` container memory, `167` PIDs.
  - `grimmory-backend_db-1`: `137.4 MiB`.
  - `grimmory-frontend-1`: `2.129 GiB`.
- Backend dev container process split:
  - PID 1 Gradle wrapper JVM: about `89 MiB` RSS.
  - PID 45 Gradle daemon JVM: about `496 MiB` RSS.
  - PID 123 Spring Boot app JVM: about `395-407 MiB` RSS in `/proc`, `75` threads.
- Spring Boot app JVM heap before endpoint probing:
  - Shenandoah max heap: `15,856 MiB` because `MaxRAMPercentage=60.0` against the host/container limit.
  - Committed heap: `236 MiB`.
  - Used heap: `132 MiB`.
- Native memory tracking is not enabled in the live dev container, so app JVM native breakdown needs a restart or separate production-style container with `-XX:NativeMemoryTracking=summary/detail`.

### Current data shape

- Database rows:
  - `book`: `1506`
  - `book_file`: `1507`
  - `book_metadata`: `1506`
  - `library`: `3`
  - `users`: `2`
- Largest DB tables by data+index size:
  - `book_metadata`: about `2.80 MiB`
  - `book`: about `1.80 MiB`
  - `audit_log`: about `0.56 MiB`
  - `book_file`: about `0.47 MiB`
  - `category`: about `0.45 MiB`

### Books endpoint payload measurements

- Request used by the frontend today: `GET /api/v1/books?stripForListView=false`.
- With 1,506 books:
  - Full unpaginated, unstripped response: `3,171,715` bytes raw, `227,715` bytes gzip, `0.400 s`.
  - Full unpaginated, stripped response: `1,425,460` bytes raw, `185,951` bytes gzip, `0.382 s`.
  - Page 0, size 50 via `GET /api/v1/books/page?page=0&size=50&sort=metadata.title,asc`: `48,117` bytes raw, `7,701` bytes gzip, `0.100 s`.
  - All 31 pages of size 50 fetched serially: `1,427,960` bytes raw total, `0.740 s` cumulative request time.
- Per-book raw payload:
  - Full unpaginated, unstripped: about `2,106` bytes/book.
  - Full unpaginated, stripped: about `947` bytes/book.
  - Paged stripped endpoint: about `962` bytes/book including page wrapper overhead.
- Initial-page impact:
  - Current frontend load vs first page: `3,171,715 / 48,117 = 65.9x` more raw JSON on initial book-list load.
  - Current frontend load vs first page gzip: `227,715 / 7,701 = 29.6x`.
  - If a user eventually loaded all pages, the paginated stripped endpoint total is still about `55%` smaller raw than the current unstripped one-shot request.
- Payload composition of the current unstripped response:
  - `metadata`: about `2,195,964` bytes.
  - `primaryFile`: about `445,460` bytes.
  - `shelves`: about `169,533` bytes.
  - Metadata `*Locked` flags: `63,252` boolean fields, about `1,630,914` raw JSON bytes by key+value estimate.
- Heap movement during endpoint probing:
  - Before endpoint probes: app heap about `132 MiB` used, `236 MiB` committed.
  - After one full unpaginated request plus stripped and page probes: app heap about `319 MiB` used, `320 MiB` committed.
  - After explicit `jcmd GC.run`: app heap returned to about `139 MiB` used, `140 MiB` committed.
  - After serially fetching all 31 pages: app heap about `219 MiB` used, `220 MiB` committed before explicit GC.

### External benchmark reading

- Cloned `kevin-s722/book-apps-benchmark` locally at `/home/alex/Projects/book-apps-benchmark`.
- The benchmark generates very small synthetic EPUB 2.0 files, about `~1.8 KiB` each according to its README, with one OPF file, one NCX file, and one XHTML file.
- The benchmark monitors Docker `stats` at intervals and records app container memory plus optional DB sidecar memory. For Grimmory, the README's idle and peak tables include the MariaDB sidecar, but the individual report's idle RAM card is app-only.
- Grimmory reference results from CSV:
  - `10K`: duration `~411 s` recorded, report ingest time `04:51`; peak app `2312 MiB`, peak DB `193 MiB`, peak total `2503 MiB`; idle app avg `545 MiB`, idle DB avg `191 MiB`, idle total avg `736 MiB`.
  - `50K`: duration `~1122 s`, report ingest time `16:41`; peak app `2907 MiB`, peak DB `247 MiB`, peak total `3153 MiB`; idle app avg `858 MiB`, idle DB avg `246 MiB`, idle total avg `1104 MiB`.
  - `100K`: duration `~3050 s`, report ingest time `48:50`; peak app `3725 MiB`, peak DB `305 MiB`, peak total `4029 MiB`; idle app avg `1229 MiB`, idle DB avg `304 MiB`, idle total avg `1533 MiB`.
  - `150K`: duration `~5467 s`, report ingest time `01:29:06`; peak app `4654 MiB`, peak DB `374 MiB`, peak total `5015 MiB`; idle app avg `1604 MiB`, idle DB avg `374 MiB`, idle total avg `1978 MiB`.
- Interpretation: the post-ingest app-only idle slope in the benchmark is roughly `7-8 MiB per additional 1,000 books` from 10K through 150K, before considering MariaDB buffer/cache growth. This strongly suggests retained application state or JVM committed memory scales with imported library size, not only transient ingest spikes.

### Nightly debug JVM baseline

- Artifact under test: `ghcr.io/grimmory-tools/grimmory@sha256:7e9df2e3729e64ae6e1e1569e67fc8f7cfa4c4046edf43182737346b5fd6f59d`, extracted jar, Java `25.0.3`, same JVM flags as the image plus NMT.
- Immediately after startup, before manual GC:
  - Container RSS: about `1.24 GiB`, `57` PIDs.
  - NMT total committed: `1,345 MiB`.
  - Java heap committed: `1,060 MiB`, heap used: `1,059 MiB`.
  - Java heap peak committed during startup: `2,744 MiB`.
  - Non-heap committed was comparatively small: class/metaspace about `105 MiB`, code about `33 MiB`, threads about `4-5 MiB`, NMT overhead about `10 MiB`.
- After explicit `jcmd 1 GC.run` and waiting for Shenandoah uncommit:
  - Container RSS: about `380 MiB`.
  - NMT total committed: `397 MiB`.
  - Java heap committed: `156 MiB`, heap used: `154 MiB`.
  - Metaspace committed: `105 MiB`.
  - Class space committed: `29 MiB`.
  - Code committed: `30 MiB`.
  - GC committed: `12 MiB`.
  - Thread committed: `5 MiB` across `56` threads.
- Interpretation: on this 1,506-book library, the high post-startup RSS was mostly committed heap that Shenandoah can return after a collection, not mostly native libraries, thread stacks, or permanent retained Java objects. The real post-GC live baseline is currently around `154 MiB` heap plus about `240 MiB` non-heap/native/runtime commitment.
- The top live heap classes after GC were framework/runtime-heavy rather than book-heavy:
  - byte arrays: `16.9 MiB`
  - Hibernate ANTLR `ATNConfig`: `8.8 MiB`
  - object arrays: `5.7 MiB`
  - `String`: `4.9 MiB`
  - `Method`: `4.2 MiB`
  - `Class`: `3.2 MiB`

### Books endpoint JVM profiling

- Workload: nightly debug JVM, existing 1,506-book database, authenticated admin, `Accept-Encoding: identity`, 10 repeated requests per variant after an explicit GC.
- Thread allocation counters from `jcmd Thread.print -e` around the workload:
  - `GET /api/v1/books?stripForListView=false`
    - Response size per request: `3,171,715` bytes.
    - Average request time: `0.618 s`.
    - Java allocation over 10 requests: `571.195 MiB`, about `57.1 MiB/request`.
  - `GET /api/v1/books?stripForListView=true`
    - Response size per request: `1,425,460` bytes.
    - Average request time: `0.612 s`.
    - Java allocation over 10 requests: `570.152 MiB`, about `57.0 MiB/request`.
  - `GET /api/v1/books/page?page=0&size=50&sort=metadata.title,asc`
    - Response size per request: `48,117` bytes.
    - Average request time: `0.043 s`.
    - Java allocation over 10 requests: `30.051 MiB`, about `3.0 MiB/request`.
- Interpretation:
  - Pagination reduced backend per-request allocation by about `19x` for this library size (`57.1 MiB` to `3.0 MiB`) and response time by about `14x` (`0.618 s` to `0.043 s`).
  - `stripForListView=true` reduced network payload by about `55%`, but did not materially reduce backend allocations or response time in this run. The server still fetches/maps the same full 1,506-book result set before stripping DTO fields.
  - The current frontend path combines both avoidable costs: it calls the unpaginated endpoint and explicitly asks for `stripForListView=false`.
- Heap/RSS movement during JFR-guarded endpoint runs:
  - 10 current full unstripped requests grew container RSS from about `386.7 MiB` to `631.2 MiB`, with heap committed rising from `144 MiB` to `396 MiB`; after explicit GC it returned to about `396 MiB` RSS and `128 MiB` heap committed.
  - 10 page-size-50 requests grew RSS from about `398.2 MiB` to `430.9 MiB`, with heap committed rising from `144 MiB` to `232 MiB`; after explicit GC it returned to about `398.4 MiB` RSS and `144 MiB` heap committed.
- JFR directionally agrees with the code path:
  - Full-list hot methods include Hibernate entity/collection materialization, `BookMetadataEntity` enhanced accessor work, MapStruct mapper work, Jackson serialization, `HashMap` growth, and MariaDB row decoding.
  - Full-list allocation samples are dominated by byte arrays, `String`, object arrays, primitive arrays, Hibernate collection keys/entries, DTO builders, and virtual-thread stack chunks.
  - The paged endpoint has too few sampled allocation events for reliable class percentages, but the thread allocation diff and wall time are clear.

### Current nightly 10K ingest run

- Isolated run target: extracted jar from current `ghcr.io/grimmory-tools/grimmory:nightly` in a JDK container with `-XX:NativeMemoryTracking=summary`, separate clean `mariadb:11.4`, `8 GiB` app memory limit, benchmark-generated `books_10K` mounted read-only.
- Library creation request matched the benchmark's synthetic EPUB workload closely: one watched-off library, `organizationMode=BOOK_PER_FILE`, `metadataSource=EMBEDDED`, `allowedFormats=["EPUB"]`.
- A clean `jcmd 1 GC.run` was performed before creating the library so the ingest peak was not inflated by startup heap commitment.
- Result:
  - 10,000 books imported in about `97 s` from create-library request to `book_count=10000`.
  - Peak app cgroup memory during ingest: `1,107,124,224` bytes, about `1055.8 MiB`.
  - Peak DB cgroup memory during ingest: `184,680,448` bytes, about `176.1 MiB`.
  - Peak sampled heap committed: `656 MiB`.
  - Peak sampled heap used: `549 MiB`.
  - Peak sampled NMT total committed: `1,027 MiB`.
  - After 30 seconds idle: app cgroup `500,117,504` bytes, DB cgroup `184,041,472` bytes.
  - After explicit post-ingest GC: app cgroup still `500,117,504` bytes, heap committed/used `132/130 MiB`, NMT total committed `417 MiB`.
- This current-nightly run did not reproduce the external benchmark's `10K` peak app memory of `2312 MiB`. The idle total is in the same broad range (`~477 MiB` app plus `~176 MiB` DB locally, versus benchmark `~545 MiB` app plus `~191 MiB` DB), but the ingest peak is much lower on current nightly.
- Post-ingest DB shape:
  - `book`: `10000`
  - `book_file`: `10000`
  - `book_metadata`: `10000`
  - `author`: `812`
  - `category`: `20`
  - `book_metadata_author_mapping`: `10000`
  - `book_metadata_category_mapping`: `10000`
- Largest DB tables after 10K:
  - `book_file`: `4.25 MiB`
  - `book_metadata`: `3.38 MiB`
  - `book`: `2.53 MiB`
  - `book_metadata_author_mapping`: `1.17 MiB`
  - `book_metadata_category_mapping`: `0.67 MiB`
- Post-ingest live heap after GC is not dominated by imported books. The largest live classes remain framework/runtime-heavy: byte arrays `17.7 MiB`, Hibernate ANTLR `ATNConfig` `8.8 MiB`, object arrays `5.8 MiB`, strings `5.4 MiB`, reflection `Method` objects `4.5 MiB`, and `Class` objects `3.5 MiB`.
- Post-ingest NMT after GC:
  - Total committed: `417 MiB`.
  - Heap committed: `132 MiB`.
  - Metaspace committed/used: `118/116 MiB`.
  - Class committed: `34 MiB`.
  - Code committed: `38 MiB`.
  - Thread committed: `6 MiB` across `66` threads.
  - GC committed: `11 MiB`.
  - NMT/tracing overhead from the debug run accounts for about `26 MiB`, so production JRE memory should be slightly lower than this debug container for the same code and DB.

### Current nightly ingest JFR findings

- Clean V09 debug ingest artifact: `.memory-runs/run-20260529T124947Z-V09-debug-jdk-ingest-10k`.
- This run extracted the exact nightly app jar, ran it under `eclipse-temurin:25-jdk-alpine` with production-like JVM flags plus NMT/JFR, mounted libarchive support in the debug container, and imported the 10K benchmark fixture.
- The ingest JFR recorded `6,200` object allocation samples and `20,203` thrown exceptions over the 10K ingest.
- Exceptions by type:
  - `InvocationTargetException`: `10,002`.
  - `IllegalArgumentException`: `10,002`.
  - `ClassNotFoundException`: `257`.
  - `NoSuchMethodError`: `117`.
- The dominant application-path exception message was `No EntityGraph with given name 'BookEntity.findByIdWithBookFiles'` (`10,000` throws), originating from `org.hibernate.internal.AbstractSharedSessionContract.getEntityGraph(String)`.
- Parsed entity graph exception counts:
  - `BookEntity.findByIdWithBookFiles`: `10,000`.
  - `LibraryEntity.findByIdWithPaths`: `1`.
  - `BookEntity.findAllByLibraryIdForRescan`: `1`.
- Interpretation: Spring Data/Hibernate is throwing and catching a missing named-entity-graph exception nearly once per imported book for the dynamic `@EntityGraph(attributePaths=...)` repository method. This is probably not a functional bug, but it is real exception allocation/control-flow in the hot ingest path.
- The ingest logs produced exactly `10,000` `Processing file` INFO lines, `10,000` `TOC_INVALID` WARN lines from epub4j, and `10,000` `No cover image found in EPUB` WARN lines. The app log was `5.5 MB` / `30,242` lines. This is a large avoidable allocation and I/O surface for synthetic/no-cover EPUB libraries and likely hurts ingest CPU more than retained idle memory.
- Ingest allocation samples were dominated by transient file/XML/database work:
  - `byte[]`: `33.83%`
  - object arrays: `7.79%`
  - `char[]`: `6.40%`
  - `int[]`: `5.30%`
  - `String`: `3.25%`
  - `String[]`: `2.34%`
- Top allocation sites:
  - `InputStream.readNBytes(int)`: `8.4%`
  - `InputStream.transferTo(OutputStream)`: `5.2%`
  - `Arrays.copyOfRange(byte[],...)`: `4.8%`
  - MariaDB packet reads: `3.2%`
  - XML/DOM parser chunks: `2.6%`
  - `BufferedReader.<init>`: `3.0%`
  - `HashMap` nodes/resizes and `ArrayList` allocation also appear repeatedly.
- The cover path is visibly expensive for no-cover EPUBs: each file first calls epub4j lazy cover detection, emits a `TOC_INVALID` warning for the generated NCX, then falls back to container/OPF scanning before returning `null` and logging another warning.
- GC behavior during ingest looked healthy rather than leak-like: 30 Shenandoah cycles in the recording, with heap before GC around `595-602 MiB` later in the run and heap after GC around `139-161 MiB`; pauses were sub-millisecond. The peak is mostly transient allocation, not a growing live set.

### 10K books endpoint profiling

- Workload: same isolated current-nightly 10K database, authenticated admin, explicit GC before each allocation measurement.
- Thread allocation counters around request batches:
  - `GET /api/v1/books?stripForListView=false`, 3 requests:
    - Response size: `18,898,820` bytes/request raw.
    - Average wall time: `2.224 s/request`.
    - Allocation delta: `1,103,303,872` bytes total, about `350.7 MiB/request`.
    - Container memory rose from `~477 MiB` to `~1106 MiB` before GC.
  - `GET /api/v1/books?stripForListView=true`, 3 requests:
    - Response size: `7,408,820` bytes/request raw.
    - Average wall time: `1.855 s/request`.
    - Allocation delta: `1,074,023,856` bytes total, about `341.4 MiB/request`.
    - Container memory rose from `~482 MiB` to `~1044 MiB` before GC.
  - `GET /api/v1/books/page?page=0&size=50&sort=metadata.title,asc`, 10 requests:
    - Response size: `37,632` bytes/request raw.
    - Average wall time: `0.058 s/request`.
    - Allocation delta: `29,412,368` bytes total, about `2.8 MiB/request`.
    - Container memory rose from `~478 MiB` to `~508 MiB` before GC.
- At 10K, the current frontend-style unpaginated request allocates about `125x` more backend memory per request than the first page (`350.7 MiB` versus `2.8 MiB`) and takes about `39x` longer (`2.224 s` versus `0.058 s`).
- Transfer size at 10K:
  - Current frontend-style full unstripped response: `18.90 MiB` raw, `737,278` bytes gzip.
  - Full stripped response: `7.41 MiB` raw, `563,347` bytes gzip.
  - First page of 50: `37,632` bytes raw, `3,522` bytes gzip.
  - All 200 page-size-50 responses serially: `7,425,509` bytes raw, `703,724` bytes gzip, `10.45-10.70 s` cumulative transfer time.
- Interpretation:
  - Initial-load pagination replaces a `18.9 MiB` raw response with `37.6 KiB`, a `~502x` raw transfer reduction and `~209x` gzip transfer reduction for the first visible page.
  - If the frontend eventually fetched all 200 pages, the paged stripped endpoint would still be about `60.7%` smaller raw than the current unstripped one-shot response (`7.43 MiB` versus `18.90 MiB`), with similar gzip total once all page envelopes are counted.
  - As with the 1,506-book run, `stripForListView=true` saves network but barely saves backend allocation because the server still materializes and maps the whole result set first.

### v3.1.0 benchmark-artifact comparison

- The public benchmark compose file at `/home/alex/Projects/book-apps-benchmark/docker/grimmory/docker-compose.yml` points to `grimmory/grimmory:v3.1.0`, plus `lscr.io/linuxserver/mariadb:11.4.8`.
- `grimmory/grimmory:v3.1.0` was not pullable during this investigation. Docker Hub returned a repository/image access error.
- I used the matching available project artifact `ghcr.io/grimmory-tools/grimmory:v3.1.0`:
  - Image digest: `sha256:c83dcb59975c9a680ecdf84d60e7e5c9b05200818bab8794f4d84a7e008a549a`.
  - Image labels: version `v3.1.0`, revision `273be548277ce4048e3b54c024e2ef592480b738`.
  - Base image: `eclipse-temurin:25-jre-alpine`.
  - JVM flags matched the current runtime shape: Shenandoah, `InitialRAMPercentage=8.0`, `MaxRAMPercentage=60.0`, `ShenandoahUncommitDelay=30000`.
- GitHub release `v3.1.0` was published on `2026-05-15T00:01:49Z` and targets `main`.

### v3.1.0 JDK/NMT 10K ingest

- Target: extracted `/app/app.jar` from `ghcr.io/grimmory-tools/grimmory:v3.1.0`, run inside `eclipse-temurin:25-jdk-alpine` with `-XX:NativeMemoryTracking=summary` and an `8 GiB` app memory limit.
- Database: `lscr.io/linuxserver/mariadb:11.4.8`, matching the benchmark compose sidecar more closely than the current dev DB.
- Caveat: the debug JDK container did not include the exact app image's native libarchive setup, so the app logged `libarchive: NOT available`. The synthetic EPUB-only benchmark path should not depend on libarchive.
- Pre-ingest after explicit GC:
  - App cgroup memory: `428,949,504` bytes, about `409 MiB`.
  - DB cgroup memory: `276,086,784` bytes, about `263 MiB`.
  - Heap committed/used: about `120/119 MiB`.
  - NMT total committed: about `359 MiB`.
- 10K import result:
  - Import completed in roughly `83 s`.
  - Peak app cgroup memory: `1,107,836,928` bytes, about `1056 MiB`.
  - Peak DB cgroup memory: `397,299,712` bytes, about `379 MiB`.
  - Peak sampled heap committed: `668 MiB`.
  - Peak sampled heap used: `629 MiB`.
  - Peak sampled NMT total committed: `1009 MiB`.
  - Completed sample: app `849,252,352` bytes, DB `397,582,336` bytes.
  - 30-second idle sample: app `497,811,456` bytes, DB `397,422,592` bytes.
  - Post-GC sample: app `492,740,608` bytes, DB `397,283,328` bytes, heap committed/used `126/125 MiB`, NMT total committed `411 MiB`.
- This v3.1.0 JDK/NMT run also did not reproduce the public benchmark's `10K` app peak of `2312 MiB`.

### Exact v3.1.0 image 10K ingest

- Target: the actual `ghcr.io/grimmory-tools/grimmory:v3.1.0` image, not an extracted jar, plus `lscr.io/linuxserver/mariadb:11.4.8`.
- This run intentionally did not use NMT or `jcmd`, because the exact production image is a JRE image. It answers the "representative user image" question.
- Setup note: this run created an admin account with a temporary setup password before the user supplied `admin/admin123`. The password choice is not expected to affect memory. Future clean runs should use `admin/admin123`.
- Library request used the frontend-default-like payload shape:
  - `watch=false`.
  - `metadataSource=EMBEDDED`.
  - `organizationMode=BOOK_PER_FILE`.
  - `allowedFormats=[]`.
  - Full `formatPriority` list.
- Pre-create app memory was high at `1,126,912,000` bytes because this exact-image run had no forced pre-ingest GC and still carried startup committed heap.
- 10K import result:
  - Peak app cgroup memory: `1,108,316,160` bytes, about `1057 MiB`.
  - Peak DB cgroup memory: `397,037,568` bytes, about `379 MiB`.
  - Completed sample app memory: `857,792,512` bytes.
  - 30-second idle app memory: `466,403,328` bytes.
- Even with the exact GHCR v3.1.0 image and benchmark-sidecar MariaDB, pure API-driven ingest stayed near `1.06 GiB` peak app memory, not `2.3 GiB`.

### Benchmark CSV behavior versus local runs

- The benchmark monitor uses `docker stats --no-stream` and records the app container memory field directly. There is no hidden in-app memory formula.
- The reference `10K` CSV contains multiple app-memory spikes:
  - First sample: about `452 MiB`.
  - About `2165 MiB` at elapsed `~35 s`.
  - About `2215 MiB` at elapsed `~69 s`.
  - About `2238 MiB` at elapsed `~78 s`.
  - About `2257 MiB` at elapsed `~87 s`.
  - Peak about `2312 MiB` at elapsed `~111 s`.
  - Then it falls to about `1359 MiB`, and later to about `529 MiB`.
- Larger public runs show the same sawtooth pattern with peaks increasing by library size:
  - `50K`: app peak `2907 MiB`.
  - `100K`: app peak `3725 MiB`.
  - `150K`: app peak `4654 MiB`.
- Local current-nightly, v3.1.0 JDK/NMT, exact-image API, and exact-image browser runs all showed a much smaller 10K pure-ingest peak around `1.05-1.06 GiB`.
- Current best interpretation: the public `2.3 GiB` 10K peak is not explained by the current available GHCR v3.1.0 backend ingest path alone. Plausible remaining differences are:
  - The unavailable Docker Hub artifact may differ from the GHCR image.
  - The benchmark was manually UI-driven, so overlapping frontend requests or route transitions may have stacked on top of ingest in the recorded run.
  - Host/container memory ergonomics or Docker Desktop/platform details may have kept more Java heap committed at sample time.
  - A manual setting used during the public run may not be reflected in the benchmark repo defaults.

### Browser-driven exact-image run

- Target: exact `ghcr.io/grimmory-tools/grimmory:v3.1.0` image, benchmark-sidecar MariaDB, clean DB, browser login via Playwright, library creation from browser context, then navigation to `/library/1/books`.
- This run was designed to catch frontend-triggered requests and websocket/update behavior that a pure curl/API run would miss.
- Result:
  - Pre-create app memory: `437,833,728` bytes.
  - Peak app memory during import/browser hold: `1,100,296,192` bytes, about `1049 MiB`.
  - Peak DB memory: `397,963,264` bytes.
  - Book count reached `10,000` at about `81 s`.
  - App memory was about `1,078,968,320` bytes around completion, then dropped to about `608-612 MiB`, and settled around `482 MiB` by about `114 s`.
- Captured browser network showed two legacy `GET /api/v1/books?stripForListView=false` calls near initial application startup. It did not show large app-books/filter-options traffic after the import.
- This did not reproduce the public `2.3 GiB` peak either. It does confirm, however, that the legacy full-books query is reachable from normal authenticated UI startup.

### Exact-image 10K endpoint and concurrency pressure

- After a 10K exact-image import and idle period, serial legacy full-list requests behaved as follows:
  - Before requests: app `475,111,424` bytes.
  - After full request 1: app `695,492,608` bytes, response `19,018,820` bytes, `2.52 s`.
  - After full request 2: app `1,103,691,776` bytes, response `19,018,820` bytes, `2.32 s`.
  - After full request 3: app `1,101,660,160` bytes, response `19,018,820` bytes, `1.98 s`.
  - After 35 seconds: app `464,297,984` bytes.
- Four concurrent legacy full-list requests:
  - Peak app memory: `1,504,284,672` bytes, about `1435 MiB`.
  - Requests completed around `~1.95 s`.
- Ten concurrent legacy full-list requests:
  - Peak app memory: `1,920,020,480` bytes, about `1831 MiB`.
  - Five requests completed around `~2.1 s`, five around `~4.0 s`, indicating server-side request concurrency limits/queuing.
- Interpretation:
  - Multiple overlapping full-list requests stack transient heap and can move a 10K library from a `~465-500 MiB` idle RSS to `1.5-1.9 GiB`.
  - This still did not hit the public `2.3 GiB` 10K peak locally, but it is the closest reproduced mechanism so far and scales directly with library size and request concurrency.

### Filter/app-books endpoint spot check after 10K

- `GET /api/v1/app/filter-options` after the exact-image 10K import:
  - Response size: `33,734` bytes.
  - First call: about `0.429 s`, app memory rose from about `475 MiB` to about `516 MiB`.
  - Later calls: about `0.011 s`, consistent with backend cache hits.
- `GET /api/v1/app/books?page=0&size=50&sort=addedOn&dir=desc`:
  - Response size: `24,028` bytes.
  - Calls completed in about `0.16-0.24 s`.
  - App memory rose to about `562 MiB`, then returned to about `472 MiB` after idle.
- These app-specific paginated/filter endpoints are not themselves a multi-GB spike source in the 10K test.

### Current nightly 50K JDK/NMT scale run

- Target: current nightly jar from `ghcr.io/grimmory-tools/grimmory:nightly`, extracted from the image and run under `eclipse-temurin:25-jdk-alpine` with `-XX:NativeMemoryTracking=summary`.
- Database: `lscr.io/linuxserver/mariadb:11.4.8`.
- Memory limit: `8 GiB` on the app container.
- Credentials in this run: `admin/admin123`.
- Caveat: this JDK debug container did not have the exact image's bundled libarchive native library. Startup logged `libarchive: NOT available`, and the JFR contains per-file `LibArchiveException` events. The production/nightly image does load libarchive, so libarchive exceptions from this JDK run are a debug-container artifact, not a user-image finding.
- 50K import result:
  - The database reached `50,000` books.
  - Import duration from first retry sample to `book_count=50000`: `864 s`, about `14.4 min`.
  - Peak app cgroup memory during ingest: `1,163,317,248` bytes, about `1,109 MiB`.
  - Peak DB cgroup memory during ingest: `640,536,576` bytes, about `611 MiB`.
  - Peak sampled heap committed: `684 MiB`.
  - Peak sampled heap used: `635 MiB`.
  - Peak sampled NMT total committed: `1,011 MiB`.
  - At the `50,000` sample: app `966,246,400` bytes, DB `594,649,088` bytes, heap committed/used `466/465 MiB`, NMT total committed `767 MiB`.
  - Later idle sample: app `604,729,344` bytes, DB `594,427,904` bytes, heap committed/used `136/134 MiB`, NMT total committed `422 MiB`.
  - Post-explicit-GC sample: app `679,096,320` bytes, DB `594,403,328` bytes, heap committed/used `136/134 MiB`, NMT total committed `420 MiB`.
- This still does not reproduce the public benchmark's `50K` app peak of `2,907 MiB` for ingest alone. The measured app ingest peak was about `1.11 GiB`, while DB sidecar memory was materially higher locally than the public CSV's DB peak.
- The app logged an end-of-scan `SQLNonTransientConnectionException` / `Connection reset by peer` while committing after `Finished processing library 'Benchmark 50K'`. Both app and DB containers had `restart=0` and `oom=false`, and row counts reached `50,000`. This should be rechecked in a non-debug exact-image run before treating it as an application bug.
- Log volume was again exactly per-file:
  - `50,000` `Processing file:` INFO lines.
  - `50,000` `TOC_INVALID` WARN lines.
  - `50,000` `No cover image found in EPUB` WARN lines.
- The 50K JFR allocation profile is essentially the 10K profile scaled up:
  - `byte[]`: `34.56%`.
  - object arrays: `8.54%`.
  - `char[]`: `6.67%`.
  - `int[]`: `5.73%`.
  - `String`: `4.53%`.
  - Hot allocation sites include `InputStream.transferTo`, `Arrays.copyOfRange`, `InputStream.readNBytes`, `BufferedReader.<init>`, Xerces DOM chunk creation, `ByteArrayOutputStream.<init>`, MariaDB packet reads, `HashMap` growth, and epub4j `ResourcesLoader.readStreamWithLimit`.
- JFR exception counts in the 50K JDK run:
  - `No EntityGraph with given name 'BookEntity.findByIdWithBookFiles'`: `46,575` messages.
  - `Library is not loaded`: `46,714` messages, attributed to the debug container's missing libarchive.
  - `InvocationTargetException`: `46,863`.
  - `IllegalArgumentException`: `46,577`.
  - `LibArchiveException`: `46,714`.
- Post-GC live heap after 50K import was still not book-dominated. Top live classes remained byte arrays, Hibernate ANTLR parser structures, object arrays, strings, reflection metadata, `Class`, and framework maps/lists.
- Post-GC NMT summary:
  - Total committed: `420 MiB`.
  - Java heap committed: `136 MiB`, peak `930 MiB`.
  - Class/metaspace committed: about `34 MiB` class plus `118 MiB` metaspace.
  - Code committed: `37 MiB`.
  - Thread committed: `6 MiB`.
  - GC committed: `11 MiB`.
  - NMT/tracing overhead: about `26 MiB`.
- Interpretation:
  - Ingest does create sustained transient allocation, but it does not leave a large book-sized live Java heap after GC.
  - The high app RSS after ingest is mostly committed heap/runtime state that can fall back toward `~600-700 MiB` app RSS in this environment.
  - DB sidecar memory can dominate the total idle number at 50K, depending heavily on the MariaDB image/config and host page cache/cgroup accounting.

### Exact current-nightly image 50K run

- Target: actual `ghcr.io/grimmory-tools/grimmory:nightly` image, not extracted jar.
- Database: `lscr.io/linuxserver/mariadb:11.4.8`.
- Memory limit: `8 GiB` on the app container.
- Credentials in this run: `admin/admin123`.
- This run used the real image's bundled native libraries:
  - Startup logged libarchive loaded.
  - Startup logged PDFium loaded and epub4j-native loaded.
- Workflow note: the initial foreground command was interrupted by the user, so a detached sampler continued the run with 10-second polling. The raw samples are preserved in `/tmp/grimmory-nightly-image-50k-profile/run-50k-20260529T102431Z/samples.tsv`.
- 50K import result:
  - The database reached `50,000` books, `50,000` metadata rows, and `50,000` book files.
  - Peak app cgroup memory observed during exact-image ingest: `1,657,421,824` bytes, about `1,580 MiB`.
  - Peak DB cgroup memory observed: `741,756,928` bytes, about `707 MiB`.
  - At the `50,000` sample: app `1,383,743,488` bytes, DB `741,748,736` bytes.
  - 30-second idle sample after reaching 50K: app `1,096,294,400` bytes, DB `741,756,928` bytes.
  - Containers had `restart=0`, `oom=false`, and remained healthy.
- This exact nightly image run still did not reproduce the public benchmark's `50K` app ingest peak of `2,907 MiB`; the observed peak was about `1.58 GiB`.
- It did reproduce the end-of-scan MariaDB socket reset seen in the JDK/NMT 50K run:
  - App log contains `Connection reset by peer`, `Socket error`, and `Unable to commit against JDBC Connection` around the final commit.
  - DB and app containers did not restart, and row counts reached `50,000`.
  - This looks like a real large-import reliability issue worth separate diagnosis, even though it did not prevent rows from being present in this run.
- Exact-image log counts:
  - `50,000` `Processing file:` INFO lines.
  - `50,000` `TOC_INVALID` WARN lines.
  - `50,000` `No cover image found in EPUB` WARN lines.
  - No `libarchive: NOT available` / `Library is not loaded` pattern.
- Largest DB tables after exact-image 50K import:
  - `book_file`: `19.55 MiB`.
  - `book_metadata`: `17.61 MiB`.
  - `book`: `11.09 MiB`.
  - `book_metadata_author_mapping`: `8.06 MiB`.
  - `book_metadata_category_mapping`: `4.03 MiB`.

### 50K books endpoint and concurrency profiling

- Workload: same 50K current-nightly JDK/NMT database after import, authenticated admin, explicit GC before each endpoint variant where practical.
- Single request results:
  - `GET /api/v1/books?stripForListView=false`
    - Response size: `94,662,387` bytes raw, about `90.3 MiB`.
    - Wall time: `17.76 s`.
    - App cgroup memory rose from `679,157,760` bytes to `1,529,298,944` bytes.
    - Heap after request: `898 MiB` committed, `755 MiB` used.
  - `GET /api/v1/books?stripForListView=true`
    - Response size: `37,212,387` bytes raw, about `35.5 MiB`.
    - Wall time: `16.45 s`.
    - App cgroup memory rose from `689,078,272` bytes to `1,523,453,952` bytes.
    - Heap after request: `906 MiB` committed, `715 MiB` used.
  - `GET /api/v1/books/page?page=0&size=50&sort=metadata.title,asc`
    - Response size: `37,898` bytes raw.
    - Five requests took `0.36-0.43 s` each.
    - App cgroup memory rose from `693,460,992` bytes to `715,857,920` bytes.
    - Heap after requests: `154 MiB` committed, `153 MiB` used.
- Initial-load transfer impact at 50K:
  - Current frontend-style full unstripped response versus first page: about `2,498x` more raw JSON (`94,662,387 / 37,898`).
  - Full stripped response versus first page: about `982x` more raw JSON.
  - Single full-list wall time versus page-size-50: roughly `41-49x` slower in this run.
- Concurrency results:
  - Two concurrent full unstripped requests:
    - Peak app memory: `2,212,765,696` bytes, about `2.06 GiB`.
    - Both responses were `94,662,387` bytes and completed in about `9.43 s`.
  - Four concurrent full unstripped requests:
    - Peak app memory: `3,495,759,872` bytes, about `3.26 GiB`.
    - All four responses were `94,662,387` bytes and completed in about `12.27-12.30 s`.
  - Ten concurrent page-size-50 requests:
    - Peak app memory: `731,119,616` bytes, about `697 MiB`.
    - All ten responses were `37,898` bytes and completed in about `0.81-1.21 s`.
- Interpretation:
  - This is the first local reproduction of multi-GB backend RSS in the same range as the public benchmark, and it is caused by overlapping unpaginated full-library requests rather than pure ingest.
  - At 50K, only two simultaneous legacy full-list calls are enough to reach about `2.2 GB` app RSS; four reach about `3.5 GB`.
  - The equivalent page-size-50 workload stays under `~0.75 GB` app RSS even with ten concurrent requests.
  - `stripForListView=true` is still not an effective backend memory fix because the backend has already fetched and mapped the full library before stripping response fields.

### Exact-image 50K endpoint smoke check

- Workload: same exact current-nightly 50K image after import, no `jcmd`/NMT because this is the production JRE image.
- One `GET /api/v1/books?stripForListView=false` request:
  - Response size: `94,662,387` bytes raw.
  - Wall time: `17.51 s`.
  - App cgroup memory before request: `1,094,475,776` bytes.
  - App cgroup memory after request: `1,930,989,568` bytes.
- One `GET /api/v1/books/page?page=0&size=50&sort=metadata.title,asc` request:
  - Response size: `37,898` bytes raw.
  - Wall time: `0.408 s`.
  - App cgroup memory before request: `1,798,295,552` bytes.
  - App cgroup memory after request: `1,803,833,344` bytes.
- After 35 seconds idle following the endpoint checks:
  - App cgroup memory: `1,116,004,352` bytes.
  - DB cgroup memory: `762,716,160` bytes.
- Interpretation: the representative image confirms the same endpoint behavior as the JDK/NMT container. The full-list request is the backend RSS spike; the page-size-50 request is small and fast.

### Frontend path findings

- `frontend/src/app/app.component.ts` injects `BookService` at application root.
  - Current line evidence: `frontend/src/app/app.component.ts:39`.
- `frontend/src/app/features/book/service/book.service.ts` defines a root query that calls `GET /api/v1/books` with `stripForListView=false` whenever the user has a token.
  - Current line evidence: `frontend/src/app/features/book/service/book.service.ts:44-47` and `:102-107`.
- Consequence: the legacy full-books query can fire on authenticated app startup, not only when a specific book-list screen needs the data.
- `BookService.uniqueMetadata` derives global filter sets from the full `books()` array. As long as callers depend on that signal, the frontend has a structural reason to retain a full-library DTO array.
  - Current line evidence: `frontend/src/app/features/book/service/book.service.ts:51-80`.
- Newer frontend code already has a paginated service:
  - `frontend/src/app/features/book/service/app-books-api.service.ts` uses `/api/v1/app/books` with page size `50`.
  - It also has `/api/v1/app/filter-options`.
  - Current line evidence: `frontend/src/app/features/book/service/app-books-api.service.ts:16`, `:35-46`, and `:48-60`.
- `frontend/src/app/features/book/service/book-query-cache.ts` still maintains the legacy `BOOKS_QUERY_KEY` cache for book-add/update events and invalidates the app-books caches separately.
  - Current line evidence: `frontend/src/app/features/book/service/book-query-cache.ts:55-62`, `:64-71`, and `:73-80`.
- `frontend/src/app/features/book/service/book-socket.service.ts` updates or invalidates the legacy full-books query on websocket events.
  - Current line evidence: `frontend/src/app/features/book/service/book-socket.service.ts:20-40`.
- A route-specific exact-image browser import on `/all-books` confirmed the event burst but not retained browser heap growth:
  - Artifact: `.memory-runs/run-20260529T140235Z-V10-exact-nightly-10k-ingest-with-browser-all-books`.
  - Browser stayed on `http://127.0.0.1:6182/all-books?view=grid&fmode=and`.
  - It received `20,004` websocket frames and `24,969,364` websocket bytes during a 10K import.
  - Final browser heap was `12,700,000` used / `16,100,000` total.
  - App RSS peaked at `2,211,725,312` and dropped to `473,387,008` post-import/browser-idle.
- Interpretation: Grimmory appears to be partway through migration to paginated app-books APIs, but the legacy full-books service is still root-injected and cache-maintained. This is enough to make large libraries pay the old full-list cost even if the visible route mostly uses newer paginated UI.

### Backend path findings

- `backend/src/main/java/org/booklore/controller/BookController.java`:
  - `GET /api/v1/books` returns `List<Book>` from `bookService.getBookDTOs(withDescription, stripForListView)`.
  - `GET /api/v1/books/page` returns `Page<Book>`.
  - Current line evidence: `backend/src/main/java/org/booklore/controller/BookController.java:69-86`.
- `backend/src/main/java/org/booklore/service/book/BookService.java`:
  - The unpaged path fetches all book DTOs, extracts all book IDs, then fetches all user progress/file progress for that whole ID set.
  - The paged path performs this work only for page content.
  - Current line evidence: unpaged `backend/src/main/java/org/booklore/service/book/BookService.java:75-105`, paged `:107-135`.
- `backend/src/main/java/org/booklore/service/book/BookQueryService.java`:
  - Admin unpaged fetch uses `bookRepository.findAllWithMetadata()` and maps every result to a full DTO before strip/null operations.
  - Paged list uses a page query and `stripForListView=true`.
  - Current line evidence: unpaged `backend/src/main/java/org/booklore/service/book/BookQueryService.java:32-35`, paged `:43-46`, mapping/strip `:123-146`, strip after mapping `:149-220`.
- `backend/src/main/java/org/booklore/repository/BookRepository.java`:
  - `findAllWithMetadata()` loads `bookMetadata`, `shelves`, and `library`.
  - `findByIdWithBookFiles(...)` uses a dynamic `@EntityGraph(attributePaths=...)`; during ingest JFR this path triggers the repeated missing named-entity-graph exception described above.
  - Current line evidence: `backend/src/main/java/org/booklore/repository/BookRepository.java:30-32` and `:83-87`.
- Newer app backend APIs are already bounded/paginated:
  - `backend/src/main/java/org/booklore/app/controller/AppBookController.java:27-32` routes `/api/v1/app/books` through `AppBookService.getBooks(...)`.
  - `backend/src/main/java/org/booklore/app/service/AppBookService.java:55-57` caps page size at `50`.
  - `backend/src/main/java/org/booklore/app/service/AppBookService.java:94-132` builds a pageable/specification-backed query instead of materializing the full library.
- The app filter endpoint is aggregate-heavy but bounded:
  - `backend/src/main/java/org/booklore/app/service/AppBookService.java:69-72` caches filter options for `30 s`, max `50` entries.
  - `backend/src/main/java/org/booklore/app/service/AppBookService.java:415-684` runs many grouped aggregate queries for filter options.
  - In the 10K exact-image spot check, first filter-options call was modest (`33,734` bytes, `0.429 s`, app `~475 MiB -> ~516 MiB`) and later calls were cache hits.
- Reader-side caches are bounded and are not implicated by the ingest/listing tests:
  - EPUB metadata cache: `backend/src/main/java/org/booklore/service/reader/EpubReaderService.java:36-75`, max `50`.
  - CBX metadata and ZipFile caches: `backend/src/main/java/org/booklore/service/reader/CbxReaderService.java:56-84`, max `50`.
  - PDF metadata cache: `backend/src/main/java/org/booklore/service/reader/PdfReaderService.java:36-45`, max `15`.
- Interpretation: the endpoint numbers match the code. The current legacy list path materializes database entities, DTOs, progress maps, and JSON for the full library, then strips only after the expensive work has already happened.

### Ingest source-path findings

- `backend/src/main/java/org/booklore/service/library/LibraryProcessingService.java:52-65` performs initial library ingest by:
  - collecting all library files into a `List<LibraryFile>`,
  - fetching all existing books,
  - fetching all additional files,
  - building a full `newFiles` list,
  - grouping all new files,
  - then processing the groups.
- `backend/src/main/java/org/booklore/service/library/LibraryProcessingService.java:75-133` rescan keeps even more full-library state in memory at once: books, all scanned files, filtered files, all additional files, deletion/restoration sets, then new-file grouping.
- At 50K synthetic EPUBs this all-files-in-memory shape did not dominate the live post-GC heap, but it is still a scale risk for large rescans and mixed libraries because it creates library-size collections before processing starts.
- `backend/src/main/java/org/booklore/service/library/BookGroupProcessor.java:47-91` processes each group in a `REQUIRES_NEW` transaction and emits a `BookAddedEvent` per imported book.
- `backend/src/main/java/org/booklore/service/library/BookGroupProcessor.java:60` logs `Processing file:` for every book. This exactly matches the `10K` and `50K` log counts.
- `backend/src/main/java/org/booklore/service/fileprocessor/EpubProcessor.java:74-81` calls cover extraction and warns when no cover is found for every no-cover EPUB.
- `backend/src/main/java/org/booklore/service/metadata/extractor/EpubMetadataExtractor.java:102-180` tries epub4j cover detection first, then a container/OPF fallback, then a manifest scan, then a full container file-name scan. For no-cover synthetic EPUBs this whole path returns `null` per file.
- `backend/src/main/java/org/booklore/service/metadata/extractor/EpubMetadataExtractor.java:184+` separately reopens/parses the EPUB metadata path. The synthetic workload therefore pays at least one metadata parse plus a cover-detection/fallback pass per file.

### 50K import transaction reliability bug

- Both 50K runs, including the exact nightly image with libarchive loaded, logged an end-of-scan database commit failure:
  - `SQLNonTransientConnectionException`
  - `Socket error`
  - `Connection reset by peer`
  - `Unable to commit against JDBC Connection`
- In both runs the app and DB containers stayed up with `restart=0` and `oom=false`, and the DB row counts reached `50,000`.
- Source evidence:
  - `backend/src/main/java/org/booklore/service/library/LibraryProcessingService.java:52-65` wraps the entire initial scan in `@Transactional`.
  - `backend/src/main/java/org/booklore/service/library/LibraryProcessingService.java:75-133` wraps the entire rescan in `@Transactional`.
  - `backend/src/main/java/org/booklore/service/library/FileAsBookProcessor.java:29-40` loops over all groups.
  - `backend/src/main/java/org/booklore/service/library/BookGroupProcessor.java:47-91` processes each book/group in a separate `REQUIRES_NEW` transaction.
- Interpretation:
  - The outer scan transaction can stay open for the full import duration while the per-book work commits in inner transactions.
  - At 50K, the outer transaction then attempts a final commit after many minutes and the MariaDB connection is reset.
  - This is not the main RAM spike source, but it is a real large-import reliability bug and may make library processing appear failed after successfully importing rows.
- Likely fix direction:
  - Do not keep one outer transaction open across the whole scan.
  - Use short read transactions for setup/state reads, then process groups outside an outer transaction, keeping `BookGroupProcessor`'s per-group `REQUIRES_NEW` transactions.
  - For rescan, split deletion/restoration/grouping phases into bounded transactional units rather than one long transaction.

## Prioritized Findings

### P0 - Legacy full-books request is the main reproduced multi-GB backend RSS source

- The frontend still root-injects `BookService`, and `BookService` still owns an authenticated query for `GET /api/v1/books?stripForListView=false`.
- At 50K books on the exact nightly image:
  - One full-list request returned `94.66 MB` raw JSON and took `17.5 s`.
  - It moved app RSS from `~1.09 GB` to `~1.93 GB`.
  - The equivalent page-size-50 request returned `37.9 KB` and took `0.41 s`.
- A 10K exact-image browser heap snapshot after normal startup:
  - Still made one legacy `/api/v1/books?stripForListView=false` request and no `/api/v1/app/books` or filter-options request.
  - Captured a `95,199,725` byte retained Chromium heap snapshot after GC.
  - Parsed heap summary showed `object` `6,794,508` self bytes / `188,198` nodes, `string` `5,846,308` / `698,040`, and `array` `1,905,908` / `35,465`.
  - Repeated retained strings included `Verification Library` `10,002` times and `LoadTest Press` `10,000` times.
- At 50K in the JDK/NMT run:
  - Two concurrent full-list requests peaked at `2.21 GB` app RSS.
  - Four concurrent full-list requests peaked at `3.50 GB` app RSS.
  - Ten concurrent page-size-50 requests stayed at `~0.73 GB` app RSS.
- This reproduces multi-GB backend memory without needing ingest. The public benchmark's sawtooth peaks are plausibly explained by full-list requests overlapping with import or other UI activity.
- Recommended fix:
  - Remove root eager loading of legacy `BookService`.
  - Migrate remaining consumers of `BookService.books()` and `uniqueMetadata` to `/api/v1/app/books`, `/api/v1/app/filter-options`, targeted detail endpoints, or narrow autocomplete/filter endpoints.
  - Stop updating/invalidating the legacy full-books cache on websocket events once callers are migrated.
  - Add a server-side cap, admin-only diagnostic flag, or deprecation path for unpaginated `/api/v1/books` so large libraries cannot accidentally trigger it.

### P0 - `stripForListView` does not solve backend memory

- `stripForListView=true` reduces network payload but not backend materialization cost.
- At 1,506 books:
  - Full unstripped: `57.1 MiB/request` allocation.
  - Full stripped: `57.0 MiB/request` allocation.
  - Page size 50: `3.0 MiB/request` allocation.
- At 10K books:
  - Full unstripped: about `350.7 MiB/request`.
  - Full stripped: about `341.4 MiB/request`.
  - Page size 50: about `2.8 MiB/request`.
- At 50K books:
  - Full unstripped and stripped both pushed app RSS to about `1.52-1.53 GB` for a single request.
- Recommended fix:
  - Treat projection/pagination as the real backend fix.
  - If a list endpoint must exist, build a list-specific DTO/projection query that only selects list fields and progress for the requested page.
  - Do not map full `Book` DTOs and then null out fields after the expensive work.

### P1 - Pure ingest is transient-heavy but not the main retained Java heap leak

- Current nightly 10K JDK/NMT pure ingest:
  - Peak app about `1.06 GiB`.
  - Post-GC heap committed/used about `132/130 MiB`.
- Current nightly 50K JDK/NMT pure ingest:
  - Peak app about `1.11 GiB`.
  - Post-GC heap committed/used about `136/134 MiB`.
  - NMT total committed about `420 MiB`.
- Exact nightly 50K pure ingest:
  - Peak app about `1.58 GiB`.
  - 30-second idle app about `1.02 GiB`.
- Post-GC class histograms are framework/runtime dominated, not `Book`/metadata dominated.
- Recommended focus:
  - Optimize ingest for CPU/log volume/reliability.
  - Treat high steady backend RSS after browsing as likely committed heap from full-list requests unless post-GC heap histograms prove otherwise.

### P1 - Long outer scan transaction fails at 50K

- Both the JDK/NMT and exact-image 50K runs ended with the same MariaDB socket reset at final commit, despite completed row counts and healthy containers.
- Source shape strongly suggests a long outer transaction wrapping a scan that delegates per-book commits to `REQUIRES_NEW`.
- Recommended fix:
  - Remove or narrow the outer `@Transactional` boundary on `processLibrary` and `rescanLibrary`.
  - Keep DB writes in bounded transactions.
  - Add an integration/stress test that imports enough files to keep processing longer than the DB/network idle timeout, or simulate a stale connection before final outer commit.

### P2 - Ingest hot-path noise: per-book exceptions and logs

- Current nightly ingest JFRs show repeated exception-control-flow:
  - Clean V09 10K: `10,000` missing named entity graph exceptions for `BookEntity.findByIdWithBookFiles`.
  - 50K: `~46,575` missing named entity graph messages.
- Synthetic no-cover EPUBs produce per-file logs:
  - `Processing file:` once per book.
  - `TOC_INVALID` once per book.
  - `No cover image found in EPUB` once per book.
- Recommended fixes:
  - Define a real named entity graph for `BookEntity.findByIdWithBookFiles` or adjust repository configuration so Hibernate/Spring Data does not throw the missing named-graph exception per imported book.
  - Downgrade expected no-cover/invalid-TOC noise to debug or aggregate summary counters for bulk imports.
  - Consider a fast path in cover extraction: if the OPF manifest has no image resources/cover hints, skip the expensive cover fallback chain.

### P2 - Full-library scan collections are a rescan scale risk

- Initial scan and rescan collect full file lists, existing books, additional files, new files, and grouping maps before processing.
- This did not dominate retained heap in the synthetic 50K import after GC, but it is still a risk for very large/mixed libraries and especially rescans.
- Recommended fixes:
  - Stream or chunk file discovery and grouping where possible.
  - Avoid holding both all scanned files and multiple derived full-library lists when a phase can be processed incrementally.
  - Re-evaluate rescan with 100K+ files and mixed audio/folder-based libraries after pagination work is done.

### P2 - Folder ZIP downloads buffer full archives

- Exact nightly V27 primary folder-audiobook artifact: `.memory-runs/run-20260529T124014Z-V27-exact-nightly-folder-zip-download-128mb-clean`.
- Exact nightly V27 additional-folder artifact: `.memory-runs/run-20260529T130217Z-V27-additional-folder-zip-download-128mb-clean`.
- Exact nightly V27 concurrent primary-folder artifact: `.memory-runs/run-20260529T134154Z-V27-concurrent-folder-zip-download-3x128mb`.
- Primary folder `/api/v1/books/1/download` returned `134,258,928` bytes and moved app RSS from `663,076,864` to `1,210,904,576`; `/download-all` streamed a similar `134,259,008` byte ZIP with app RSS `705,679,360 -> 710,201,344`.
- Additional folder `/api/v1/books/1/files/2/download` returned `134,258,928` bytes and moved app RSS from `492,392,448` to `922,529,792`; sampled download-window peak was about `940,670,976` before dropping back to about `489,533,440`.
- Three concurrent primary-folder `/download` clients each returned `134,258,928` bytes and moved app RSS from `510,640,128` to `1,797,185,536`; sampled peak was `1,819,090,944`. The same run's `/download-all` streaming control was `513,662,976 -> 517,558,272`.
- Recommended fixes:
  - Stream folder ZIPs directly to the servlet response instead of materializing `ByteArrayResource`.
  - Add size/concurrency guards for folder ZIP generation.
  - Re-run V27 with larger/mixed primary/additional concurrency and after any streaming fix.

### P2 - Recommendation updater creates a sharp all-library task spike

- Exact nightly V23 artifacts:
  - `.memory-runs/run-20260529T131138Z-V23-recommendation-task-1k-clean`
  - `.memory-runs/run-20260529T131940Z-V23-recommendation-task-2k-clean`
  - `.memory-runs/run-20260529T132425Z-V23-recommendation-task-5k-clean`
- Debug JDK/JFR V23 artifact:
  - `.memory-runs/run-20260529T133424Z-V23-debug-jdk-recommendation-task-2k`
- The corrected task payload was `UPDATE_BOOK_RECOMMENDATIONS` with `"options": null`; a prior 2K attempt is retained as a harness bug because it failed at request parsing, not during recommendation work.
- At 1K books:
  - Task completed successfully in `4,638 ms`.
  - DB showed `1,000` non-null embeddings and `1,000` non-null similar-book outputs.
  - Task-status samples moved app RSS from `534,994,944` at task start to `2,182,828,032` at completion.
  - Docker sampler peak during the task window was `2,183,118,848`.
- At 2K books:
  - Task completed successfully in `11,182 ms`.
  - DB showed `2,000` non-null embeddings and `2,000` non-null similar-book outputs.
  - Task-status samples reached `2,317,545,472` while the task was still `IN_PROGRESS`.
  - Docker sampler peak during the task window was `2,339,500,032`.
  - Post-task idle sample dropped to about `552,239,104`.
- At 5K books:
  - Task completed successfully in `51,923 ms`.
  - DB showed `5,000` non-null embeddings and `5,000` non-null similar-book outputs.
  - Task-status samples reached `2,327,846,912` while the task was still `IN_PROGRESS`.
  - Docker sampler peak during the task window was `2,347,315,200`.
  - Post-task idle sample dropped to about `777,179,136`.
- At 10K books:
  - Task completed successfully in `190,462 ms`.
  - DB showed `10,000` non-null embeddings and `10,000` non-null similar-book outputs.
  - Task-status samples reached `2,347,393,024` while the task was still `IN_PROGRESS`.
  - Docker sampler peak during the task/import run was `2,354,757,632`.
  - Post-task 15-second idle sample was about `1,275,248,640`.
- The 2K debug JDK/JFR run isolated the recommendation task after import and pre-task GC:
  - Task completed in `11,624 ms`.
  - Docker sampler peak was `2,374,369,280`.
  - JFR native-memory view saw Java heap committed up to `1.8 GB` during the task.
  - Pre-task post-GC heap was `116M committed / 115M used`; post-task post-GC heap was `108M committed / 107M used`.
  - Allocation samples were dominated by object arrays, hash maps, Hibernate/Spring transaction/session infrastructure, and hot-method samples included `BookVectorService.cosineSimilarity`.
- Source shape:
  - `BookRecommendationUpdaterTask` keeps whole-library embedding and series-name maps, loops every target book over all other books, and holds recommendation outputs before saving.
  - `BookVectorService.findTopKSimilar` builds and sorts candidate lists for similarity selection.
- Recommended fixes:
  - Bound the workload by batching targets and avoiding all-output retention.
  - Avoid full candidate-list materialization and sort when top-K selection is enough.
  - Re-run V23 after algorithm changes and compare against the 1K/2K/5K/10K baselines.

### P3 - User-facing memory guidance should separate app RSS, heap, and DB RSS

- App RSS can remain high after startup or full-list requests because Shenandoah has committed heap and may uncommit later.
- Live heap after explicit GC was much lower than cgroup RSS in the JDK/NMT runs.
- MariaDB sidecar memory varied widely:
  - 10K exact-image DB: about `379 MiB` peak in local runs.
  - 50K exact-image DB: about `707 MiB` after import.
  - Public benchmark DB numbers were lower for 50K.
- Recommended docs/support guidance:
  - Ask users for app container RSS, DB container RSS, JVM heap/NMT if possible, and whether a large library view was recently opened.
  - Encourage explicit Docker memory limits and tuned `JAVA_TOOL_OPTIONS` for constrained hosts.
  - Do not diagnose "Grimmory backend leak" from total compose RSS alone without separating MariaDB and committed heap.

## Hypotheses To Test

1. The unpaginated books endpoint allocates and serializes a response proportional to total library size, causing high request-time heap pressure and avoidable retained frontend state.
2. Ingest keeps large per-book artifacts or metadata extraction structures alive longer than necessary, raising peak heap and GC pressure.
3. Idle backend memory is inflated by caches, startup-loaded data, thread stacks, native buffers, image/PDF/EPUB libraries, or JVM ergonomics rather than only Java heap.
4. Database access patterns may materialize full entity graphs where projections or pagination would be enough.
5. Container RSS may look high because of committed heap, metaspace, code cache, direct buffers, thread stacks, or glibc/native allocations that need separate accounting from live heap.
