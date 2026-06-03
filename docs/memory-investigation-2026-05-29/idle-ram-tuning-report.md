# Idle RAM Tuning Report

## High Level Summary

The current idle-RAM problem is not primarily a retained 50,000-book object graph. The measured floor is mostly the warm JVM and Spring/Hibernate runtime: heap, metaspace, class metadata, code cache, symbols, GC structures, threads, and loaded framework/application classes.

The best verified same-JVM candidate for "minimum idle, grow for work, return quickly" is no longer Shenandoah SoftMax, and it is no longer the aggressive V55 full-GC profile either. The best tuned candidate from this pass is G1 with periodic concurrent idle cleanup and a tighter heap-free target:

```text
-Xms64m
-XX:MaxRAMPercentage=60.0
-XX:+UseG1GC
-XX:G1PeriodicGCInterval=5000
-XX:G1PeriodicGCSystemLoadThreshold=0
-XX:+G1PeriodicGCInvokesConcurrent
-XX:MaxHeapFreeRatio=10
-XX:MinHeapFreeRatio=5
-XX:-ShrinkHeapInSteps
```

This is different from setting `-Xmx256m`. `-Xmx256m` is a hard cap and can break large-library work. `-Xms64m` lowers the initial heap without constraining the maximum; the hard ceiling remains elastic through `MaxRAMPercentage`.

`SoftMaxHeapSize` was tested because it theoretically expresses "prefer a small heap, grow above it if needed." In Grimmory's current Shenandoah setup it lowered startup and full-list peaks, but it failed the third requirement: returning memory promptly after the work. Debug-JDK attribution showed the high post-work RSS was mostly committed Java heap, not live book data. Explicit GC and a heap-shrink variant did not return it to the low idle floor, so `SoftMaxHeapSize` should not be Grimmory's default.

G1's periodic idle shrinking is different. It is a JVM feature specifically built to return unused committed Java heap when the application is idle. V55 proved the mechanism with an aggressive periodic full-GC profile, but that mode created repeated stop-the-world full-GC pauses. The safer tuned profile follows the web/JVM guidance more closely: keep periodic cleanup concurrent, tighten heap-free ratios, and use peak RSS only as a guardrail. In two exact-image 50K browser runs, this concurrent profile returned to about `0.449-0.453 GiB` idle with zero full-GC pauses.

## Current Baseline

Measured no-browser 50K idle baseline:

- Exact nightly artifact: `.memory-runs/run-20260530T094732Z-V40-idle-50k-exact-30min`.
- Backend app peak after startup: `1,673,330,688` bytes (`1.56 GiB`).
- Backend app final after 30 minutes idle: `402,255,872` bytes (`0.375 GiB`).
- DB final: `162,951,168` bytes (`0.152 GiB`).

Measured JVM attribution:

- Debug-JDK artifact: `.memory-runs/run-20260530T104117Z-V40-idle-50k-debug-jdk-jcmd-5min`.
- Ready heap: `1,016 MiB` committed / `1,015 MiB` used.
- Post-idle heap: `164 MiB` committed / `101 MiB` used.
- Post-idle forced-GC heap: `136 MiB` committed / `133 MiB` used.
- Post-idle forced-GC NMT total committed: `374,253 KB`.
- Post-GC class histogram was not dominated by retained book entities, metadata rows, or full-book DTOs.

Plain English: the app eventually gets down near a few hundred MiB, but it starts and spikes much larger than the live data requires. The target is to lower startup and post-spike committed memory without removing the ability to serve large tasks.

The three default-selection requirements used for the final pass were:

- Start small while idle.
- Grow during real work.
- Hand memory back quickly after the work.

`-Xms64m` with the existing elastic `MaxRAMPercentage=60.0` satisfies the "start small" and "grow" requirements in the tested 50K idle and browser paths. `SoftMaxHeapSize` improves the current full-books request's peak in some runs, but it does not hand memory back quickly afterward. G1 periodic cleanup is the first tested JVM mechanism that satisfied the return-to-idle requirement. After tuning, concurrent periodic cleanup with `MaxHeapFreeRatio=10` is the leading safe default candidate.

## Research Notes

Official Java container support is designed around detected container memory. The JVM can size heap from available/container memory using `InitialRAMPercentage`, `MaxRAMPercentage`, and `MinRAMPercentage`; `Xmx` and `Xms` take precedence when set. That means percentage-based sizing is useful for deployments with explicit container limits, but on uncapped self-hosted installs it can still scale from the host and over-allocate.

`SoftMaxHeapSize` was added as a manageable HotSpot flag. The OpenJDK release note describes the behavior Grimmory wants in principle: the GC should try not to grow beyond the soft size unless it needs to avoid allocation failure or `OutOfMemoryError`, and the setting is useful when resource usage matters but temporary heap growth still needs to be possible. The original release note describes ZGC behavior. Java 25 reports `SoftMaxHeapSize` when running Shenandoah, and Grimmory's debug runs confirmed the JVM honored the soft max setting. However, Grimmory's application-level post-request RSS behavior was worse than the simpler `-Xms64m` profile.

Oracle's Java command docs also document traditional heap footprint controls such as `MaxHeapFreeRatio`, `MinHeapFreeRatio`, and `-XX:-ShrinkHeapInSteps`. A Grimmory-specific exact-image run tested those controls with SoftMax. They did not fix the post-work RSS recovery problem.

OpenJDK JEP 346 describes the G1 behavior that matches this investigation: during inactivity, G1 can periodically trigger collection and adjust heap size, returning unused portions of the heap to the operating system. It can perform a concurrent cycle by default, or a full GC when `G1PeriodicGCInvokesConcurrent` is disabled. The full-GC mode is more disruptive and should be treated as the fallback, not the default choice, unless concurrent cleanup cannot return enough memory.

Sources:

- OpenJDK Shenandoah overview: <https://wiki.openjdk.org/spaces/Shenandoah/overview>
- OpenJDK `SoftMaxHeapSize` release note: <https://bugs.openjdk.org/browse/JDK-8222487>
- OpenJDK JEP 346, G1 promptly returning unused committed memory: <https://openjdk.org/jeps/346>
- Oracle `java` command documentation for `InitialRAMPercentage`, `MaxRAMPercentage`, heap shrink flags, and container-aware max memory: <https://docs.oracle.com/en/java/javase/22/docs/specs/man/java.html>
- Oracle G1 tuning documentation: <https://docs.oracle.com/en/java/javase/24/gctuning/garbage-first-garbage-collector-tuning.html>
- Red Hat OpenJDK container-awareness article: <https://developers.redhat.com/articles/2022/04/19/java-17-whats-new-openjdks-container-awareness>

## Existing Installs

Existing installs currently inherit the image's baked `JAVA_TOOL_OPTIONS` unless the user overrides it in compose. The compose example currently suggests:

```text
# JAVA_TOOL_OPTIONS=-Xmx256m
```

That is not ideal for users because setting `JAVA_TOOL_OPTIONS` replaces the image default string. A user trying to cap heap can accidentally drop other important defaults such as Shenandoah, compact object headers, string deduplication, code-cache sizing, thread-stack sizing, and native direct-memory caps.

Recommended product rollout:

1. Keep raw `JAVA_TOOL_OPTIONS` as an escape hatch for advanced users.
2. Add explicit Grimmory env vars that the entrypoint translates into JVM flags:
   - `GRIMMORY_HEAP_INITIAL`, default `64m`.
   - `GRIMMORY_HEAP_MAX_PERCENT`, default `60`.
   - `GRIMMORY_JAVA_OPTS_EXTRA`, appended after Grimmory defaults.
3. Update compose docs to recommend these vars instead of replacing `JAVA_TOOL_OPTIONS`.
4. For existing installs, make the new defaults automatic when users update the image. Users with existing custom `JAVA_TOOL_OPTIONS` should keep their override and receive migration guidance.

Do not add `GRIMMORY_HEAP_SOFT_MAX` as a recommended default control yet. If it remains available, it should be clearly experimental because it failed the return-to-idle requirement in V49-V52.

The tuned G1 periodic-concurrent profile is now the leading candidate for a future Grimmory default, but it still needs broader validation beyond the 50K browser path: no-browser idle, ingest, rescan, startup backfills, metadata tasks, recommendation work, and latency impact under normal UI/API activity.

Proposed entrypoint behavior:

```sh
heap_initial="${GRIMMORY_HEAP_INITIAL:-64m}"
heap_max_percent="${GRIMMORY_HEAP_MAX_PERCENT:-60.0}"

GRIMMORY_DEFAULT_JAVA_OPTS="\
  -XX:+UseG1GC \
  -XX:+UseCompactObjectHeaders \
  -Xms${heap_initial} \
  -XX:MaxRAMPercentage=${heap_max_percent} \
  -XX:G1PeriodicGCInterval=5000 \
  -XX:G1PeriodicGCSystemLoadThreshold=0 \
  -XX:+G1PeriodicGCInvokesConcurrent \
  -XX:MaxHeapFreeRatio=10 \
  -XX:MinHeapFreeRatio=5 \
  -XX:-ShrinkHeapInSteps \
  ..."
```

The important design point: Grimmory should own the default JVM profile in the image instead of relying on each deployment to rebuild the full JVM flag line by hand.

## Verification Matrix

| ID | Purpose | Status |
| --- | --- | --- |
| V44 | Exact nightly, 50K no-browser idle, `-Xms64m`, `SoftMaxHeapSize=256m`, hard max still elastic via `MaxRAMPercentage=60` | complete |
| V45 | Exact nightly, 50K browser `/all-books`, `SoftMaxHeapSize=256m` | complete |
| V46 | Debug-JDK no-browser attribution for `SoftMaxHeapSize=256m` | complete |
| V47 | Exact nightly, 50K no-browser idle, `-Xms64m` and no `SoftMaxHeapSize` | complete |
| V48 | Exact nightly, 50K browser `/all-books`, `-Xms64m` and no `SoftMaxHeapSize` | complete |
| V49 | Exact nightly, 50K browser `/all-books`, `SoftMaxHeapSize=384m` | complete |
| V50 | Exact nightly, 50K browser `/all-books`, `SoftMaxHeapSize=384m`, 10-minute post-browser idle | complete |
| V51 | Debug-JDK SoftMax browser attribution with NMT, 10-minute post-browser idle, and explicit GC | complete |
| V52 | Exact nightly SoftMax plus heap-shrink controls, 10-minute post-browser idle | complete |
| V53 | Exact nightly ZGC plus SoftMax as an alternate elastic-heap candidate | stopped after failing idle baseline |
| V54 | Debug-JDK Shenandoah SoftMax with stop-the-world explicit GC candidate | complete |
| V55 | Exact nightly G1 periodic full-GC shrinking candidate | complete |
| V56 | Exact nightly G1 periodic full-GC shrinking plus `SoftMaxHeapSize=384m` | complete |
| V57 | Exact nightly G1 periodic concurrent cleanup, `MaxHeapFreeRatio=20` | complete |
| V58 | Exact nightly G1 periodic full-GC cleanup every 30 seconds | complete |
| V59 | Exact nightly G1 periodic concurrent cleanup, `MaxHeapFreeRatio=10` | complete |
| V60 | Exact nightly G1 periodic full-GC cleanup every 15 seconds | complete |
| V61 | Repeat of V59 concurrent `MaxHeapFreeRatio=10` profile | complete |

Success criteria:

- No-browser idle RSS improves versus the exact V40 baseline.
- The container still boots against the verified 50K DB.
- A real browser can still open the huge library and complete the current full-books request.
- Peak RSS remains in normal bounds and does not regress excessively, but peak is not the deciding metric for this tuning pass.
- GC logs show the selected option returns idle memory without frequent stop-the-world full-GC pauses.

## Verification Results

| Artifact | JVM profile | Workload | Result |
| --- | --- | --- | --- |
| `.memory-runs/run-20260530T120143Z-V44-idle-50k-softmax256-exact-10min` | `-Xms64m`, `SoftMaxHeapSize=256m`, `MaxRAMPercentage=60` | exact image, 50K no-browser idle, 10 minutes | app peak `841,326,592` bytes (`0.78 GiB`), final `451,522,560` bytes (`0.42 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T121535Z-V45-browser-50k-softmax256-all-books` | `-Xms64m`, `SoftMaxHeapSize=256m`, `MaxRAMPercentage=60` | exact image, one browser `/all-books`, 2-minute post-browser idle | request completed in `25.959 s`; app peak `1,480,327,168` bytes (`1.38 GiB`), final `1,361,756,160` bytes (`1.27 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T122236Z-V46-debug-idle-50k-softmax256-jcmd-5min` | debug JDK, `SoftMaxHeapSize=256m` | 50K no-browser idle, 5 minutes | `jcmd` reported `15856M max, 256M soft max, 160M committed, 108M used` post-idle; final app RSS `520,224,768` bytes (`0.48 GiB`) |
| `.memory-runs/run-20260530T123008Z-V47-idle-50k-xms64-no-softmax-exact-10min` | `-Xms64m`, no soft max, `MaxRAMPercentage=60` | exact image, 50K no-browser idle, 10 minutes | app peak `1,389,056,000` bytes (`1.29 GiB`), final `429,760,512` bytes (`0.40 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T124249Z-V48-browser-50k-xms64-no-softmax-all-books` | `-Xms64m`, no soft max, `MaxRAMPercentage=60` | exact image, one browser `/all-books`, 2-minute post-browser idle | request completed in `25.677 s`; app peak `2,263,175,168` bytes (`2.11 GiB`), final `458,473,472` bytes (`0.43 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T125013Z-V49-browser-50k-softmax384-all-books` | `-Xms64m`, `SoftMaxHeapSize=384m`, `MaxRAMPercentage=60` | exact image, one browser `/all-books`, 2-minute post-browser idle | request completed in `25.632 s`; app peak `1,484,492,800` bytes (`1.38 GiB`), final `1,040,224,256` bytes (`0.97 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T125740Z-V50-browser-50k-softmax384-long-post-idle` | `-Xms64m`, `SoftMaxHeapSize=384m`, `MaxRAMPercentage=60` | exact image, one browser `/all-books`, 10-minute post-browser idle | request completed in `25.587 s`; app peak `1,455,157,248` bytes (`1.36 GiB`), final `940,154,880` bytes (`0.88 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T140543Z-V51-browser-softmax384-debug-jcmd-postgc` | debug JDK, `-Xms64m`, `SoftMaxHeapSize=384m`, `MaxRAMPercentage=60`, NMT enabled | one browser `/all-books`, 10-minute post-browser idle, explicit `jcmd GC.run`, 60-second settle | request completed in `25.787 s`; app peak `1,504,567,296` bytes (`1.40 GiB`), final `1,185,640,448` bytes (`1.10 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T142020Z-V52-browser-softmax384-heapshrink-exact` | exact image, `-Xms64m`, `SoftMaxHeapSize=384m`, `MaxHeapFreeRatio=10`, `MinHeapFreeRatio=5`, `-XX:-ShrinkHeapInSteps` | one browser `/all-books`, 10-minute post-browser idle | request completed in `25.819 s`; app peak `1,487,740,928` bytes (`1.39 GiB`), final `1,165,565,952` bytes (`1.09 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T144318Z-V53-browser-zgc-softmax384-exact-return-idle` | exact image, `-XX:+UseZGC`, `-Xms64m`, `SoftMaxHeapSize=384m`, `ZUncommitDelay=5` | one browser `/all-books`; stopped after idle-baseline failure | pre-browser app RSS was already `2,537,443,328` bytes (`2.36 GiB`); post-browser close stayed around `2,806,558,720` bytes (`2.61 GiB`) |
| `.memory-runs/run-20260530T144738Z-V54-browser-shenandoah-fullgc-postwork-debug` | debug JDK, Shenandoah SoftMax, `-XX:-ExplicitGCInvokesConcurrent`, NMT enabled | one browser `/all-books`, 2-minute post-browser idle, explicit `jcmd GC.run`, 60-second settle | request completed in `25.806 s`; app peak `1,475,952,640` bytes (`1.37 GiB`), final `1,411,768,320` bytes (`1.31 GiB`); explicit full-GC candidate did not return to low idle |
| `.memory-runs/run-20260530T151225Z-V55-browser-g1-periodic-fullgc-exact-return-idle` | exact image, `-XX:+UseG1GC`, `-Xms64m`, `MaxRAMPercentage=60`, `G1PeriodicGCInterval=5000`, `G1PeriodicGCSystemLoadThreshold=0`, `-G1PeriodicGCInvokesConcurrent`, `MaxHeapFreeRatio=20`, `MinHeapFreeRatio=5`, `-ShrinkHeapInSteps` | one browser `/all-books`, 5-minute post-browser idle | request completed in `24.092 s`; app peak `970,399,744` bytes (`0.90 GiB`), final `488,390,656` bytes (`0.455 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T153027Z-V56-browser-g1-softmax384-periodic-fullgc-exact-return-idle` | exact image, same G1 periodic full-GC profile as V55 plus `SoftMaxHeapSize=384m` | one browser `/all-books`, 5-minute post-browser idle | request completed in `23.723 s`; app peak `933,801,984` bytes (`0.87 GiB`), final `484,089,856` bytes (`0.451 GiB`), no OOM/restart |
| `.memory-runs/run-20260530T154836Z-V57-browser-g1-concurrent-5s-exact-return-idle` | exact image, G1 periodic concurrent cleanup, `G1PeriodicGCInterval=5000`, `MaxHeapFreeRatio=20` | one browser `/all-books`, 5-minute post-browser idle | request completed in `23.628 s`; app peak `964,898,816` bytes (`0.90 GiB`), final `519,647,232` bytes (`0.484 GiB`), no OOM/restart, zero full GCs |
| `.memory-runs/run-20260530T155702Z-V58-browser-g1-full-30s-exact-return-idle` | exact image, G1 periodic full-GC cleanup every 30 seconds, `MaxHeapFreeRatio=20` | one browser `/all-books`, 5-minute post-browser idle | request completed in `23.562 s`; app peak `1,192,378,368` bytes (`1.11 GiB`), final `490,831,872` bytes (`0.457 GiB`), no OOM/restart, 11 full GCs |
| `.memory-runs/run-20260530T160539Z-V59-browser-g1-concurrent-5s-free10-exact-return-idle` | exact image, G1 periodic concurrent cleanup, `G1PeriodicGCInterval=5000`, `MaxHeapFreeRatio=10` | one browser `/all-books`, 5-minute post-browser idle | request completed in `23.680 s`; app peak `1,172,070,400` bytes (`1.09 GiB`), final `481,746,944` bytes (`0.449 GiB`), no OOM/restart, zero full GCs |
| `.memory-runs/run-20260530T161408Z-V60-browser-g1-full-15s-exact-return-idle` | exact image, G1 periodic full-GC cleanup every 15 seconds, `MaxHeapFreeRatio=20` | one browser `/all-books`, 5-minute post-browser idle | request completed in `23.593 s`; app peak `1,061,670,912` bytes (`0.99 GiB`), final `496,939,008` bytes (`0.463 GiB`), no OOM/restart, 23 full GCs |
| `.memory-runs/run-20260530T162241Z-V61-repeat-browser-g1-concurrent-5s-free10-exact-return-idle` | exact image, repeat of V59 G1 periodic concurrent cleanup, `MaxHeapFreeRatio=10` | one browser `/all-books`, 5-minute post-browser idle | request completed in `24.114 s`; app peak `891,719,680` bytes (`0.83 GiB`), final `486,289,408` bytes (`0.453 GiB`), no OOM/restart, zero full GCs |

Interpretation:

- `-Xms64m` is safe in the tested exact-image 50K idle and browser paths, and it does not limit the maximum heap.
- `-Xms64m` alone does not materially improve the final no-browser idle floor versus V40; it mainly avoids declaring a large initial heap. Final no-browser idle was `0.40 GiB` versus V40's `0.375 GiB`.
- `SoftMaxHeapSize=256m` and `384m` reduced startup/full-list peak memory substantially. The one-browser peak fell from `2.11 GiB` in the `-Xms64m` no-soft run to about `1.36-1.38 GiB` with soft max.
- Soft max harmed post-full-list return-to-idle in these runs. Without soft max, the app returned to about `0.43 GiB` after 2 minutes. With `SoftMaxHeapSize=384m`, it was still about `0.88 GiB` after 10 minutes in the exact-image run and about `1.10 GiB` after explicit GC in the debug-JDK run.
- V51 explains why: after the browser closed, heap was only `116 MiB` used but `1,084 MiB` committed. After 10 minutes idle, heap was still `116 MiB` used and `896 MiB` committed. After explicit `jcmd GC.run` plus a 60-second settle, heap was still `116 MiB` used and `856 MiB` committed. The high RSS was committed heap not returned to the OS, not retained full-book objects.
- V52 tested whether standard heap-shrink controls could make SoftMax satisfy the return-to-idle requirement. They did not: exact-image final RSS was still about `1.09 GiB` after 10 minutes.
- V53 tested whether ZGC's elastic heap behavior was a better fit for "minimum idle, grow, return." It failed the first requirement in this app/profile: pre-browser idle was already about `2.36 GiB`.
- V54 tested whether disabling concurrent explicit GC and forcing `jcmd GC.run` could reclaim the wasted heap on demand. It did not return to low idle; final RSS was about `1.31 GiB`.
- V55 tested the JVM feature that directly targets this problem: G1 periodic heap shrinking. It proved the mechanism, but it used the aggressive full-GC mode.
- V56 preserved a GC log for the aggressive full-GC shape. Full periodic GCs happened about every 5 seconds, with pauses from about `52 ms` to `169 ms` and median around `125 ms`.
- V57 tested the web-guided safer path: leave periodic cleanup concurrent. It avoided full GCs entirely and had very small young-GC pauses, but final idle was slightly higher at about `0.484 GiB`.
- V58 and V60 tested less-frequent full-GC cleanup. They returned to low idle, but still introduced repeated full-GC pauses around `125-129 ms` median. That is better than every 5 seconds, but still less attractive than avoiding full GCs if concurrent cleanup is good enough.
- V59 tightened `MaxHeapFreeRatio` to `10` while keeping G1 periodic cleanup concurrent. It returned to `0.449 GiB` final idle with zero full GCs. V61 repeated the same profile and returned to `0.453 GiB` final idle, again with zero full GCs. Young-GC max pauses were about `34 ms` in V59 and `24 ms` in V61.
- Current product-default recommendation: do not default `SoftMaxHeapSize`, and do not use V55's aggressive periodic full-GC profile as the default. Treat the V59/V61 G1 periodic concurrent profile as the leading JVM candidate for Grimmory's desired "minimum idle, grow, return quickly" behavior, pending broader workload validation.

## Runtime Slimming Recommendations

JVM tuning can reduce the heap portion of idle RAM, but it cannot remove the warm framework/runtime floor. The next tier of idle work is slimming the app runtime itself:

- Make OpenAPI/springdoc completely absent from normal runtime if possible, not just disabled at request time.
- Review whether actuator is needed in the production self-hosted image or can be optional.
- Review mail/websocket dependencies for conditional loading. Keep features, but avoid loading large optional stacks before first use where practical.
- Keep Hikari and Tomcat thread counts low; current config is already conservative.
- Keep Hibernate plan cache limits conservative; current config already lowers the broad defaults.
- Test `spring.main.lazy-initialization=true` as an experiment only. It may lower startup memory, but it can move latency and failures to first use, so it needs broad smoke coverage.
- Longer-term, evaluate Spring AOT or native-image only if the project wants a packaging/compatibility project. It could reduce idle memory materially, but it is much larger than changing JVM defaults.

## Current Recommendation

Based on V59 and the V61 repeat, the leading candidate for the desired idle behavior is:

```text
-Xms64m
-XX:MaxRAMPercentage=60.0
-XX:+UseG1GC
-XX:G1PeriodicGCInterval=5000
-XX:G1PeriodicGCSystemLoadThreshold=0
-XX:+G1PeriodicGCInvokesConcurrent
-XX:MaxHeapFreeRatio=10
-XX:MinHeapFreeRatio=5
-XX:-ShrinkHeapInSteps
```

This does not solve the whole half-gigabyte idle baseline. It targets the specific problem from this follow-up: returning free-but-committed heap back to the OS after work is done. It is safer than V55 because it uses concurrent periodic cleanup instead of periodic full GC. In the two tested exact-image 50K browser runs, it returned to about `0.449-0.453 GiB` final idle with no full-GC pauses.

Do not default this:

```text
-XX:SoftMaxHeapSize=384m
```

In the current Shenandoah evidence, soft max is a tradeoff, not a free idle-memory win. It reduces the current `/all-books` peak, but it fails the "hand memory back quickly after the work" requirement because committed heap remains high even when live heap is low.

Adding `SoftMaxHeapSize=384m` to the G1 periodic profile did not show a meaningful extra win in one exact-image check. V56 was healthy and slightly lower than V55 on sampled peak, but the difference was only about `36 MB`; the important behavior still came from G1 periodic heap shrinking.

Also do not default V55 exactly:

```text
-XX:-G1PeriodicGCInvokesConcurrent
```

That flag forces periodic full GC. It proved that G1 can return memory to the OS, but it is unnecessarily pause-heavy now that V59/V61 show the concurrent mode can reach the same idle neighborhood.
