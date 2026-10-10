---
type: object
cluster: runtime-design
universe: ghost
status: stub
entity: apps/api
sources: ["docs/planning/02-architecture.md","docs/contracts/http-api.md","docs/contracts/openapi.json","docs/contracts/data-model.md","docs/contracts/collaboration.md","docs/contracts/storage-and-revisions.md"]
runtime: proposed
---

# API and Durable Data

## Summary

The proposed API, database and collaboration services authorize access and persist canonical project content.

## Why this shape

Saved acknowledgements require durable writes, and permission checks must cover every access surface.

## Shape

`apps/api/package.json` and `packages/contracts/package.json` are now inspected workspace manifests. API source and proposed `apps/collab`, `packages/db` and `packages/auth` remain absent. Fastify, Drizzle/PostgreSQL and Hocuspocus are planned.

## Connected to

Produces browser API/ticket contracts and durable updates; revisions are inputs to compilation and provider checkpoints.

## If you change this

- **Hits:** HTTP/OpenAPI, DB model/migrations design, collaboration protocol, revision rules and S01–S09 producer/consumer tasks.
- **Does not hit:** External provider capabilities; changing local persistence does not verify a remote API.

## Surfaces

The API manifest resolves local shared package manifests; API/collaboration/data runtime code remains proposed.

## See

- [docs/planning/02-architecture.md](../../planning/02-architecture.md)
- [docs/contracts/http-api.md](../../contracts/http-api.md)
- [docs/contracts/openapi.json](../../contracts/openapi.json)
- [docs/contracts/data-model.md](../../contracts/data-model.md)
- [docs/contracts/collaboration.md](../../contracts/collaboration.md)
- [docs/contracts/storage-and-revisions.md](../../contracts/storage-and-revisions.md)
