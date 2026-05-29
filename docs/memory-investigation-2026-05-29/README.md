# Grimmory Memory Investigation Bundle - 2026-05-29

This folder collects the markdown docs and runnable verification scripts from the 2026-05-29 Grimmory memory investigation.

## Start Here

- `docs/memory-use-combined-diagnosis-2026-05-29.md`: main diagnosis, now including the high level summary.
- `docs/memory-verification-plan-2026-05-29.md`: scriptable verification plan and evidence standard.
- `docs/memory-verification-progress-2026-05-29.md`: run-by-run evidence log.
- `docs/memory-investigation-2026-05-29.md`: chronological investigation log and prioritized findings.
- `docs/memory-use-combined-diagnosis-blank-verification-2026-05-29.md`: reusable copy with verification sections blank.

## Scripts

The `scripts/` directory contains the runnable memory harness scripts for this investigation.

These scripts write durable command files, stdout/stderr logs, exit statuses, Docker state, RSS samples, browser traces, JFR/NMT outputs, and notes into `.memory-runs/`.

The original GPT-5.5 code audit is folded into `docs/memory-use-combined-diagnosis-2026-05-29.md` as the `5.5 Pro details`, overlap map, and unverified pressure-point backlog. The latest bundle is the canonical set.

## Raw Artifacts

Raw evidence is not copied into this bundle because `.memory-runs/` contains large logs, JFRs, browser traces, heap snapshots, and response bodies. The markdown docs cite the exact artifact directories for each finding.
