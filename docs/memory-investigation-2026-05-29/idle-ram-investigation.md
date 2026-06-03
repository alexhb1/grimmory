# Huge-Library Idle RAM Investigation

## Current Answer

We now have a dedicated huge-library idle baseline.

Plain English diagnosis:

- A 50,000-book library does not, by itself, make the backend sit at multi-GB memory while idle.
- The exact nightly image did briefly use about `1.56 GiB` app container memory immediately after startup, with no browser connected and no deliberate API workload.
- That startup memory fell on its own over the 30-minute idle window to about `0.375 GiB` app container memory.
- MariaDB was separate and much smaller in this idle test: about `0.13-0.15 GiB`.
- The debug-JDK run explains the startup shape: at ready, Java heap was about `1,016 MiB committed / 1,015 MiB used`; after stabilization it was about `180 MiB committed / 111 MiB used`, and after idle plus forced GC it was about `136 MiB committed / 133 MiB used`.
- A post-GC class histogram was not dominated by retained `BookEntity`, `BookMetadata`, or full-book DTO instances. It was mostly framework/runtime structures such as byte arrays, strings, ANTLR parser structures, Spring/Hibernate metadata, maps, arrays, and classes.
- A 512 MiB app-container limit still booted the exact nightly against the same verified 50K DB. It peaked at about `0.495 GiB` and settled at about `0.383 GiB`, with no restart or OOM.
- MariaDB by itself is not the multi-GB culprit. With the 50K DB and no app, it sat around `0.131 GiB` and peaked at `0.134 GiB`.
- A real browser opening `/all-books` is a separate average-RAM culprit because it triggers the full-books API. In the 50K browser run, the backend peaked at about `2.16 GiB`, the full-books request took about `25.6 s`, and the retained Chromium heap snapshot was `204,901,905` bytes on disk with `70,602,215` bytes total self size.
- Three real browser clients opening `/all-books` against the same 50K DB two seconds apart peaked the backend at about `3.38 GiB`, then the backend settled to about `0.55 GiB` after the clients closed and the post-browser idle window completed. Each client made one `/api/v1/books?stripForListView=false` request taking about `26-28 s`.
- A focused JVM tuning pass is documented in `idle-ram-tuning-report.md`. The practical finding is that `-Xms64m` is safe in the tested 50K idle/browser paths and does not limit the maximum heap, but it does not materially reduce the final no-browser idle floor. `SoftMaxHeapSize` lowers startup/full-list peaks but kept post-request RSS high for longer, so it is an opt-in tradeoff rather than a default idle fix.

So the current answer is: huge-library idle memory is mainly a startup/JVM sizing and heap-uncommit story, not a proven retained 50K-book heap leak. The large retained-memory problems remain the full-books API, browser startup full-list fetch, bulk tasks, ingest/rescan/backfills, and buffered downloads.

## What This Test Must Prove

The idle question is different from ingest or endpoint spikes. The core question is:

> With a huge library already present, what does Grimmory consume while doing nothing, and which component owns that memory?

For a useful answer, each run must record:

- app container RSS;
- MariaDB container RSS;
- total app plus DB RSS;
- DB row count, so a failed or empty copied database is not mistaken for a low-memory result;
- app image digest and DB image digest;
- whether a browser was connected;
- whether any API workload ran during the idle window;
- for debug-JDK runs, heap used/committed/max, NMT committed/reserved, and class histogram before and after idle;
- final container state, OOM flags, restart count, and logs.

## Ranked Hypotheses

1. Uncapped JVM heap expansion is a major cause of scary-looking average RSS after real workloads.
   Prediction: exact-image RSS can be high after spikes, but debug-JDK post-GC live heap is much lower than peak RSS. Docker app memory limits should lower steady RSS substantially without changing the dataset.

2. MariaDB sidecar memory is being mixed into the app memory story.
   Prediction: on huge libraries, DB RSS is a material part of total compose memory and can move independently of Java heap.

3. Startup work can make "idle after restart" look busy for several minutes.
   Prediction: pure idle RSS is higher immediately after boot, then falls or stabilizes without browser/API traffic; logs should show startup backfills, cache warmup, or scheduled tasks if they occur.

4. Browser or frontend startup can contaminate idle measurements.
   Prediction: no-browser idle stays lower than a browser-connected run that triggers the full books response. Browser heap/network artifacts should show whether `/api/v1/books?stripForListView=false` was requested.

5. A retained app-level cache of books/metadata may exist at rest.
   Prediction: after explicit GC in a debug-JDK idle run, class histograms still show large retained counts of book/metadata DTO/entity/list/map structures scaling with library size. If post-GC heap remains small and not book-dominated, this hypothesis gets weaker.

## New Harness

Added:

- `scripts/run-huge-idle-baseline.sh`
- `scripts/run-db-only-idle-baseline.sh`
- `scripts/run-huge-browser-idle.sh`

The idle harness boots a copied huge-library MariaDB directory, verifies the target book count, then samples memory during a controlled no-browser idle window. The DB-only and browser harnesses use the same copied-database verification pattern so sidecar memory and browser-contaminated startup can be measured separately.

The idle and browser harnesses now accept `JAVA_TOOL_OPTIONS_OVERRIDE` so JVM profile experiments are captured in the artifact manifest and generated compose file.

Important defaults:

- `TARGET_COUNT=50000`
- `RUN_MODE=exact`
- `IDLE_DURATION_SECONDS=1800`
- `STABILIZE_SECONDS=60`
- `SAMPLE_INTERVAL=10`
- `KEEP_CONTAINERS=0`

Useful modes:

- `RUN_MODE=exact`: representative user-facing nightly image.
- `RUN_MODE=debug-jdk`: extracts the nightly jar into a JDK container and enables NMT/JVM snapshots. This is less representative for RSS, but necessary for heap/native-memory attribution.

The script writes all command output, samples, Docker state, logs, and summaries into `.memory-runs/run-*/`.

## First Verification Matrix

Run these in order:

| ID | Purpose | Image mode | Dataset | Idle window | Browser | Expected output |
| --- | --- | --- | --- | --- | --- | --- |
| IDLE-50K-EXACT | User-representative huge-library idle baseline | exact | copied 50K DB | 30-60 min | none | app RSS, DB RSS, total RSS, stability over time |
| IDLE-50K-DEBUG | JVM attribution for the same database | debug-jdk | copied 50K DB | 10-30 min | none | heap info, NMT, class histogram before/after idle and after GC |
| IDLE-50K-EXACT-BROWSER | Browser-contaminated idle comparison | exact | copied 50K DB | 15-30 min after startup route load | one browser | backend RSS plus browser/network evidence |
| IDLE-50K-LIMITS | Container sizing comparison | exact | copied 50K DB | 10-15 min each | none | app RSS under no cap, 2 GiB, 1 GiB, 512 MiB |
| IDLE-DB-ONLY | Sidecar attribution | DB only or app stopped after DB ready | copied 50K DB | 10-15 min | none | MariaDB baseline without app activity |

## Current Interpretation Rules

- Do not report a combined app plus DB number as "backend app memory" without splitting it.
- Do not treat exact-image RSS as Java live heap. Use debug-JDK heap/NMT snapshots for that.
- Do not treat a short post-import sample as a general idle result. It is only a clue unless a longer idle window confirms stability.
- Do not trust a copied DB run until the harness records the expected book count.
- If a debug-JDK run disagrees with the exact image, prefer the exact image for user-facing memory and the debug-JDK run for JVM cause.

## Remaining Evidence Gaps

- No post-fix before/after comparison yet for any future startup/full-list changes.

## Completed V40 Runs

| Artifact | Mode | App limit | Result |
| --- | --- | ---: | --- |
| `.memory-runs/run-20260530T094732Z-V40-idle-50k-exact-30min` | exact nightly | none | 50K verified; app peak `1,673,330,688` bytes, final `402,255,872`; DB final `162,951,168` |
| `.memory-runs/run-20260530T102059Z-V40-idle-50k-debug-jdk-15min` | debug JDK | none | 50K verified; app peak `1,587,511,296`, final `496,607,232`; manual JCMD at 6m: heap `160M` committed / `156M` used, NMT committed `400,900 KB` |
| `.memory-runs/run-20260530T104117Z-V40-idle-50k-debug-jdk-jcmd-5min` | debug JDK | none | 50K verified; app peak `1,298,653,184`, final `426,147,840`; clean ready/post-idle NMT and class histograms captured |
| `.memory-runs/run-20260530T105211Z-V40-idle-50k-exact-512m-5min` | exact nightly | 512 MiB | 50K verified; app peak `531,574,784`, final `411,176,960`; no restart/OOM |
| `.memory-runs/run-20260530T110548Z-V41-db-only-idle-50k-10min` | DB only | n/a | 50K verified; DB peak `143,884,288`, final `141,406,208` |
| `.memory-runs/run-20260530T111833Z-V42-browser-idle-50k-all-books-heap` | exact nightly + browser | none | 50K verified; one browser full-list request; app peak `2,314,866,688`, final `442,793,984`; retained browser heap snapshot captured |
| `.memory-runs/run-20260530T113513Z-V43-browser-idle-50k-3clients` | exact nightly + 3 browsers | none | 50K verified; three browser full-list requests; app peak `3,632,312,320`, final `595,443,712`; all browser clients exited cleanly |

Key debug-JDK attribution from `.memory-runs/run-20260530T104117Z-V40-idle-50k-debug-jdk-jcmd-5min`:

| Snapshot | Heap committed | Heap used | NMT total committed |
| --- | ---: | ---: | ---: |
| ready | `1,016 MiB` | `1,015 MiB` | `1,323,823 KB` |
| post-stabilize | `180 MiB` | `111 MiB` | `421,627 KB` |
| post-idle | `164 MiB` | `101 MiB` | `404,065 KB` |
| post-idle forced GC | `136 MiB` | `133 MiB` | `374,253 KB` |

## Pause Note - 2026-05-30

Status: paused, with all visible Docker containers stopped and no idle-harness sampler processes left running.

What happened:

- First starter artifact: `.memory-runs/run-20260530T080139Z-V40-idle-50k-exact-10min`
- Result: invalid harness run. Docker pull failed before any Grimmory containers started because the WSL Docker config referenced `docker-credential-desktop.exe`.
- Fix made: `common.sh` now records `.exit` files for failed `run_step` commands, and the rerun used an isolated no-credentials `DOCKER_CONFIG`.

Second starter artifact:

- `.memory-runs/run-20260530T080225Z-V40-idle-50k-exact-10min`
- Result: invalid application-memory evidence. Containers started, but the copied 50K DB artifact presented as `0` books under the current Docker Desktop MariaDB run.
- Direct DB counts: `book=0`, `book_file=0`, `book_metadata=0`, `library=0`, `users=0`.
- Final invalid-run sample: app `610,885,632` bytes, DB `324,816,896` bytes, `0` books. This is not huge-library idle evidence.

Current interpretation:

- The new idle harness is useful because it refused to proceed without the expected book count.
- Existing 50K DB artifacts still contain table files and older evidence logs say they had 50K rows at the time, but this specific copied restart under the Docker Desktop proxy socket did not restore those rows.
- Follow-up diagnosis showed the same copied 50K DB artifact boots correctly with `50,000` books through the normal `/var/run/docker.sock` Docker endpoint. The empty-DB V40 starter remains invalid evidence.
