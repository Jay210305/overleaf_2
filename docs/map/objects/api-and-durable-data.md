---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/api/src/server.ts
sources: ["docs/contracts/http-api.md", "apps/api/src/server.ts", "apps/api/src/main.ts", "apps/api/src/modules/development/sample.ts", "apps/api/src/modules/auth/register.ts", "apps/api/src/modules/auth/verify-email.ts", "apps/api/src/modules/auth/session.ts", "apps/api/src/modules/auth/password-reset.ts", "apps/api/src/modules/auth/routes.ts", "apps/api/src/modules/auth/mail.ts", "apps/api/src/plugins/csrf.ts", "apps/api/src/plugins/require-session.ts", "apps/api/src/plugins/rate-limit.ts", "apps/api/src/plugins/logging.ts", "packages/auth/src/project-policy.ts", "apps/api/src/operator/invite-trusted.ts", "apps/api/src/readiness.ts", "apps/api/src/plugins/errors.ts", "tests/integration/persisted-sample.test.ts", "tests/integration/s02-t01.test.ts", "tests/integration/s02-t02.test.ts", "tests/integration/s02-t03.test.ts", "tests/integration/s02-t04.test.ts", "tests/integration/s02-t06.test.ts", "tests/integration/s02-t09.test.ts", "docs/test-reports/s01-t10.md", "docs/test-reports/s02-t01.md", "docs/test-reports/s02-t02.md", "docs/test-reports/s02-t03.md", "docs/test-reports/s02-t04.md", "docs/test-reports/s02-t06.md", "docs/test-reports/s02-t09.md"]
runtime: implemented
verified_on: 2026-10-11
snapshot: _meta/file-inventory.json
---

# API and Durable Data

## Summary

Fastify serves health routes, a fixture-only development sample, accepted trusted registration, verification, sessions, password recovery and the S02-T04 project guard. S02-T06 adds accepted Redis authentication limits and redacted logs. S02-T09 adds accepted transaction-scoped audit events for account creation, login and session revocation. User-facing project and collaboration routes remain unimplemented.

## Why this shape

The sample checks the API-to-PostgreSQL-to-object-store path before user-facing operations are added; public actions will require server-side authorization.

## Shape

`apps/api/src/server.ts` registers live/ready checks, the development sample and auth routes. The sample is omitted in production and queries only its own fixture project in development. Trusted registration requires an operator-issued email-bound invitation, exact Origin and a custom CSRF header; it stores Argon2id hashes and sends a one-use verification link through SMTP. Verification atomically consumes the hashed token in PostgreSQL. Login issues a hashed opaque session and a separate CSRF secret; session read rotates both under a row lock; logout revokes the row. Recovery stores a hashed expiring token, sends a reset link through SMTP and atomically changes the password while revoking sessions. `require-session.ts` checks current session, Origin/CSRF and PostgreSQL membership for project-scoped routes; a server-owned action is required and the pure `packages/auth` policy decides role access. `rate-limit.ts` uses atomic Redis fixed windows across auth routes and fails closed on outage; `logging.ts` supplies redacted Fastify serializers. Public signup remains disabled. Readiness probes PostgreSQL, Redis, MinIO and Mailpit. The server generates UUID request IDs and redacts errors. It does not expose project CRUD or collaboration.

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
- [Session logic](../../../apps/api/src/modules/auth/session.ts)
- [Password recovery](../../../apps/api/src/modules/auth/password-reset.ts)
- [CSRF checks](../../../apps/api/src/plugins/csrf.ts)
- [Project guard](../../../apps/api/src/plugins/require-session.ts)
- [Role policy](../../../packages/auth/src/project-policy.ts)
- [Rate limiter](../../../apps/api/src/plugins/rate-limit.ts)
- [Log serializers](../../../apps/api/src/plugins/logging.ts)
- [HTTP contract](../../contracts/http-api.md)
- [S01-T10 evidence](../../test-reports/s01-t10.md)
- [S02-T01 evidence](../../test-reports/s02-t01.md)
- [S02-T02 evidence](../../test-reports/s02-t02.md)
- [S02-T03 evidence](../../test-reports/s02-t03.md)
- [S02-T04 evidence](../../test-reports/s02-t04.md)
- [S02-T06 evidence](../../test-reports/s02-t06.md)
- [S02-T09 evidence](../../test-reports/s02-t09.md)
