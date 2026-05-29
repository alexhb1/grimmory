# Grimmory Memory Investigation Bundle - 2026-05-29

This folder collects the markdown docs and runnable verification scripts from the 2026-05-29 Grimmory memory investigation.

## Start Here

- `report.md`: the canonical diagnosis, including the high level summary, evidence, fix order.
- `verification-plan.md`: the scriptable verification plan and evidence standard.
- `evidence-log.md`: the run-by-run evidence log.

## Scripts

The `scripts/` directory contains the runnable memory harness scripts for this investigation.

These scripts write durable command files, stdout/stderr logs, exit statuses, Docker state, RSS samples, browser traces, JFR/NMT outputs, and notes into `.memory-runs/`.

Relevant source-level observations are blended into `report.md` and `verification-plan.md`; there is no separate old-analysis or template document in this bundle. This folder is the canonical set.

## Raw Artifacts

Raw evidence is not copied into this bundle because `.memory-runs/` contains large logs, JFRs, browser traces, heap snapshots, and response bodies. The markdown docs cite the exact artifact directories for each finding.
