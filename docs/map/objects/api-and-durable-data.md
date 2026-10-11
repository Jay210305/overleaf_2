---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/api/src/server.ts
sources: ["docs/contracts/http-api.md", "apps/api/src/server.ts", "apps/api/src/modules/development/sample.ts", "apps/api/src/readiness.ts", "apps/api/src/plugins/errors.ts", "tests/integration/persisted-sample.test.ts", "docs/test-reports/s01-t10.md"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# API and Durable Data

## Summary

Fastify serves health routes and a development-only persisted sample. Production identity, project and collaboration routes remain unimplemented.

## Why this shape

The sample checks the API-to-PostgreSQL-to-object-store path before user-facing operations are added; public actions will require server-side authorization.

## Shape

`apps/api/src/server.ts:38` registers live and ready checks; line 61 registers the sample module. `apps/api/src/modules/development/sample.ts:13` omits that route in production. In development, it reads or creates a PostgreSQL project and reads or creates a MinIO object. Readiness probes PostgreSQL, Redis, MinIO and Mailpit. The server generates UUID request IDs and redacts errors. It does not expose project CRUD or collaboration.

## Connected to

Consumes [Data Model and Persistence](data-model-and-persistence.md) and [Private Object Storage](private-object-storage.md) for the sample. HTTP contracts cover future user-facing routes.

## If you change this

- **Hits:** API route tests, the development sample, DB/storage dependencies and HTTP contracts when a public route is added.
- **Does not hit:** External provider capabilities; changing local persistence does not verify a remote API.

## Surfaces

Node 24 API, Compose services, injected API tests and persisted sample restart tests.

## See

- [Server](../../../apps/api/src/server.ts)
- [Development sample](../../../apps/api/src/modules/development/sample.ts)
- [HTTP contract](../../contracts/http-api.md)
- [S01-T10 evidence](../../test-reports/s01-t10.md)
