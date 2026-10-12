---
type: object
cluster: runtime-design
universe: live
status: verified
entity: packages/db/src/client.ts
sources: ["packages/db/src/client.ts", "packages/db/src/repositories/projects.ts", "packages/db/src/repositories/audit.ts", "packages/db/src/schema/core.ts", "packages/db/src/schema/collaboration.ts", "packages/db/src/schema/integrations.ts", "packages/db/migrations/0001-core.sql", "packages/db/migrations/0002-support.sql", "packages/db/migrations/0003-session-security.sql", "packages/db/seeds/development.ts", "docs/progress/sprint-01.md", "docs/test-reports/s01-t07.md", "docs/test-reports/s02-t02.md", "docs/test-reports/s02-t09.md", "docs/test-reports/s02-t07.md"]
runtime: implemented
verified_on: 2026-10-11
snapshot: _meta/file-inventory.json
---

# Data Model and Persistence

## Summary

S01 supplies typed Drizzle entities, two PostgreSQL migrations, transaction primitives, a project list repository and isolated development seed data. S02-T02 adds a session-security migration. S02-T09 adds a scoped audit writer using the existing support migration. S02-T07 uses the existing user preferences and sessions tables for profile settings and inventory.

## Why this shape

Database constraints and transactions establish durable boundaries for later identity, project, collaboration and revision services.

## Shape

`packages/db/src/schema/core.ts` defines users, sessions, projects, nodes, revisions, jobs and artifacts. `collaboration.ts` and `integrations.ts` define support entities. Migrations `0001-core.sql` and `0002-support.sql` create their PostgreSQL tables and constraints; `0003-session-security.sql` adds creation time and CSRF hash to sessions. `packages/db/src/client.ts` wraps pooled queries and transactions, maps SQLSTATE failures, and preserves application errors raised inside transactions. `packages/db/src/repositories/projects.ts` lists owned/shared/recent projects with cursor pagination. `repositories/audit.ts` inserts allowlisted actions with generated request IDs and empty redacted metadata inside the caller's transaction. These schemas do not implement Yjs update commits, user-facing project CRUD or access checks for every action.

## Connected to

The [API](api-and-durable-data.md) uses this package for its development sample; [Private Object Storage](private-object-storage.md) holds object bytes referenced by future revisions. The [Compilation](compilation-and-artifacts.md) card remains proposed.

## If you change this

- **Hits:** Corresponding SQL migration, Drizzle schema, repository code, seed/fixtures, S01 constraint tests and data/HTTP contracts.
- **Does not hit:** TeX executor isolation; database constraints do not prove safe compilation.

## Surfaces

API and future services read/write PostgreSQL; maintainers run migrations, seeds and integration tests.

## See

- [Database client](../../../packages/db/src/client.ts)
- [Core schema](../../../packages/db/src/schema/core.ts)
- [Core migration](../../../packages/db/migrations/0001-core.sql)
- [Session migration](../../../packages/db/migrations/0003-session-security.sql)
- [Audit writer](../../../packages/db/src/repositories/audit.ts)
- [S02-T09 evidence](../../test-reports/s02-t09.md)
- [S02-T07 evidence](../../test-reports/s02-t07.md)
- [S01 progress](../../progress/sprint-01.md)
