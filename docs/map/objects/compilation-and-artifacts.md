---
type: object
cluster: runtime-design
universe: ghost
status: stub
entity: apps/tex-executor
sources: ["docs/contracts/compilation.md","docs/contracts/storage-and-revisions.md","docs/planning/02-architecture.md","docs/planning/release-and-postmortem.md","docs/planning/07-risks.md"]
runtime: proposed
---

# Compilation and Artifacts

## Summary

The proposed jobs, object storage and separate TeX executor produce private artifacts from immutable revisions.

## Why this shape

Execution and artifacts must preserve source identity, authorization and the trusted/public boundary.

## Shape

Proposed paths: `apps/jobs`, `apps/tex-executor`, `packages/storage`, `infra`. Pinned TeX Live/latexmk and private S3-compatible objects are planned; G1 is trusted execution.

## Connected to

Consumes durable revision manifests; browser preview and integration exports consume authorized artifacts.

## If you change this

- **Hits:** Compilation/storage contracts, S06/S10/S15 tasks, artifact tests and release gates when execution trust changes.
- **Does not hit:** User/role authorization during restore: a content revision must not resurrect ACL state.

## Surfaces

Currently design and release-checklist documents; no executor or object-store implementation is inspected.

## See

- [docs/contracts/compilation.md](../../contracts/compilation.md)
- [docs/contracts/storage-and-revisions.md](../../contracts/storage-and-revisions.md)
- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/planning/release-and-postmortem.md](../../planning/release-and-postmortem.md)
- [docs/planning/07-risks.md](../../planning/07-risks.md)
