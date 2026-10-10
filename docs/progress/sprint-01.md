# S01 — Data and typed interfaces

**Status:** DONE | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 72 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S01-T01](../../implementation/sprint-01-data-contracts/S01-T01-define-core-drizzle-entities.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t01.md); `tests/integration/s01-t01.test.ts` PASS |
| [S01-T02](../../implementation/sprint-01-data-contracts/S01-T02-create-sql-migrations-and-constraints.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t02.md); `tests/integration/s01-t02.test.ts` PASS |
| [S01-T03](../../implementation/sprint-01-data-contracts/S01-T03-create-transaction-and-repository-primitives.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t03.md); `tests/integration/s01-t03.test.ts` PASS |
| [S01-T04](../../implementation/sprint-01-data-contracts/S01-T04-define-future-collaboration-and-integration-tables.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t04.md); `tests/integration/s01-t04.test.ts` PASS |
| [S01-T09](../../implementation/sprint-01-data-contracts/S01-T09-complete-support-entity-migration-slices.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t09.md); `tests/integration/s01-t09.test.ts` PASS |
| [S01-T05](../../implementation/sprint-01-data-contracts/S01-T05-implement-zod-dtos-and-openapi-generation.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t05.md); `tests/integration/s01-t05.test.ts` PASS |
| [S01-T06](../../implementation/sprint-01-data-contracts/S01-T06-create-isolated-seeds-and-fixtures.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t06.md); `tests/integration/s01-t06.test.ts` PASS |
| [S01-T07](../../implementation/sprint-01-data-contracts/S01-T07-test-constraints-rollback-and-naming-races.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t07.md); `tests/integration/database-constraints.test.ts` PASS |
| [S01-T08](../../implementation/sprint-01-data-contracts/S01-T08-create-private-s3-adapter.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t08.md); `tests/integration/s01-t08.test.ts` PASS |
| [S01-T10](../../implementation/sprint-01-data-contracts/S01-T10-deliver-persisted-development-sample-vertical-slice.md) | DONE | Not measured | [Report](../../docs/test-reports/s01-t10.md); `tests/integration/persisted-sample.test.ts` PASS |

## Sprint Execution Evidence

- **Branch:** `codex/sprint-01-data-contracts` (tracking `origin/codex/sprint-01-data-contracts`)
- **Base commit:** `644c6f0284b1f840909657b7563736dc1823d25e` (`feature/sprint-00` closure)
- **Publication status:** Published to origin with upstream tracking before implementation per `AGENTS.md`.

## Decisions and Migrations

1. Created packages `@latex-collab/db`, `@latex-collab/storage`, and `@latex-collab/test-utils`.
2. Applied SQL migrations `0001-core.sql` and `0002-support.sql` to PostgreSQL 17 database.
3. Created immutable revision contracts and `StorageAdapter` in `@latex-collab/contracts`.
4. Implemented `S3StorageAdapter` with key validation and tenant scoping against local MinIO.
5. Implemented development vertical slice route `/api/v1/development/sample` guarded against production exposure.

## Validation

- `pnpm exec vitest run` passes with 100% test success across all integration and regression test suites.
- `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.
- Planning validation (`scripts/plan_lint.py` and `scripts/build_icm_map.py --check`) pass.

## Next Sprint

Sprint 02: Identity and permissions (`sprint-02-identity-permissions`).
