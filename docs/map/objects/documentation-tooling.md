---
type: object
cluster: tooling
universe: live
status: verified
entity: scripts/plan_lint.py
sources: ["scripts/plan_lint.py","scripts/build_icm_map.py","scripts/CONTEXT.md","docs/map/_meta/schema.md"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Documentation Tooling

## Summary

Local Python scripts validate planning structure and regenerate ICM catalogs and source snapshots.

## Why this shape

Generated outputs and cross-file consistency need reproducible tooling rather than hand-edited indexes.

## Shape

plan_lint.py checks tasks, links, source preservation and API examples. build_icm_map.py writes map twins/index/inventory and has a read-only --check mode. The inventory excludes installed dependencies, generated build output and local pnpm cache/store/temp directories.

## Connected to

Reads planning/tasks/contracts plus authored map cards; outputs documentation metadata only.

## If you change this

- **Hits:** Validation instructions, schema assumptions, generated map outputs and related agent routing.
- **Does not hit:** Application build, integration, compiler or public-isolation evidence; documentation checks cannot establish them.

## Surfaces

Maintainers/agents run Python scripts; scripts operate inside the repository without external dependencies or network.

## See

- [scripts/plan_lint.py](../../../scripts/plan_lint.py)
- [scripts/build_icm_map.py](../../../scripts/build_icm_map.py)
- [scripts/CONTEXT.md](../../../scripts/CONTEXT.md)
- [docs/map/_meta/schema.md](../_meta/schema.md)
