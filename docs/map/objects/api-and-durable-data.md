---
type: object
cluster: runtime-design
universe: live
status: verified
entity: apps/api/src/server.ts
sources: ["docs/contracts/http-api.md", "apps/api/src/server.ts", "apps/api/src/main.ts", "apps/api/src/modules/development/sample.ts", "apps/api/src/modules/auth/register.ts", "apps/api/src/modules/auth/verify-email.ts", "apps/api/src/modules/auth/session.ts", "apps/api/src/modules/auth/password-reset.ts", "apps/api/src/modules/auth/routes.ts", "apps/api/src/modules/account/profile.ts", "apps/api/src/modules/account/password-change.ts", "apps/api/src/modules/account/avatar.ts", "apps/api/src/modules/uploads/routes.ts", "apps/api/src/modules/auth/mail.ts", "apps/api/src/plugins/csrf.ts", "apps/api/src/plugins/require-session.ts", "apps/api/src/plugins/rate-limit.ts", "apps/api/src/plugins/logging.ts", "packages/auth/src/project-policy.ts", "apps/api/src/operator/invite-trusted.ts", "apps/api/src/readiness.ts", "apps/api/src/plugins/errors.ts", "tests/integration/persisted-sample.test.ts", "tests/integration/s02-t01.test.ts", "tests/integration/s02-t02.test.ts", "tests/integration/s02-t03.test.ts", "tests/integration/s02-t04.test.ts", "tests/integration/s02-t06.test.ts", "tests/integration/s02-t09.test.ts", "tests/integration/s02-t07.test.ts", "tests/integration/s02-t10.test.ts", "tests/integration/s02-t11.test.ts", "tests/integration/s02-t08.test.ts", "tests/integration/s05-t01.test.ts", "tests/security/auth-tenancy.test.ts", "docs/test-reports/s01-t10.md", "docs/test-reports/s02-t01.md", "docs/test-reports/s02-t02.md", "docs/test-reports/s02-t03.md", "docs/test-reports/s02-t04.md", "docs/test-reports/s02-t06.md", "docs/test-reports/s02-t09.md", "docs/test-reports/s02-t07.md", "docs/test-reports/s02-t10.md", "docs/test-reports/s02-t11.md", "docs/test-reports/s02-t08.md", "docs/test-reports/s05-t01.md", "apps/api/src/modules/sharing/invitations.ts", "docs/test-reports/s08-t01.md"]
runtime: implemented
verified_on: 2026-10-14
snapshot: _meta/file-inventory.json
---

# API and Durable Data

## Summary

Fastify serves health, development sample, identity/account, project, file and text routes. S05-T01 adds presign and completion routes for verified uploads. S08-T01 adds project invitation creation, listing, revocation and one-use acceptance/rejection. Its scoped tests pass; independent review is pending. S02-T08 accepted tests verify REST tenancy, revocation, suspension and CSRF behavior.

## Why this shape

The sample checks the API-to-PostgreSQL-to-object-store path before user-facing operations are added; public actions will require server-side authorization.

## Shape

`apps/api/src/server.ts` registers live/ready checks, development, identity, account, project, file, text and upload routes. `require-session.ts` checks current session, Origin/CSRF and PostgreSQL membership for project-scoped routes; a server-owned action is required and the pure `packages/auth` policy decides role access. `rate-limit.ts` uses Redis for auth routes and `logging.ts` supplies redacted serializers. Public signup remains disabled. `modules/uploads/routes.ts` verifies EDIT permission and strict metadata before a short private staging PUT, then checks backend bytes, current permission and target under a transaction before creating one Yjs text or binary node. Expired staging cleanup is S05-T09 work.

`modules/account/profile.ts` serves current-user profile/preferences and session inventory. Its writes recheck the current session and CSRF under a transaction; selected revocations write audit events. The shared Redis limiter also covers these routes.

`modules/account/password-change.ts` verifies the current password and session CSRF, then atomically replaces the Argon2id hash, consumes pending recovery tokens, revokes other sessions and audits those revocations.

`modules/account/avatar.ts` validates bounded PNG bytes, stores a user-scoped private object, updates the profile under a row lock and queues the prior key for deletion. The content route reads only the authenticated user's database key; a bounded worker retries old-object cleanup.

`modules/sharing/invitations.ts` restricts invite management to the current project owner, rechecks session and CSRF within transactions, sends a secret through SMTP, stores only its hash, and atomically consumes acceptance or rejection. Redemption requires the currently verified account matching the invitation email. The URL fragment and JSON body keep the secret out of route paths and query strings; the Redis limiter covers invite writes.

## Connected to

Consumes [Data Model and Persistence](data-model-and-persistence.md) for upload intents and nodes and [Private Object Storage](private-object-storage.md) for staged and verified bytes. HTTP contracts cover the implemented upload slice and future routes.

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
- [Profile and sessions](../../../apps/api/src/modules/account/profile.ts)
- [S02-T07 evidence](../../test-reports/s02-t07.md)
- [Password change](../../../apps/api/src/modules/account/password-change.ts)
- [S02-T10 evidence](../../test-reports/s02-t10.md)
- [Avatar routes and cleanup](../../../apps/api/src/modules/account/avatar.ts)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
- [Upload routes](../../../apps/api/src/modules/uploads/routes.ts)
- [S05-T01 evidence](../../test-reports/s05-t01.md)
- [S02-T08 tenancy verification](../../../tests/security/auth-tenancy.test.ts)
- [S02-T08 evidence](../../test-reports/s02-t08.md)
- [Invitation routes](../../../apps/api/src/modules/sharing/invitations.ts)
- [S08-T01 evidence](../../test-reports/s08-t01.md)
