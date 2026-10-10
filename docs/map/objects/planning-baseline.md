---
type: object
cluster: planning
universe: live
status: verified
entity: docs/planning/README.md
sources: ["docs/planning/README.md","docs/planning/00-discovery.md","docs/planning/requirements.md","docs/planning/04-implementation-roadmap.md","docs/planning/09-decisions.md","docs/planning/source-manifest.json"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Planning Baseline

## Summary

The English planning package owns approved scope, requirements, unscheduled stages and design decisions.

## Why this shape

Requirements and scope need a stable home independent of individual execution records.

## Shape

The numbered 00–10 documents and supporting requirement/traceability files are operative. The two root Spanish inputs are preserved provenance, with hashes in the source manifest.

## Connected to

Owns requirement IDs and gate definitions. Task Library references these IDs; Progress Records report evidence against them.

## If you change this

- **Hits:** Requirements, traceability, roadmap, affected task frontmatter/acceptance, feature inventory and decision records.
- **Does not hit:** An unchanged original source document; new design decisions belong in the English package.

## Surfaces

Maintainers and planning agents read/write English planning files. Source inputs are read for provenance.

## See

- [docs/planning/README.md](../../planning/README.md)
- [docs/planning/00-discovery.md](../../planning/00-discovery.md)
- [docs/planning/requirements.md](../../planning/requirements.md)
- [docs/planning/04-implementation-roadmap.md](../../planning/04-implementation-roadmap.md)
- [docs/planning/09-decisions.md](../../planning/09-decisions.md)
- [docs/planning/source-manifest.json](../../planning/source-manifest.json)
