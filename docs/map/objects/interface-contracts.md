---
type: object
cluster: contracts
universe: live
status: verified
entity: docs/contracts/README.md
sources: ["docs/contracts/README.md","docs/contracts/http-api.md","docs/contracts/openapi.json","docs/api/openapi.json","docs/contracts/data-model.md","docs/contracts/storage-and-revisions.md","docs/contracts/collaboration.md","docs/contracts/compilation.md","docs/contracts/integrations.md","packages/contracts/src/index.ts","packages/contracts/src/storage.ts","packages/auth/src/project-policy.ts","tests/integration/s01-t05.test.ts","docs/test-reports/s01-t05.md","docs/test-reports/s02-t02.md","docs/test-reports/s02-t03.md","docs/test-reports/s02-t04.md","docs/test-reports/s02-t06.md","docs/test-reports/s02-t07.md","docs/test-reports/s02-t10.md","docs/test-reports/s02-t11.md","docs/test-reports/s05-t01.md","docs/adr/010-invitation-tokens.md","docs/test-reports/s08-t01.md","docs/adr/011-share-link-grants.md","docs/test-reports/s08-t02.md","apps/api/src/modules/sharing/members.ts","docs/test-reports/s08-t03.md"]
runtime: not-applicable
verified_on: 2026-10-15
snapshot: _meta/file-inventory.json
---

# Interface Contracts

## Summary

Contract documents own the intended boundaries between browser, API, collaboration, storage, jobs and executor. S01 implements a subset as Zod DTOs and TypeScript storage/revision types.

## Why this shape

Producer and consumer tasks must share one interface definition instead of divergent local copies.

## Shape

The catalog links data, HTTP/OpenAPI, revisions, collaboration, compilation, editing, integrations and development tooling. `packages/contracts/src/index.ts` defines Zod DTOs, including S05 upload and S08 invitation/share-link request/result schemas; `storage.ts` defines object and revision types plus a bounded read. Contract version 3.0.0 and ADR-010/011 move invitation and share-link tokens from URL paths to JSON bodies. Both static OpenAPI copies describe these slices as IN_PROGRESS. The S01-T05 test checks file existence, version and path count, but does not prove generation or DTO parity; see [GAP-12](../../progress/open-gaps.md).

## Connected to

Owned by the planning baseline. Referenced by Task Library and the live API, data and storage cards, as well as ghost runtime cards.

## If you change this

- **Hits:** Affected producer/consumer task acceptance, HTTP operation index/OpenAPI examples, data invariants, ADRs and traceability.
- **Does not hit:** Unrelated contract domains when their inputs, outputs and policies do not change.

## Surfaces

Maintainers and implementation agents inspect/change design contracts and scoped typed code; later services must provide behavior evidence.

## See

- [docs/contracts/README.md](../../contracts/README.md)
- [S02-T07 evidence](../../test-reports/s02-t07.md)
- [S02-T10 evidence](../../test-reports/s02-t10.md)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
- [S05-T01 evidence](../../test-reports/s05-t01.md)
- [docs/contracts/openapi.json](../../contracts/openapi.json)
- [Planned API JSON](../../api/openapi.json)
- [docs/contracts/data-model.md](../../contracts/data-model.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
- [docs/contracts/compilation.md](../../contracts/compilation.md)
- [docs/contracts/integrations.md](../../contracts/integrations.md)
- [Typed DTOs](../../../packages/contracts/src/index.ts)
- [Storage types](../../../packages/contracts/src/storage.ts)
- [Invitation token decision](../../adr/010-invitation-tokens.md)
- [S08-T01 evidence](../../test-reports/s08-t01.md)
- [Share-link token decision](../../adr/011-share-link-grants.md)
- [S08-T02 evidence](../../test-reports/s08-t02.md)
