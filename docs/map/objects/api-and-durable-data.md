---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/api/src/server.ts
sources: ["docs/planning/02-architecture.md", "docs/contracts/http-api.md", "docs/contracts/openapi.json", "docs/contracts/data-model.md", "docs/contracts/collaboration.md", "docs/contracts/storage-and-revisions.md", "apps/api/src/server.ts", "apps/api/src/readiness.ts", "apps/api/src/plugins/errors.ts", "packages/config/src/server.ts", "tests/services/local-services.test.ts"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# API and Durable Data

## Summary

Fastify live/readiness and controlled errors are implemented. PostgreSQL/Redis/private S3/Mailpit readiness is real; domain persistence and collaboration remain planned.

## Why this shape

Saved acknowledgements require durable writes, and permission checks must cover every access surface.

## Shape

API exposes only /api/v1/health/live and /api/v1/health/ready. Readiness probes all four dependencies. UUID request IDs are server-generated, logs omit private request data, and errors reveal no internal details. Future project endpoints remain unavailable.

## Connected to

Produces browser API/ticket contracts and durable updates; revisions are inputs to compilation and provider checkpoints.

## If you change this

- **Hits:** HTTP/OpenAPI, DB model/migrations design, collaboration protocol, revision rules and S01–S09 producer/consumer tasks.
- **Does not hit:** External provider capabilities; changing local persistence does not verify a remote API.

## Surfaces

Node 24 API, Compose services, injected API tests and real dependency/outage checks.

## See

- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/contracts/http-api.md](../../contracts/http-api.md)
- [docs/contracts/openapi.json](../../contracts/openapi.json)
- [docs/contracts/data-model.md](../../contracts/data-model.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
- [docs/contracts/storage-and-revisions.md](../../contracts/storage-and-revisions.md)
