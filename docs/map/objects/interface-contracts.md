---
type: object
cluster: contracts
universe: live
status: verified
entity: docs/contracts/README.md
sources: ["docs/contracts/README.md","docs/contracts/openapi.json","docs/contracts/data-model.md","docs/contracts/collaboration.md","docs/contracts/compilation.md","docs/contracts/integrations.md"]
runtime: not-applicable
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# Interface Contracts

## Summary

Contract documents own the proposed boundaries between browser, API, collaboration, storage, jobs and executor.

## Why this shape

Producer and consumer tasks must share one interface definition instead of divergent local copies.

## Shape

The contract catalog links data, HTTP/OpenAPI, revisions, collaboration, compilation, editing, integrations and development tooling. Runtime implementation is explicitly NOT_STARTED.

## Connected to

Owned by the planning baseline. Referenced by Task Library and all ghost runtime cards.

## If you change this

- **Hits:** Affected producer/consumer task acceptance, HTTP operation index/OpenAPI examples, data invariants, ADRs and traceability.
- **Does not hit:** Unrelated contract domains when their inputs, outputs and policies do not change.

## Surfaces

Maintainers and implementation agents inspect/change design contracts; later code will provide evidence.

## See

- [docs/contracts/README.md](../../contracts/README.md)
- [docs/contracts/openapi.json](../../contracts/openapi.json)
- [docs/contracts/data-model.md](../../contracts/data-model.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
- [docs/contracts/compilation.md](../../contracts/compilation.md)
- [docs/contracts/integrations.md](../../contracts/integrations.md)
