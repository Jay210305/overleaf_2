---
type: process
universe: live
status: verified
sources: ["scripts/build_icm_map.py", "docs/map/CONTEXT.md", "docs/map/_meta/schema.md"]
consumes: ["agent-guidance", "documentation-tooling", "planning-baseline", "interface-contracts", "task-library", "progress-records"]
produces: ["documentation-tooling", "agent-guidance"]
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Map Refresh

## Input → Movement → Output

Input: authored catalog/cards and their cited source files. Movement: review direct relationships, update citations, and run the map builder. Output: synchronized catalog twins, a generated object index and a hashed file inventory.

## Why this shape

Generated navigation can be rebuilt while the cited repository files remain the factual owners.

## Steps

1. Read [Map Context](../CONTEXT.md) and [Schema](../_meta/schema.md).
2. Inspect the changed source and affected cards, updating universe/status only with evidence.
3. Run [build_icm_map.py](../../../scripts/build_icm_map.py). It validates metadata/paths and generates indexes; it does not audit semantic claims.
4. Run its `--check` mode and the planning validator through [Scripts Context](../../../scripts/CONTEXT.md).
5. Cold-walk root entry → catalog → one card → source, and review the scope of impact.

## If you change this

- **Hits:** card schema, generator outputs, catalog twins and documentation validation instructions.
- **Does not hit:** original source hashes or product feature status.

## Surfaces

Maintainers/agents edit authored files; the local Python builder writes only designated map metadata/catalog outputs.

## See

- [Tooling](../objects/documentation-tooling.md), [Agent Guidance](../objects/agent-guidance.md).
- Source: [Map Builder](../../../scripts/build_icm_map.py).
