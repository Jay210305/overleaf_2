---
type: object
cluster: runtime-design
universe: live
status: verified
entity: packages/db/src/client.ts
sources: ["packages/db/src/client.ts", "packages/db/src/repositories/projects.ts", "packages/db/src/repositories/audit.ts", "packages/db/src/schema/core.ts", "packages/db/src/schema/collaboration.ts", "packages/db/src/schema/integrations.ts", "packages/db/migrations/0001-core.sql", "packages/db/migrations/0002-support.sql", "packages/db/migrations/0003-session-security.sql", "packages/db/migrations/0004-avatar-cleanup.sql", "packages/db/migrations/0005-upload-intents.sql", "packages/db/seeds/development.ts", "docs/progress/sprint-01.md", "docs/test-reports/s01-t07.md", "docs/test-reports/s02-t02.md", "docs/test-reports/s02-t09.md", "docs/test-reports/s02-t07.md", "docs/test-reports/s02-t11.md", "docs/test-reports/s05-t01.md", "docs/test-reports/s05-t09.md", "packages/db/migrations/0009-project-invitations.sql", "docs/test-reports/s08-t01.md"]
runtime: implemented
verified_on: 2026-10-14
snapshot: _meta/file-inventory.json
---

# Data Model and Persistence

## Summary

S01 supplies typed Drizzle entities, PostgreSQL migrations, transaction primitives, a project list repository and isolated development seed data. S02 adds session security, scoped audit writing and avatar cleanup. S05-T01 adds a durable pending-upload intent table; its deployment migration wiring remains open.

## Why this shape

Database constraints and transactions establish durable boundaries for later identity, project, collaboration and revision services.

## Shape

`packages/db/src/schema/core.ts` defines users, sessions, projects, nodes, revisions, jobs, artifacts and pending upload intents. `collaboration.ts` and `integrations.ts` define support entities. `0005-upload-intents.sql` binds a staging key, expected metadata, actor and project to a single completion, and cascades removal when a completed node is physically deleted. `packages/db/src/client.ts` wraps pooled queries and transactions and preserves application errors raised inside them. The S05 upload route creates its node, initial Yjs update and project revision increment in one transaction. The repository does not yet expose a production migration runner; see [GAP-15](../../progress/open-gaps.md).

`revision_items.node_id` currently cascades on physical node deletion, which can erase a surviving revision's blob reference. S05-T09 proves this with a regression and retains all blobs in any project with a revision; [GAP-17](../../progress/open-gaps.md) tracks a durable schema correction.

S05-T10 adds `0008-import-project-reservation.sql`: a unique pending project ID on a validated import job, an auditable manifest after success, and apply/retention indexes. The private apply worker commits project metadata, parent-first nodes, text documents with one Yjs update each, and the successful job transition under one PostgreSQL transaction. Its reservation survives a failed pre-commit object write, so retry uses the same project ID; see [S05-T10 evidence](../../test-reports/s05-t10.md).

S08-T01 adds `0009-project-invitations.sql` for lifecycle timestamps, role restrictions and a unique pending invitation per project/email. The invitation API holds project and invitation row locks during redemption and stores only the token hash. Local integration tests apply this migration; production migration ordering remains GAP-15.

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
- [Avatar cleanup migration](../../../packages/db/migrations/0004-avatar-cleanup.sql)
- [S02-T11 evidence](../../test-reports/s02-t11.md)
- [Upload intent migration](../../../packages/db/migrations/0005-upload-intents.sql)
- [S05-T01 evidence](../../test-reports/s05-t01.md)
- [S01 progress](../../progress/sprint-01.md)
- [Invitation migration](../../../packages/db/migrations/0009-project-invitations.sql)
- [S08-T01 evidence](../../test-reports/s08-t01.md)
