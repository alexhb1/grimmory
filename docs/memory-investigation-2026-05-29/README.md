# Grimmory Memory Investigation Bundle - 2026-05-29

This folder collects the markdown docs and runnable verification scripts from the 2026-05-29 Grimmory memory investigation.

## Start Here

- `report.md`: the standalone diagnosis. Start here for the plain-English findings, measured memory impact, causes, and fix order.
- `verification-plan.md`: the scriptable verification plan and evidence standard for future reruns.
- `evidence-log.md`: the technical run ledger. It references local raw artifact directories that are not included in this folder.

## Scripts

The `scripts/` directory contains the runnable memory harness scripts for this investigation.

These scripts write durable command files, stdout/stderr logs, exit statuses, Docker state, RSS samples, browser traces, JFR/NMT outputs, and notes into a local run-artifact directory when executed.

Relevant source-level observations are blended into `report.md` and `verification-plan.md`; there is no separate old-analysis or template document in this bundle. This folder is the canonical set.

## Raw Artifacts

Raw evidence is not copied into this bundle because the local run artifacts contain large logs, JFRs, browser traces, heap snapshots, and response bodies. `report.md` is written to stand on its own without requiring those files. `evidence-log.md` is retained for anyone running the investigation on the same machine or repeating it with the scripts.
