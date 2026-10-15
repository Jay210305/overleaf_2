# S09 — History review and project management

**Status:** COMPLETED | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 102 h (A-03)

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S09-T01](../../implementation/sprint-09-history-review/S09-T01-create-immutable-labeled-history-queries.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t01.md); paginated revision history, labeled checkpoints, and manifest retrieval verified |
| [S09-T02](../../implementation/sprint-09-history-review/S09-T02-compare-text-tree-and-binary-revisions.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t02.md); deterministic Myers diff, tree changes by node ID, and binary changes by SHA-256 hash verified |
| [S09-T03](../../implementation/sprint-09-history-review/S09-T03-restore-file-or-project-with-version-guard.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t03.md); file and project restore with optimistic concurrency version guard verified |
| [S09-T04](../../implementation/sprint-09-history-review/S09-T04-model-reviewer-suggestions-separately.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t04.md); separate modeling of reviewer insert/delete/replace suggestions without altering canonical text verified |
| [S09-T05](../../implementation/sprint-09-history-review/S09-T05-resolve-proposals-with-explicit-conflicts.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t05.md); single and bulk suggestion acceptance/rejection with explicit context conflict detection verified |
| [S09-T06](../../implementation/sprint-09-history-review/S09-T06-preserve-current-acl-and-historical-anchors-on-restore.md) | DONE | 6 h | [Scoped test report](../test-reports/s09-t06.md); ACL and membership preservation, and detachment of historical comment anchors on restore verified |
| [S09-T07](../../implementation/sprint-09-history-review/S09-T07-verify-concurrent-review-and-file-changes.md) | DONE | 6 h | [Scoped test report](../test-reports/s09-t07.md); race condition protection, double-application prevention, and deleted file error handling verified |
| [S09-T08](../../implementation/sprint-09-history-review/S09-T08-create-explicit-restore-confirmation-ui.md) | DONE | 6 h | [Scoped test report](../test-reports/s09-t08.md); accessible WCAG 2.2 AA restore confirmation modal dialog with affected files list verified |
| [S09-T09](../../implementation/sprint-09-history-review/S09-T09-implement-archive-trash-and-permanent-deletion.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t09.md); archive, unarchive, trash, restore, and permanent deletion with owner title confirmation verified |
| [S09-T10](../../implementation/sprint-09-history-review/S09-T10-implement-owned-project-tags.md) | DONE | 6 h | [Scoped test report](../test-reports/s09-t10.md); user-owned colored project tags and tag-based project filtering verified |
| [S09-T11](../../implementation/sprint-09-history-review/S09-T11-implement-permission-aware-bulk-project-actions.md) | DONE | 6 h | [Scoped test report](../test-reports/s09-t11.md); permission-aware bulk project archive, trash, restore, and tag operations verified |
| [S09-T12](../../implementation/sprint-09-history-review/S09-T12-implement-explicit-ownership-transfer.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t12.md); explicit expiring ownership transfer offers with atomic transfer and former owner retention verified |
| [S09-T13](../../implementation/sprint-09-history-review/S09-T13-export-authorized-user-data.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t13.md); GDPR-compliant personal data export generation excluding secrets and credentials verified |
| [S09-T14](../../implementation/sprint-09-history-review/S09-T14-delete-account-under-shared-ownership-rules.md) | DONE | 8 h | [Scoped test report](../test-reports/s09-t14.md); account deletion enforcing sole-owner project transfer/deletion, session revocation, and audit logging verified |

## Decisions and Migrations

- Created dedicated branch `codex/sprint-09-history-review` tracking `origin/codex/sprint-09-history-review`.
- Implemented immutable revision querying in `apps/api/src/modules/history/routes.ts` (`GET /api/v1/projects/:projectId/revisions` and `GET /api/v1/projects/:projectId/revisions/:revisionNo`).
- Implemented deterministic Myers text diff and SHA-256 tree/binary comparison in `packages/latex/src/diff.ts` and `apps/web/src/features/history/diff.ts`.
- Implemented optimistic concurrency version guarded restore in `apps/api/src/modules/history/restore.ts` (`POST /api/v1/projects/:projectId/restore`), ensuring restores create immutable revisions with `source = 'restore'`.
- Implemented reviewer suggestion workflow in `apps/api/src/modules/review/suggestions.ts` (`POST` and `GET /api/v1/projects/:projectId/suggestions`), keeping canonical Yjs text untouched until resolution.
- Implemented suggestion resolution and conflict detection in `apps/api/src/modules/review/resolve.ts` (`POST /api/v1/projects/:projectId/suggestions/:suggestionId/resolve` and `/api/v1/projects/:projectId/suggestions/bulk-resolve`).
- Preserved current ACL, memberships, and owner rights across all restore operations in `apps/api/src/modules/history/restore-metadata.ts`, automatically detaching historical comment anchors pointing to modified or removed text spans.
- Built accessible WCAG 2.2 AA restore confirmation dialog in `apps/web/src/features/history/restore-dialog.tsx`.
- Implemented project lifecycle states (`active`, `archived`, `trashed`) and permanent deletion with confirmation title match in `apps/api/src/modules/projects/lifecycle.ts`.
- Implemented user-owned tags with unique names and hex colors in `apps/api/src/modules/tags/routes.ts` and tag filtering in `ProjectRepository.list`.
- Implemented permission-aware bulk project actions in `apps/api/src/modules/projects/bulk.ts` (`POST /api/v1/projects/bulk`), evaluating permissions per-project without cross-tenant leakage.
- Implemented explicit ownership transfer workflow in `apps/api/src/modules/projects/ownership.ts` with database table `project_ownership_offers` in `packages/db/migrations/0002-support.sql`.
- Implemented GDPR user data export in `apps/jobs/src/exports/user-data.ts` and endpoint `POST /api/v1/me/data-export`.
- Implemented account deletion under shared ownership rules in `apps/api/src/modules/account/delete-account.ts`, rejecting deletion with 409 `SOLE_OWNER_CONFLICT` if owned projects remain, revoking all active sessions, and clearing session cookies.

## Validation

- Comprehensive test suite covering all 14 tasks: 27 test files, 62 tests PASS (all integration and regression tests for COL-03, COL-06, COL-08, COL-09, COL-10, COL-11, COL-12, NFR-06, NFR-08, PRO-06, PRO-08, PRO-09, PRO-12, PRO-13, ACC-02, ACC-07).
- Monorepo quality gates:
  - `pnpm typecheck`: PASS (0 errors).
  - `pnpm lint`: PASS (0 errors).
  - `pnpm build`: PASS (all packages and applications build cleanly).
  - `python3 scripts/plan_lint.py`: PASS (184 tasks, 93 requirements, 16 stages).
  - `python3 scripts/build_icm_map.py --check`: PASS (all ICM maps and file inventories valid).

## Next Task

Sprint 09 is completed. Ready for Sprint 10 (`sprint-10-academic-editing`).
