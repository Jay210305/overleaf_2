---
type: object
cluster: runtime-design
universe: live
status: verified
entity: packages/db/src/client.ts
sources: ["packages/db/src/client.ts","packages/db/src/repositories/projects.ts","packages/db/src/repositories/audit.ts","packages/db/src/schema/core.ts","packages/db/src/schema/collaboration.ts","packages/db/src/schema/integrations.ts","packages/db/migrations/0001-core.sql","packages/db/migrations/0002-support.sql","packages/db/migrations/0003-session-security.sql","packages/db/migrations/0004-avatar-cleanup.sql","packages/db/migrations/0005-upload-intents.sql","packages/db/seeds/development.ts","docs/progress/sprint-01.md","docs/test-reports/s01-t07.md","docs/test-reports/s02-t02.md","docs/test-reports/s02-t09.md","docs/test-reports/s02-t07.md","docs/test-reports/s02-t11.md","docs/test-reports/s05-t01.md","docs/test-reports/s05-t09.md","packages/db/migrations/0009-project-invitations.sql","docs/test-reports/s08-t01.md","packages/db/migrations/0010-share-link-grants.sql","docs/test-reports/s08-t02.md","packages/db/migrations/0013-github-sync-base.sql","docs/test-reports/s12-t03.md"]
runtime: implemented
verified_on: 2026-10-16
snapshot: _meta/file-inventory.json
---

# Data Model and Persistence

## Summary

S01 supplies typed Drizzle entities, PostgreSQL migrations, transaction primitives, a project list repository and isolated development seed data. S02 adds session security, scoped audit writing and avatar cleanup. S05-T01 adds a durable pending-upload intent table; its deployment migration wiring remains open.

## Why this shape

Database constraints and transactions establish durable boundaries for later identity, project, collaboration and revision services.

## Shape

`packages/db/src/schema/core.ts` defines users, sessions, projects, nodes, revisions, jobs, artifacts and pending upload intents. `collaboration.ts` and `integrations.ts` define support entities. `0005-upload-intents.sql` binds a staging key, expected metadata, actor and project to a single completion, and cascades removal when a completed node is physically deleted. `packages/db/src/client.ts` wraps pooled queries and transactions and preserves application errors raised inside them. The S05 upload route creates its node, initial Yjs update and project revision increment in one transaction. The repository does not yet expose a production migration runner; see [GAP-15](../../progress/open-gaps.md).

`0014-frozen-revision-content.sql` removes the `revision_items.node_id` delete cascade and adds frozen canonical text bytes, kind/size/MIME and immutable manifest JSON. The S05-T09 regression now proves a historical item survives physical node deletion; GC still keeps its conservative retention rule pending cleanup review. The revision reader and source export use frozen rows, and GitHub push rejects unverified legacy data; see [GAP-17/GAP-33](../../progress/open-gaps.md).

S05-T10 adds `0008-import-project-reservation.sql`: a unique pending project ID on a validated import job, an auditable manifest after success, and apply/retention indexes. The private apply worker commits project metadata, parent-first nodes, text documents with one Yjs update each, and the successful job transition under one PostgreSQL transaction. Its reservation survives a failed pre-commit object write, so retry uses the same project ID; see [S05-T10 evidence](../../test-reports/s05-t10.md).

S08-T01 adds `0009-project-invitations.sql` for lifecycle timestamps, role restrictions and a unique pending invitation per project/email. The invitation API holds project and invitation row locks during redemption and stores only the token hash. S08-T02 adds `0010-share-link-grants.sql`, which records the source link for redeemed memberships and exposes `active_project_members` to exclude expired or revoked link grants from authorization reads. Local integration tests apply these migrations; production migration ordering remains GAP-15.

S12-T03 adds `0013-github-sync-base.sql`: a nullable `sync_base_manifest` jsonb on `project_integrations` recording the last agreed local file fingerprints and remote SHAs for a linked GitHub integration. Pull planning classifies three-way against it and degrades to conservative conflict surfacing when it is absent; production migration ordering remains GAP-15.

S12-T05 adds `0015-github-sync-requests.sql` to persist sync idempotency claims and completed results per project/actor/key. S12-T06 adds `0016-revision-export-links.sql` to bind a one-hour link ID to a project, frozen revision, kind and optional compile job. The API rechecks membership/role on every link read; expiry is indexed for later cleanup. Local PostgreSQL route tests apply both migrations; production migration ordering remains GAP-15.

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
- [Share-link grant migration](../../../packages/db/migrations/0010-share-link-grants.sql)
- [S08-T02 evidence](../../test-reports/s08-t02.md)
- [GitHub sync base migration](../../../packages/db/migrations/0013-github-sync-base.sql)
- [Frozen revision migration](../../../packages/db/migrations/0014-frozen-revision-content.sql)
- [S12-T03 evidence](../../test-reports/s12-t03.md)
- [S12-T04 evidence](../../test-reports/s12-t04.md)
