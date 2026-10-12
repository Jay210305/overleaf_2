# S03 — Projects and file tree

**Status:** DONE (9/9 tasks accepted) | **Owner:** Project Co-owner (proposed A-02) | **Estimate:** 66 h (A-03) | **Actual:** 66 h

## Task Matrix

| ID | Status | Actual hours | Evidence |
|---|---|---|---|
| [S03-T01](../../implementation/sprint-03-projects-files/S03-T01-implement-project-crud-and-pagination.md) | DONE | 8 | [Scoped report](../test-reports/s03-t01.md); verified 2026-10-12 |
| [S03-T02](../../implementation/sprint-03-projects-files/S03-T02-create-duplicate-and-rename-project-sources.md) | DONE | 8 | [Scoped report](../test-reports/s03-t02.md); verified 2026-10-12 |
| [S03-T03](../../implementation/sprint-03-projects-files/S03-T03-create-api-backed-dashboard.md) | DONE | 8 | [Scoped report](../test-reports/s03-t03.md); verified 2026-10-12 |
| [S03-T04](../../implementation/sprint-03-projects-files/S03-T04-implement-id-based-file-tree-mutations.md) | DONE | 8 | [Scoped report](../test-reports/s03-t04.md); verified 2026-10-12 |
| [S03-T09](../../implementation/sprint-03-projects-files/S03-T09-verify-transaction-safe-move-rename-and-delete.md) | DONE | 6 | [Scoped report](../test-reports/s03-t09.md); verified 2026-10-12 |
| [S03-T05](../../implementation/sprint-03-projects-files/S03-T05-create-file-tree-interactions.md) | DONE | 8 | [Scoped report](../test-reports/s03-t05.md); verified 2026-10-12 |
| [S03-T06](../../implementation/sprint-03-projects-files/S03-T06-implement-project-root-and-compiler-settings.md) | DONE | 6 | [Scoped report](../test-reports/s03-t06.md); verified 2026-10-12 |
| [S03-T07](../../implementation/sprint-03-projects-files/S03-T07-create-structural-revision-manifests.md) | DONE | 8 | [Scoped report](../test-reports/s03-t07.md); verified 2026-10-12 |
| [S03-T08](../../implementation/sprint-03-projects-files/S03-T08-verify-project-and-tree-journey.md) | DONE | 6 | [Scoped report](../test-reports/s03-t08.md); verified 2026-10-12 |

## Decisions and Migrations

- Branch: `codex/sprint-03-projects-files` tracking `origin/codex/sprint-03-projects-files`; base `415baa0` (accepted closure of Sprint 02).
- S03-T01 implements project CRUD and pagination routes in `apps/api/src/modules/projects/routes.ts` and `create.ts`. Initial project creation establishes default root `main.tex` and text_documents record. Pagination supports cursor, filters (`owned`, `shared`, `recent`, `archived`, `trashed`), search query `q`, and ordering by `updatedAt` or `owner`.
- S03-T02 implements blank project creation, project cloning (`POST /projects/:id/clone`) and rename (`PATCH /projects/:id`) in `apps/api/src/modules/projects/clone.ts` and `routes.ts`. Cloning duplicates tree nodes and text document contents with zero membership inheritance and zero external secrets.
- S03-T03 implements the accessible Projects Dashboard in `apps/web/src/features/projects/dashboard.tsx` with search, filter tabs, sorting, pagination, blank project creation modal, clone action, rename modal, delete action, and WCAG 2.2 AA accessibility.
- S03-T04 implements ID-based file tree mutations in `apps/api/src/modules/files/tree.ts` (`GET/POST /nodes`, `PATCH /nodes/:id`, `PATCH /nodes/:id/move`, `PATCH /nodes/:id/rename`, `DELETE /nodes/:id`) with cycle detection, foreign parent check, sibling collision checks, optimistic locking, and recursive soft deletion.
- S03-T09 verifies transaction-safe move, rename and delete under concurrent operations and races (duplicate sibling creation, mutual cycle moves, stale If-Match precondition, delete vs create/move races, and PL-06 database constraints).
- S03-T05 implements accessible file tree interactions in `apps/web/src/features/files/file-tree.tsx` with modal dialogs, toolbar actions, tree keyboard navigation, client-side path validation, and automatic recovery from 409/403 errors without phantom nodes.
- S03-T06 implements project root and compiler settings in `apps/api/src/modules/projects/settings.ts` and `apps/web/src/features/projects/settings.tsx`, enforcing same-project active .tex root file (PRO-07), allowlisted compiler engines (EDT-12), and server-bounded timeout policy.
- S03-T07 implements structural revision manifests in `packages/db/src/repositories/revisions.ts` (`RevisionsRepository.createStructuralRevision`, `getRevision`, `compareRevisions`), pinning deterministic canonical paths and reproducible SHA-256 manifest hashes (NFR-06, COL-10).
- S03-T08 implements end-to-end browser project and file tree journey verification in `tests/e2e/project-tree.spec.ts` (Playwright E2E on Chromium), integration verification in `tests/integration/s03-t08.test.ts`, and regressions `tests/regression/pro-01/s03-t08.test.ts` and `tests/regression/pro-04/s03-t08.test.ts`. Confirmed persistent create/rename/open/create-node/move/delete journey across reload, strict cross-project access isolation, and zero WCAG 2.2 AA accessibility violations via `@axe-core/playwright`.

## Validation

All 9 S03 tasks have scoped local evidence and passed test suites:
- S03-T01: PASS on `tests/integration/s03-t01.test.ts`, `tests/regression/pro-01/s03-t01.test.ts`, `tests/regression/pro-03/s03-t01.test.ts`, `tests/regression/col-03/s03-t01.test.ts`.
- S03-T02: PASS on `tests/integration/s03-t02.test.ts`, `tests/regression/pro-02/s03-t02.test.ts`, `tests/regression/pro-03/s03-t02.test.ts`.
- S03-T03: PASS on `tests/integration/s03-t03.test.ts`, `tests/regression/pro-01/s03-t03.test.ts`, `tests/regression/nfr-08/s03-t03.test.ts`.
- S03-T04: PASS on `tests/integration/s03-t04.test.ts`, `tests/regression/pro-04/s03-t04.test.ts`.
- S03-T09: PASS on `tests/integration/tree-races.test.ts`, `tests/integration/s03-t09.test.ts`, `tests/regression/pro-04/s03-t09.test.ts`, `tests/regression/pl-06/s03-t09.test.ts`.
- S03-T05: PASS on `tests/integration/s03-t05.test.ts`, `tests/regression/pro-04/s03-t05.test.ts`, `tests/regression/nfr-08/s03-t05.test.ts`.
- S03-T06: PASS on `tests/integration/s03-t06.test.ts`, `tests/regression/pro-07/s03-t06.test.ts`, `tests/regression/edt-12/s03-t06.test.ts`.
- S03-T07: PASS on `tests/integration/s03-t07.test.ts`, `tests/regression/nfr-06/s03-t07.test.ts`, `tests/regression/col-10/s03-t07.test.ts`.
- S03-T08: PASS on `tests/e2e/project-tree.spec.ts`, `tests/integration/s03-t08.test.ts`, `tests/regression/pro-01/s03-t08.test.ts`, `tests/regression/pro-04/s03-t08.test.ts`.

## Risks and Debt

Track actual findings in Open Gaps and Technical Debt, referencing the task.
- Optimistic concurrency on tree version requires client retry on 409 Conflict.
- Large trees should consider virtualized rendering in future scale sprints.

## Next Sprint

[S04 — Code editor](../../implementation/sprint-04-code-editor/CONTEXT.md) begins with [S04-T01 Create LaTeX CodeMirror extensions](../../implementation/sprint-04-code-editor/S04-T01-create-latex-codemirror-extensions.md).
