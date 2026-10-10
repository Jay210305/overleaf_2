---
type: object
cluster: execution
universe: live
status: verified
entity: docs/progress/progress-log.md
sources: ["docs/progress/progress-log.md","docs/progress/open-gaps.md","docs/progress/technical-debt.md","docs/progress/sprint-00.md","docs/progress/repository-audit.md","docs/adr/compatibility-spike.md","docs/test-reports/s00-t01.md","docs/test-reports/s00-t11.md","docs/test-reports/s00-t02.md","docs/test-reports/s00-t03.md","docs/feature-parity.md"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Progress Records

## Summary

Progress records own observed work, unresolved gaps, debt and requirement completion evidence.

## Why this shape

Plans and estimates must remain distinguishable from actual actions and measured results.

## Shape

A global log, per-stage task matrices, gap/debt files, feature-parity evidence, scoped reports and a candidate compatibility record. Missing credentials and research choices are tracked as gaps rather than invented success.

## Connected to

References Task Library and Planning Baseline; tests/build/runtime evidence must be linked when available.

## If you change this

- **Hits:** Task status, task index/roadmap state and feature evidence when actual completion changes.
- **Does not hit:** Estimate totals when recording observed hours without changing the approved estimate.

## Surfaces

Maintainers and executing agents write observed evidence; reviewers inspect commands/results.

## See

- [docs/progress/progress-log.md](../../progress/progress-log.md)
- [docs/progress/open-gaps.md](../../progress/open-gaps.md)
- [docs/progress/technical-debt.md](../../progress/technical-debt.md)
- [docs/progress/sprint-00.md](../../progress/sprint-00.md)
- [docs/progress/repository-audit.md](../../progress/repository-audit.md)
- [docs/adr/compatibility-spike.md](../../adr/compatibility-spike.md)
- [docs/test-reports/s00-t01.md](../../test-reports/s00-t01.md)
- [docs/test-reports/s00-t11.md](../../test-reports/s00-t11.md)
- [docs/test-reports/s00-t02.md](../../test-reports/s00-t02.md)
- [docs/test-reports/s00-t03.md](../../test-reports/s00-t03.md)
- [docs/feature-parity.md](../../feature-parity.md)
