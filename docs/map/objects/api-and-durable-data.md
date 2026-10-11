---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/api/src/server.ts
sources: ["docs/contracts/http-api.md", "apps/api/src/server.ts", "apps/api/src/modules/development/sample.ts", "apps/api/src/modules/auth/register.ts", "apps/api/src/modules/auth/verify-email.ts", "apps/api/src/modules/auth/routes.ts", "apps/api/src/modules/auth/mail.ts", "apps/api/src/operator/invite-trusted.ts", "apps/api/src/readiness.ts", "apps/api/src/plugins/errors.ts", "tests/integration/persisted-sample.test.ts", "tests/integration/s02-t01.test.ts", "docs/test-reports/s01-t10.md", "docs/test-reports/s02-t01.md"]
runtime: implemented
verified_on: 2026-10-10
snapshot: _meta/file-inventory.json
---

# API and Durable Data

## Summary

Fastify serves health routes, a development-only persisted sample, and an in-progress trusted registration and email-verification slice. Sessions, project and collaboration routes remain unimplemented.

## Why this shape

The sample checks the API-to-PostgreSQL-to-object-store path before user-facing operations are added; public actions will require server-side authorization.

## Shape

`apps/api/src/server.ts` registers live/ready checks, the development sample and S02-T01 auth routes. The sample is omitted in production. Trusted registration requires an operator-issued email-bound invitation, exact Origin and a custom CSRF header; it stores Argon2id hashes and sends a one-use verification link through SMTP. Verification atomically consumes the hashed token in PostgreSQL. Public signup remains disabled. Readiness probes PostgreSQL, Redis, MinIO and Mailpit. The server generates UUID request IDs and redacts errors. It does not expose login, project CRUD or collaboration.

## Connected to

Consumes [Data Model and Persistence](data-model-and-persistence.md) for users and tokens and [Private Object Storage](private-object-storage.md) for the sample. HTTP contracts cover this trusted G1 slice and future routes.

## If you change this

- **Hits:** API route tests, trusted invitation and mail handling, DB/storage dependencies, CORS policy and HTTP contracts when a route is added.
- **Does not hit:** External provider capabilities; changing local persistence does not verify a remote API.

## Surfaces

Node 24 API, Compose services, injected API tests and persisted sample restart tests.

## See

- [Server](../../../apps/api/src/server.ts)
- [Development sample](../../../apps/api/src/modules/development/sample.ts)
- [Registration](../../../apps/api/src/modules/auth/register.ts)
- [Verification](../../../apps/api/src/modules/auth/verify-email.ts)
- [HTTP contract](../../contracts/http-api.md)
- [S01-T10 evidence](../../test-reports/s01-t10.md)
- [S02-T01 evidence](../../test-reports/s02-t01.md)
