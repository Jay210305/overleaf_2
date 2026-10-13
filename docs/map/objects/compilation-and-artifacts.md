---
type: object
cluster: runtime-design
universe: ghost
status: stub
entity: apps/tex-executor
sources: ["docs/contracts/compilation.md", "docs/contracts/storage-and-revisions.md", "docs/planning/02-architecture.md", "docs/planning/release-and-postmortem.md", "docs/planning/07-risks.md", "packages/db/migrations/0001-core.sql", "packages/contracts/src/storage.ts", "apps/jobs/src/main.ts"]
runtime: proposed
---

# Compilation and Artifacts

## Summary

Compilation jobs, artifact authorization and the separate TeX executor are proposed. A private `apps/jobs` process now runs S05 upload/object cleanup; it does not execute compilation. The private object adapter is mapped separately as live code.

## Why this shape

Execution and artifacts must preserve source identity, authorization and the trusted/public boundary.

## Shape

Proposed compilation path: `apps/tex-executor` plus future compile handlers in `apps/jobs`. The database has `compile_jobs` and `artifact_sets` tables (`packages/db/migrations/0001-core.sql:234`), and [Private Object Storage](private-object-storage.md) has an S3 adapter, but no compilation execution or PDF generation exists. Pinned TeX Live/latexmk remains S06 work; G1 is trusted execution.

## Connected to

Future jobs consume immutable revision manifests; browser preview and integration exports will consume authorized artifacts.

## If you change this

- **Hits:** Compilation/storage contracts, S06/S10/S15 tasks, artifact tests and release gates when execution trust changes.
- **Does not hit:** User/role authorization during restore: a content revision must not resurrect ACL state.

## Surfaces

Design and release-checklist documents plus future job/artifact consumers. No executor or generated PDF has been verified.

## See

- [docs/contracts/compilation.md](../../contracts/compilation.md)
- [docs/contracts/storage-and-revisions.md](../../contracts/storage-and-revisions.md)
- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/planning/release-and-postmortem.md](../../planning/release-and-postmortem.md)
- [docs/planning/07-risks.md](../../planning/07-risks.md)
